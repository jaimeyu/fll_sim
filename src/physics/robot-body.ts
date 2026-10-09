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
  public wheelRadius = 0.028; // 56mm / 2 = 28mm
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
      .setLinearDamping(0.2)
      .setAngularDamping(0.8)
      .setAdditionalMass(rootCluster.totalMassKg);

    this.chassisBody = this.world.createRigidBody(chassisDesc);

    // Add main chassis frame colliders (elevated slightly above ground)
    for (const c of rootCluster.colliders) {
      const colDesc = RAPIER.ColliderDesc.cuboid(
        c.halfExtents ? c.halfExtents[0] : 0.05,
        c.halfExtents ? c.halfExtents[1] : 0.015,
        c.halfExtents ? c.halfExtents[2] : 0.06
      )
        .setTranslation(c.offset[0], c.offset[1], c.offset[2])
        .setFriction(c.friction)
        .setRestitution(c.restitution);

      this.world.createCollider(colDesc, this.chassisBody);
    }

    // Add rear frictionless caster skid ball directly to chassis
    // Radius 10mm, touching ground at Y=0 when chassis center is at Y=0.035
    const skidCollider = RAPIER.ColliderDesc.ball(0.01)
      .setTranslation(0, -0.025, -0.065)
      .setFriction(0.005) // Smooth glide
      .setRestitution(0.0);
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
          .setAdditionalMass(cluster.totalMassKg);

        const wheelBody = this.world.createRigidBody(wheelDesc);
        const col = cluster.colliders[0];
        const wheelColliderDesc = RAPIER.ColliderDesc.cylinder(
          col?.halfHeight || 0.013,
          col?.radius || 0.028
        )
          .setRotation({ x: 0, y: 0, z: 0.7071, w: 0.7071 }) // Cylinder axis along X
          .setFriction(1.0) // High rubber traction
          .setRestitution(0.02);

        this.world.createCollider(wheelColliderDesc, wheelBody);
        this.wheelBodies.set(cluster.clusterId, wheelBody);

        // Revolute joint connecting wheel to chassis
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

        impulseJoint.setMotorMaxForce(15.0);
        impulseJoint.configureMotorVelocity(0.0, 10.0);

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
   * Applies motor target speeds to Rapier wheel revolute joints each physics tick
   */
  public updateMotors(dt: number): void {
    const motorA = this.motors.get('A'); // Left motor
    const motorB = this.motors.get('B'); // Right motor

    if (motorA) {
      const targetDegPerSec = motorA.step(dt);
      const targetRadPerSec = (targetDegPerSec * Math.PI) / 180;
      for (const [id, joint] of this.joints.entries()) {
        const jointSpec = this.spec.joints.find((j) => j.jointId === id);
        if (jointSpec?.motorPort === 'A' || jointSpec?.anchorParent[0]! < 0) {
          joint.configureMotorVelocity(targetRadPerSec, 10.0);
        }
      }
    }

    if (motorB) {
      const targetDegPerSec = motorB.step(dt);
      const targetRadPerSec = (targetDegPerSec * Math.PI) / 180;
      for (const [id, joint] of this.joints.entries()) {
        const jointSpec = this.spec.joints.find((j) => j.jointId === id);
        if (jointSpec?.motorPort === 'B' || jointSpec?.anchorParent[0]! > 0) {
          joint.configureMotorVelocity(targetRadPerSec, 10.0);
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
}
