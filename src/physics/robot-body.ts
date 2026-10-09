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
      const colDesc = RAPIER.ColliderDesc.cuboid(
        c.halfExtents ? c.halfExtents[0] : 0.044, // 88mm width leaving clearance to wheels
        c.halfExtents ? c.halfExtents[1] : 0.015,
        c.halfExtents ? c.halfExtents[2] : 0.06
      )
        // Center of mass shifted to Z = -0.025m (between wheels at Z=0 and rear skid at Z=-0.065)
        // achieving standard 60/40 differential drive weight distribution for static tripod stability
        .setTranslation(c.offset[0], c.offset[1], -0.025)
        .setFriction(c.friction)
        .setRestitution(0.0) // Completely inelastic to eliminate bouncing
        .setMass(rootCluster.totalMassKg);

      this.world.createCollider(colDesc, this.chassisBody);
    }

    // Add rear frictionless caster skid ball directly to chassis
    // Lowest point: -0.025 - 0.010 = -0.035m, exactly coplanar with wheel bottoms (-0.007 - 0.028 = -0.035m)
    const skidCollider = RAPIER.ColliderDesc.ball(0.01)
      .setTranslation(0, -0.025, -0.065)
      .setFriction(0.005) // Smooth glide
      .setRestitution(0.0)
      .setDensity(0.0); // Zero density so mass is determined strictly by the chassis body mass
    this.world.createCollider(skidCollider, this.chassisBody);

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

          const wAng = wb.angvel();
          // Current wheel spin velocity along the axle
          const currentSpin = wAng.x * ux + wAng.y * uy + wAng.z * uz;

          if (isIdle) {
            // No torque when idle
          } else {
            this.chassisBody.wakeUp();
            wb.wakeUp();

            const spinError = targetRadPerSec - currentSpin;
            const Kp = 0.35; // Proportional velocity governor
            const maxTorque = 0.45; // 0.45 Nm peak torque (LEGO SPIKE large motor)
            const torque = Math.max(-maxTorque, Math.min(maxTorque, spinError * Kp));

            // Apply drive torque to wheel and equal-and-opposite reaction torque to chassis
            wb.addTorque({ x: -torque * ux, y: -torque * uy, z: -torque * uz }, true);
            this.chassisBody.addTorque({ x: torque * ux, y: torque * uy, z: torque * uz }, true);
          }
        }
      }
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
