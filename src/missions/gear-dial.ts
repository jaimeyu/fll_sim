import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { MissionElement } from './types';

/**
 * Rotary Gear Turnstile Mission Mechanism
 *
 * Implements a rotating 4-spoke gear turnstile with an indicator dial.
 * When the robot bumper or attachment pushes against any of the paddle arms,
 * the vertical shaft turns 90 degrees, latching into the scored position and raising a flag.
 */
export class GearDialMission implements MissionElement {
  public readonly id = 'gear-dial';
  public readonly name = 'Mission 2: Rotary Gear Turnstile';
  public readonly description = 'Drive into the blue paddle arms to rotate the turnstile 90 degrees and activate the green indicator flag.';
  public readonly rootGroup: THREE.Group;

  private world!: RAPIER.World;
  private basePos: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };

  // Physics Bodies
  private pedestalBody!: RAPIER.RigidBody;
  private rotorBody!: RAPIER.RigidBody;

  // Joint
  private joint!: RAPIER.RevoluteImpulseJoint;

  // Visual Meshes
  private pedestalMesh!: THREE.Mesh;
  private rotorMesh!: THREE.Group;
  private flagMesh!: THREE.Mesh;

  private initialAngle = 0;

  constructor() {
    this.rootGroup = new THREE.Group();
  }

  public init(world: RAPIER.World, basePosition: { x: number; y: number; z: number }): void {
    this.world = world;
    this.basePos = { ...basePosition };

    this.createPhysicsBodies();
    this.createVisualMeshes();
    this.syncVisuals();
  }

  private createPhysicsBodies(): void {
    const { x, y, z } = this.basePos;
    const yAxis = { x: 0, y: 1, z: 0 };

    // 1. Pedestal Base (Fixed)
    const baseDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y + 0.03, z);
    this.pedestalBody = this.world.createRigidBody(baseDesc);
    this.world.createCollider(RAPIER.ColliderDesc.cylinder(0.03, 0.045), this.pedestalBody);

    // 2. Rotor with 4 Paddle Blades (Dynamic revolute body around Y)
    const rotorDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y + 0.075, z)
      .setAngularDamping(2.0)
      .setLinearDamping(4.0);
    this.rotorBody = this.world.createRigidBody(rotorDesc);

    // Cross paddle colliders (Arm 1 along X, Arm 2 along Z)
    const arm1Collider = RAPIER.ColliderDesc.cuboid(0.075, 0.015, 0.012).setDensity(1.5).setFriction(0.7);
    const arm2Collider = RAPIER.ColliderDesc.cuboid(0.012, 0.015, 0.075).setDensity(1.5).setFriction(0.7);
    this.world.createCollider(arm1Collider, this.rotorBody);
    this.world.createCollider(arm2Collider, this.rotorBody);

    // Revolute Joint around Y axis with 90-degree scoring stop limit
    this.joint = this.world.createImpulseJoint(
      RAPIER.JointData.revolute({ x: 0, y: 0.045, z: 0 }, { x: 0, y: 0, z: 0 }, yAxis),
      this.pedestalBody,
      this.rotorBody,
      true
    ) as RAPIER.RevoluteImpulseJoint;
    this.joint.setContactsEnabled(false);
    this.joint.setLimits(0.0, Math.PI / 2);

    // Configure joint friction to resist rotation and latch position
    this.joint.configureMotorVelocity(0.0, 2.5);
    this.joint.setMotorMaxForce(0.02);

    this.initialAngle = this.getRotationAngle();
  }

  private createVisualMeshes(): void {
    // 1. Pedestal Mesh (Dark slate cylinder)
    const pedGeom = new THREE.CylinderGeometry(0.045, 0.055, 0.07, 24);
    const pedMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 });
    this.pedestalMesh = new THREE.Mesh(pedGeom, pedMat);
    this.pedestalMesh.castShadow = true;
    this.pedestalMesh.receiveShadow = true;
    this.rootGroup.add(this.pedestalMesh);

    // 2. Rotor Mesh (4 cross paddle blades)
    this.rotorMesh = new THREE.Group();

    // Central hub
    const hubGeom = new THREE.CylinderGeometry(0.02, 0.02, 0.045, 16);
    const hubMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.3 });
    const hubMesh = new THREE.Mesh(hubGeom, hubMat);
    this.rotorMesh.add(hubMesh);

    // Paddle Arms (Cross blades)
    const bladeGeom = new THREE.BoxGeometry(0.15, 0.035, 0.015);
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.3 });
    const blade1 = new THREE.Mesh(bladeGeom, bladeMat);
    blade1.castShadow = true;
    this.rotorMesh.add(blade1);

    const blade2 = new THREE.Mesh(bladeGeom, bladeMat);
    blade2.rotation.y = Math.PI / 2;
    blade2.castShadow = true;
    this.rotorMesh.add(blade2);

    // Indicator Flag on Top
    const flagGeom = new THREE.BoxGeometry(0.04, 0.025, 0.005);
    const flagMat = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.2 });
    this.flagMesh = new THREE.Mesh(flagGeom, flagMat);
    this.flagMesh.position.set(0.02, 0.035, 0);
    this.rotorMesh.add(this.flagMesh);

    this.rootGroup.add(this.rotorMesh);
  }

  public update(_dt: number): void {
    // Handled by physics step
  }

  public syncVisuals(): void {
    if (!this.pedestalBody) return;

    // Pedestal
    const pP = this.pedestalBody.translation();
    const pR = this.pedestalBody.rotation();
    this.pedestalMesh.position.set(pP.x, pP.y, pP.z);
    this.pedestalMesh.quaternion.set(pR.x, pR.y, pR.z, pR.w);

    // Rotor
    const rP = this.rotorBody.translation();
    const rR = this.rotorBody.rotation();
    this.rotorMesh.position.set(rP.x, rP.y, rP.z);
    this.rotorMesh.quaternion.set(rR.x, rR.y, rR.z, rR.w);
  }

  private getRotationAngle(): number {
    if (!this.rotorBody) return 0;
    const rot = this.rotorBody.rotation();
    // Yaw angle around Y
    const siny_cosp = 2 * (rot.w * rot.y - rot.z * rot.x);
    const cosy_cosp = 1 - 2 * (rot.y * rot.y + rot.x * rot.x);
    return Math.atan2(siny_cosp, cosy_cosp);
  }

  public reset(): void {
    const { x, y, z } = this.basePos;
    const zeroVel = { x: 0, y: 0, z: 0 };
    const identQuat = { x: 0, y: 0, z: 0, w: 1 };

    this.pedestalBody.setTranslation({ x, y: y + 0.03, z }, true);
    this.pedestalBody.setRotation(identQuat, true);

    this.rotorBody.setTranslation({ x, y: y + 0.075, z }, true);
    this.rotorBody.setRotation(identQuat, true);
    this.rotorBody.setLinvel(zeroVel, true);
    this.rotorBody.setAngvel(zeroVel, true);

    this.initialAngle = 0;
    this.syncVisuals();
  }

  public setPosition(pos: { x: number; y: number; z: number }): void {
    this.basePos = { ...pos };
    this.reset();
  }

  public getPosition(): { x: number; y: number; z: number } {
    return { ...this.basePos };
  }

  public isSolved(): boolean {
    const angleDeltaDeg = (Math.abs(this.getRotationAngle() - this.initialAngle) * 180) / Math.PI;
    return angleDeltaDeg >= 75;
  }

  public getScore(): number {
    const angleDeltaDeg = (Math.abs(this.getRotationAngle() - this.initialAngle) * 180) / Math.PI;
    return Math.min(100, Math.max(0, Math.round((angleDeltaDeg / 90) * 100)));
  }

  public getInteractiveMeshes(): THREE.Object3D[] {
    return this.rotorMesh ? [this.rotorMesh] : [];
  }

  public applyUserDrag(groundTarget: THREE.Vector3): void {
    if (!this.rotorBody) return;
    const dx = groundTarget.x - this.basePos.x;
    const dz = groundTarget.z - this.basePos.z;
    const targetAngle = Math.atan2(dz, dx);
    const currentAngle = this.getRotationAngle();
    let diff = targetAngle - currentAngle;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    this.rotorBody.setAngvel({ x: 0, y: diff * 8.0, z: 0 }, true);
  }

  public destroy(): void {
    if (this.joint) this.world.removeImpulseJoint(this.joint, true);
    if (this.pedestalBody) this.world.removeRigidBody(this.pedestalBody);
    if (this.rotorBody) this.world.removeRigidBody(this.rotorBody);
    this.rootGroup.clear();
  }
}
