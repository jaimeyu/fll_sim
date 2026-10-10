import RAPIER from '@dimforge/rapier3d-compat';
import { RobotAssemblySpec } from '../cad/types';
import { VirtualMotor, MotorPort } from './motor-controller';

export interface SpawnPose {
  x: number;
  y: number;
  z: number;
  yawDegrees: number;
}

export class RobotPhysicsBody {
  public world: RAPIER.World;
  public spec: RobotAssemblySpec;
  public chassisBody!: RAPIER.RigidBody;
  public wheelBodies: Map<string, RAPIER.RigidBody> = new Map();
  public motors: Map<MotorPort, VirtualMotor> = new Map();
  public joints: Map<string, RAPIER.UnitImpulseJoint> = new Map();

  // Robot physical specs
  public wheelRadius = 0.028; // 56mm diameter / 2 = 28mm radius
  public trackWidth = 0.128; // 128mm (16 studs)

  constructor(world: RAPIER.World, spec: RobotAssemblySpec, spawnPose: SpawnPose) {
    this.world = world;
    this.spec = spec;
    this.spawn(spawnPose);
  }

  public spawn(pose: SpawnPose): void {
    const yawRad = (pose.yawDegrees * Math.PI) / 180;
    const halfYaw = yawRad / 2;
    const qy = Math.sin(halfYaw);
    const qw = Math.cos(halfYaw);

    const cosY = Math.cos(yawRad);
    const sinY = Math.sin(yawRad);

    const rotateLocal = (dx: number, dy: number, dz: number) => ({
      x: dx * cosY + dz * sinY,
      y: dy,
      z: -dx * sinY + dz * cosY,
    });

    // 1. Root Chassis Rigid Body
    const rootCluster = this.spec.clusters.find((c) => c.isRootChassis) || this.spec.clusters[0];
    const chassisDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pose.x, pose.y, pose.z)
      .setRotation({ x: 0, y: qy, z: 0, w: qw })
      .setLinearDamping(0.5)
      .setAngularDamping(2.0)
      .setAdditionalMass(rootCluster.totalMassKg);

    this.chassisBody = this.world.createRigidBody(chassisDesc);

    // Add main chassis frame colliders (elevated slightly above ground)
    for (const c of rootCluster.colliders) {
      if (c.shape === 'sphere') {
        const sphereDesc = RAPIER.ColliderDesc.ball(c.radius || 0.01)
          .setTranslation(c.offset[0], c.offset[1], c.offset[2])
          .setFriction(c.friction ?? 0.0)
          .setRestitution(0.0)
          .setDensity(0.0);
        this.world.createCollider(sphereDesc, this.chassisBody);
      } else {
        const colDesc = RAPIER.ColliderDesc.cuboid(
          c.halfExtents ? c.halfExtents[0] : 0.044,
          c.halfExtents ? c.halfExtents[1] : 0.012,
          c.halfExtents ? c.halfExtents[2] : 0.050
        )
          .setTranslation(c.offset[0], c.offset[1], c.offset[2])
          .setFriction(c.friction)
          .setRestitution(0.0)
          .setMass(rootCluster.totalMassKg);
        this.world.createCollider(colDesc, this.chassisBody);
      }
    }

    // 2. Drive Wheels & Revolute Joints
    const nonRootClusters = this.spec.clusters.filter((c) => !c.isRootChassis);
    for (const cluster of nonRootClusters) {
      if (cluster.name === 'Drive Wheel') {
        const jointSpec = this.spec.joints.find((j) => j.childClusterId === cluster.clusterId);
        const anchor = jointSpec?.anchorParent || [0, 0, 0];
        const port = jointSpec?.motorPort || (anchor[0] < 0 ? 'A' : 'B');

        // Rotate wheel local position into world space
        const rotatedAnchor = rotateLocal(anchor[0], anchor[1], anchor[2]);
        const wheelPos = {
          x: pose.x + rotatedAnchor.x,
          y: pose.y + rotatedAnchor.y,
          z: pose.z + rotatedAnchor.z,
        };

        const wheelDesc = RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(wheelPos.x, wheelPos.y, wheelPos.z)
          .setRotation({ x: 0, y: qy, z: 0, w: qw })
          .setLinearDamping(0.2)
          .setAngularDamping(0.5);

        const wheelBody = this.world.createRigidBody(wheelDesc);
        // Use roundCylinder with 3mm rounded tire edge radius (total radius 28mm, width 26mm).
        // This models the rounded rubber tire crown and eliminates sharp cylinder edge singularities
        // that cause normal-flipping contact impulses on flat surfaces.
        const wheelColliderDesc = RAPIER.ColliderDesc.roundCylinder(
          0.010, // halfHeight core
          0.025, // radius core
          0.003  // borderRadius: 0.025 + 0.003 = 0.028m radius (56mm diameter)
        )
          .setRotation({ x: 0, y: 0, z: 0.7071, w: 0.7071 }) // Cylinder axis along X
          .setFriction(0.9) // High rubber traction
          .setRestitution(0.0) // Completely inelastic
          .setMass(cluster.totalMassKg || 0.04);

        this.world.createCollider(wheelColliderDesc, wheelBody);
        this.wheelBodies.set(cluster.clusterId, wheelBody);

        // Revolute joint connecting wheel to chassis (mechanical axle constraint)
        const anchorChassis = { x: anchor[0], y: anchor[1], z: anchor[2] };
        const anchorWheel = { x: 0, y: 0, z: 0 };
        const axis = { x: 1, y: 0, z: 0 };

        const jointParams = RAPIER.JointData.revolute(anchorChassis, anchorWheel, axis);
        const impulseJoint = this.world.createImpulseJoint(
          jointParams,
          this.chassisBody,
          wheelBody,
          true
        ) as RAPIER.UnitImpulseJoint;

        // Disable contact solver between wheel and chassis bodies to avoid jitter
        impulseJoint.setContactsEnabled(false);
        // Free rotation around axle: motors exert direct physical torque rather than constraint velocity
        impulseJoint.setMotorMaxForce(0.0);
        impulseJoint.configureMotorVelocity(0.0, 0.0);

        if (jointSpec) {
          this.joints.set(jointSpec.jointId, impulseJoint);
        }

        // Register virtual motor
        if (port) {
          this.motors.set(port, new VirtualMotor(port));
        }
      }
    }

    // Ensure all 6 standard SPIKE Prime ports (A-F) are initialized
    const allPorts: MotorPort[] = ['A', 'B', 'C', 'D', 'E', 'F'];
    for (const p of allPorts) {
      if (!this.motors.has(p)) {
        this.motors.set(p, new VirtualMotor(p));
      }
    }
  }

  /**
   * Set continuous driving speeds for left (Port A) and right (Port B) drivebase
   */
  public setDriveSpeeds(leftPercent: number, rightPercent: number): void {
    const motorL = this.motors.get('A');
    const motorR = this.motors.get('B');
    if (Math.abs(leftPercent) < 0.1) {
      motorL?.stop('BRAKE');
    } else {
      motorL?.start(leftPercent);
    }
    if (Math.abs(rightPercent) < 0.1) {
      motorR?.stop('BRAKE');
    } else {
      motorR?.start(rightPercent);
    }
    if (Math.abs(leftPercent) < 0.1 && Math.abs(rightPercent) < 0.1) {
      for (const wb of this.wheelBodies.values()) {
        wb.setAngularDamping(15.0);
        wb.setAngvel({ x: 0, y: 0, z: 0 }, false);
      }
    }
  }

  /**
   * Set continuous speed for a specific motor port
   */
  public setMotorSpeed(port: MotorPort, speedPercent: number): void {
    const motor = this.motors.get(port);
    if (!motor) return;
    if (Math.abs(speedPercent) < 0.1) {
      motor.stop('BRAKE');
    } else {
      motor.start(speedPercent);
    }
  }

  /**
   * Stop an individual motor port with electromagnetic brake
   */
  public stopMotor(port: MotorPort): void {
    this.motors.get(port)?.stop('BRAKE');
  }

  /**
   * Applies motor target speeds using direct speed-governed physical torque each physics tick.
   * This accurately reflects real-world LEGO SPIKE large motors (0.25-0.45 Nm torque) without
   * triggering Rapier constraint-solver fighting on high-friction mats.
   */
  public updateMotors(dt: number): void {
    const rot = this.chassisBody.rotation();
    // Axle unit vector in world space: rotate local axle (1, 0, 0) by chassis orientation quaternion
    const ux = 1 - 2 * (rot.y * rot.y + rot.z * rot.z);
    const uy = 2 * (rot.x * rot.y + rot.z * rot.w);
    const uz = 2 * (rot.x * rot.z - rot.y * rot.w);

    const nonRootClusters = this.spec.clusters.filter((c) => !c.isRootChassis);

    for (const [port, motor] of this.motors.entries()) {
      const targetDegPerSec = motor.step(dt);
      const isIdle = Math.abs(targetDegPerSec) < 0.1;
      const targetRadPerSec = (targetDegPerSec * Math.PI) / 180;

      for (const cluster of nonRootClusters) {
        if (cluster.name === 'Drive Wheel') {
          const jointSpec = this.spec.joints.find((j) => j.childClusterId === cluster.clusterId);
          const isPortMatch =
            jointSpec?.motorPort === port ||
            (port === 'A' && (jointSpec?.anchorParent[0] ?? 0) < 0) ||
            (port === 'B' && (jointSpec?.anchorParent[0] ?? 0) > 0);

          if (!isPortMatch) continue;

          const wb = this.wheelBodies.get(cluster.clusterId);
          if (!wb) continue;

          if (isIdle) {
            // High angular damping naturally dissipates spin without feedback torque oscillation
            wb.setAngularDamping(15.0);
            const wAng = wb.angvel();
            const currentSpin = wAng.x * ux + wAng.y * uy + wAng.z * uz;
            if (Math.abs(currentSpin) < 0.08) {
              wb.setAngvel({ x: 0, y: 0, z: 0 }, false);
            }
          } else {
            this.chassisBody.wakeUp();
            wb.wakeUp();
            wb.setAngularDamping(0.2);

            const wAng = wb.angvel();
            const currentSpin = wAng.x * ux + wAng.y * uy + wAng.z * uz;
            const spinError = targetRadPerSec - currentSpin;
            const Kp = 0.005; // Smooth stable velocity governor for low-inertia wheels
            const maxTorque = 0.06; // 0.06 Nm max drive torque eliminates slippage and reaction flipping
            const torque = Math.max(-maxTorque, Math.min(maxTorque, spinError * Kp));

            wb.addTorque({ x: torque * ux, y: torque * uy, z: torque * uz }, true);
          }
        }
      }
    }
  }

  /**
   * Immediately stops all virtual drive and auxiliary motors with electromagnetic brake
   */
  public stopAllMotors(): void {
    for (const motor of this.motors.values()) {
      motor.stop('BRAKE');
    }
    for (const wb of this.wheelBodies.values()) {
      wb.setAngularDamping(15.0);
      wb.setAngvel({ x: 0, y: 0, z: 0 }, false);
    }
  }

  public getYawDegrees(): number {
    const rot = this.chassisBody.rotation();
    const siny_cosp = 2 * (rot.w * rot.y - rot.z * rot.x);
    const cosy_cosp = 1 - 2 * (rot.y * rot.y + rot.x * rot.x);
    const yawRad = Math.atan2(siny_cosp, cosy_cosp);
    return (yawRad * 180) / Math.PI;
  }

  public getPosition(): { x: number; y: number; z: number } {
    return this.chassisBody.translation();
  }

  public reset(pose: SpawnPose): void {
    const yawRad = (pose.yawDegrees * Math.PI) / 180;
    const halfYaw = yawRad / 2;
    const qy = Math.sin(halfYaw);
    const qw = Math.cos(halfYaw);

    const cosY = Math.cos(yawRad);
    const sinY = Math.sin(yawRad);

    const rotateLocal = (dx: number, dy: number, dz: number) => ({
      x: dx * cosY + dz * sinY,
      y: dy,
      z: -dx * sinY + dz * cosY,
    });

    // 1. Reset root chassis body
    this.chassisBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.chassisBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.chassisBody.setTranslation({ x: pose.x, y: pose.y, z: pose.z }, true);
    this.chassisBody.setRotation({ x: 0, y: qy, z: 0, w: qw }, true);

    // 2. Reset wheel bodies
    const nonRootClusters = this.spec.clusters.filter((c) => !c.isRootChassis);
    for (const cluster of nonRootClusters) {
      if (cluster.name === 'Drive Wheel') {
        const wheelBody = this.wheelBodies.get(cluster.clusterId);
        if (!wheelBody) continue;
        const jointSpec = this.spec.joints.find((j) => j.childClusterId === cluster.clusterId);
        const anchor = jointSpec?.anchorParent || [0, 0, 0];
        const rotatedAnchor = rotateLocal(anchor[0], anchor[1], anchor[2]);

        wheelBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
        wheelBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
        wheelBody.setTranslation({
          x: pose.x + rotatedAnchor.x,
          y: pose.y + rotatedAnchor.y,
          z: pose.z + rotatedAnchor.z,
        }, true);
        wheelBody.setRotation({ x: 0, y: qy, z: 0, w: qw }, true);
      }
    }

    // 3. Reset motors
    for (const motor of this.motors.values()) {
      motor.resetDegrees();
      motor.stop();
    }
  }
}
