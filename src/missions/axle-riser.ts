import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { MissionElement } from './types';

/**
 * 4-Axle Riser Mission Mechanism
 *
 * Implements a classic FIRST LEGO League 4-bar scissor toggle linkage.
 * One end is securely anchored to the field mat. Pushing the opposite end (red slider plate)
 * compresses the 4-axle linkage, forcing the middle block to elevate vertically.
 * Joint pin friction holds the assembly aloft against gravity once raised.
 */
export class AxleRiserMission implements MissionElement {
  public readonly id = 'axle-riser';
  public readonly name = 'Mission 1: 4-Axle Toggle Riser';
  public readonly description = 'Push the red slider plate toward the fixed base to elevate the middle scoring block.';
  public readonly rootGroup: THREE.Group;

  private world!: RAPIER.World;
  private basePos: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };

  // Physics Bodies
  private anchorBody!: RAPIER.RigidBody;
  private linkABody!: RAPIER.RigidBody;
  private riserBody!: RAPIER.RigidBody;
  private linkBBody!: RAPIER.RigidBody;
  private sliderBody!: RAPIER.RigidBody;

  // Joints
  private joints: RAPIER.ImpulseJoint[] = [];

  // Three.js Visual Meshes
  private anchorMesh!: THREE.Mesh;
  private linkAMesh!: THREE.Mesh;
  private riserMesh!: THREE.Group;
  private linkBMesh!: THREE.Mesh;
  private sliderMesh!: THREE.Group;

  private targetRiserY = 0.085;

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
    const zAxis = { x: 0, y: 0, z: 1 };
    const xAxis = { x: 1, y: 0, z: 0 };

    // 1. Base Anchor (Fixed firmly to field)
    const anchorDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(x - 0.10, y + 0.02, z);
    this.anchorBody = this.world.createRigidBody(anchorDesc);
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.025, 0.02, 0.035), this.anchorBody);

    // 2. Link A (Left Arm: 10cm beam)
    const linkADesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x - 0.05, y + 0.03, z)
      .setLinearDamping(1.0)
      .setAngularDamping(2.0);
    this.linkABody = this.world.createRigidBody(linkADesc);
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.045, 0.008, 0.015).setDensity(1.2),
      this.linkABody
    );

    // 3. Middle Riser Block (Scoring target)
    const riserDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y + 0.04, z)
      .setLinearDamping(1.0)
      .setAngularDamping(2.0);
    this.riserBody = this.world.createRigidBody(riserDesc);
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.022, 0.02, 0.03).setDensity(1.5),
      this.riserBody
    );

    // 4. Link B (Right Push Arm: 10cm beam)
    const linkBDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x + 0.05, y + 0.03, z)
      .setLinearDamping(1.0)
      .setAngularDamping(2.0);
    this.linkBBody = this.world.createRigidBody(linkBDesc);
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.045, 0.008, 0.015).setDensity(1.2),
      this.linkBBody
    );

    // 5. Pusher Slider Block (Target plate pushed by robot / poker)
    const sliderDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x + 0.10, y + 0.02, z)
      .setLinearDamping(2.0)
      .setAngularDamping(4.0);
    this.sliderBody = this.world.createRigidBody(sliderDesc);
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.025, 0.02, 0.045).setDensity(2.0).setFriction(0.6),
      this.sliderBody
    );

    // Joints: 4 Revolving Axles
    // Joint 1: Anchor to Link A
    const j1 = this.world.createImpulseJoint(
      RAPIER.JointData.revolute({ x: 0, y: 0, z: 0 }, { x: -0.045, y: 0, z: 0 }, zAxis),
      this.anchorBody,
      this.linkABody,
      true
    );
    // Joint 2: Link A to Riser
    const j2 = this.world.createImpulseJoint(
      RAPIER.JointData.revolute({ x: 0.045, y: 0, z: 0 }, { x: -0.022, y: 0, z: 0 }, zAxis),
      this.linkABody,
      this.riserBody,
      true
    );
    // Joint 3: Riser to Link B
    const j3 = this.world.createImpulseJoint(
      RAPIER.JointData.revolute({ x: 0.022, y: 0, z: 0 }, { x: -0.045, y: 0, z: 0 }, zAxis),
      this.riserBody,
      this.linkBBody,
      true
    );
    // Joint 4: Link B to Slider
    const j4 = this.world.createImpulseJoint(
      RAPIER.JointData.revolute({ x: 0.045, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, zAxis),
      this.linkBBody,
      this.sliderBody,
      true
    );

    // Prismatic joint constraining slider along X axis
    const jPrism = this.world.createImpulseJoint(
      RAPIER.JointData.prismatic({ x: 0.20, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, xAxis),
      this.anchorBody,
      this.sliderBody,
      true
    ) as RAPIER.PrismaticImpulseJoint;
    jPrism.setLimits(-0.16, 0.04);

    // Configure joint friction holding torque (simulating Technic friction pins)
    const revJoints = [j1, j2, j3, j4] as RAPIER.RevoluteImpulseJoint[];
    for (const j of revJoints) {
      j.configureMotorVelocity(0.0, 3.5);
      j.setMotorMaxForce(0.035); // 0.035 Nm friction resistance
    }

    this.joints = [j1, j2, j3, j4, jPrism];
  }

  private createVisualMeshes(): void {
    // 1. Anchor Mesh (Navy blue fixed base)
    const anchorGeom = new THREE.BoxGeometry(0.05, 0.04, 0.07);
    const anchorMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.4 });
    this.anchorMesh = new THREE.Mesh(anchorGeom, anchorMat);
    this.anchorMesh.castShadow = true;
    this.anchorMesh.receiveShadow = true;
    this.rootGroup.add(this.anchorMesh);

    // 2. Link A Mesh (Light slate Technic beam)
    const linkGeom = new THREE.BoxGeometry(0.09, 0.016, 0.03);
    const linkMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.5 });
    this.linkAMesh = new THREE.Mesh(linkGeom, linkMat);
    this.linkAMesh.castShadow = true;
    this.rootGroup.add(this.linkAMesh);

    // 3. Middle Riser Block (Vibrant gold scoring module with indicator cap)
    this.riserMesh = new THREE.Group();
    const riserBodyGeom = new THREE.BoxGeometry(0.044, 0.04, 0.06);
    const riserMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.3, metalness: 0.1 });
    const riserBodyMesh = new THREE.Mesh(riserBodyGeom, riserMat);
    riserBodyMesh.castShadow = true;
    this.riserMesh.add(riserBodyMesh);

    // Indicator flag on top
    const capGeom = new THREE.CylinderGeometry(0.012, 0.012, 0.015, 16);
    const capMat = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.2 });
    const capMesh = new THREE.Mesh(capGeom, capMat);
    capMesh.position.set(0, 0.026, 0);
    this.riserMesh.add(capMesh);
    this.rootGroup.add(this.riserMesh);

    // 4. Link B Mesh (Light slate Technic beam)
    this.linkBMesh = new THREE.Mesh(linkGeom, linkMat);
    this.linkBMesh.castShadow = true;
    this.rootGroup.add(this.linkBMesh);

    // 5. Slider Mesh (Coral red target pusher plate)
    this.sliderMesh = new THREE.Group();
    const sliderGeom = new THREE.BoxGeometry(0.05, 0.04, 0.09);
    const sliderMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4 });
    const sliderBox = new THREE.Mesh(sliderGeom, sliderMat);
    sliderBox.castShadow = true;
    this.sliderMesh.add(sliderBox);

    // Pusher face chevron indicator
    const faceGeom = new THREE.BoxGeometry(0.006, 0.03, 0.07);
    const faceMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const faceMesh = new THREE.Mesh(faceGeom, faceMat);
    faceMesh.position.set(0.026, 0, 0);
    this.sliderMesh.add(faceMesh);
    this.rootGroup.add(this.sliderMesh);
  }

  public update(_dt: number): void {
    // Physics is stepped globally by Rapier; internal checks can be done here
  }

  public syncVisuals(): void {
    if (!this.anchorBody) return;

    // Anchor
    const aP = this.anchorBody.translation();
    const aR = this.anchorBody.rotation();
    this.anchorMesh.position.set(aP.x, aP.y, aP.z);
    this.anchorMesh.quaternion.set(aR.x, aR.y, aR.z, aR.w);

    // Link A
    const laP = this.linkABody.translation();
    const laR = this.linkABody.rotation();
    this.linkAMesh.position.set(laP.x, laP.y, laP.z);
    this.linkAMesh.quaternion.set(laR.x, laR.y, laR.z, laR.w);

    // Riser
    const rP = this.riserBody.translation();
    const rR = this.riserBody.rotation();
    this.riserMesh.position.set(rP.x, rP.y, rP.z);
    this.riserMesh.quaternion.set(rR.x, rR.y, rR.z, rR.w);

    // Link B
    const lbP = this.linkBBody.translation();
    const lbR = this.linkBBody.rotation();
    this.linkBMesh.position.set(lbP.x, lbP.y, lbP.z);
    this.linkBMesh.quaternion.set(lbR.x, lbR.y, lbR.z, lbR.w);

    // Slider
    const sP = this.sliderBody.translation();
    const sR = this.sliderBody.rotation();
    this.sliderMesh.position.set(sP.x, sP.y, sP.z);
    this.sliderMesh.quaternion.set(sR.x, sR.y, sR.z, sR.w);
  }

  public reset(): void {
    const { x, y, z } = this.basePos;
    const zeroVel = { x: 0, y: 0, z: 0 };
    const identQuat = { x: 0, y: 0, z: 0, w: 1 };

    this.anchorBody.setTranslation({ x: x - 0.10, y: y + 0.02, z }, true);
    this.anchorBody.setRotation(identQuat, true);

    this.linkABody.setTranslation({ x: x - 0.05, y: y + 0.03, z }, true);
    this.linkABody.setRotation(identQuat, true);
    this.linkABody.setLinvel(zeroVel, true);
    this.linkABody.setAngvel(zeroVel, true);

    this.riserBody.setTranslation({ x, y: y + 0.04, z }, true);
    this.riserBody.setRotation(identQuat, true);
    this.riserBody.setLinvel(zeroVel, true);
    this.riserBody.setAngvel(zeroVel, true);

    this.linkBBody.setTranslation({ x: x + 0.05, y: y + 0.03, z }, true);
    this.linkBBody.setRotation(identQuat, true);
    this.linkBBody.setLinvel(zeroVel, true);
    this.linkBBody.setAngvel(zeroVel, true);

    this.sliderBody.setTranslation({ x: x + 0.10, y: y + 0.02, z }, true);
    this.sliderBody.setRotation(identQuat, true);
    this.sliderBody.setLinvel(zeroVel, true);
    this.sliderBody.setAngvel(zeroVel, true);

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
    if (!this.riserBody) return false;
    return this.riserBody.translation().y >= 0.075;
  }

  public getScore(): number {
    if (!this.riserBody) return 0;
    const currentY = this.riserBody.translation().y;
    const progress = (currentY - 0.05) / (this.targetRiserY - 0.05);
    return Math.min(100, Math.max(0, Math.round(progress * 100)));
  }

  public destroy(): void {
    for (const j of this.joints) {
      this.world.removeImpulseJoint(j, true);
    }
    this.joints = [];

    const bodies = [this.anchorBody, this.linkABody, this.riserBody, this.linkBBody, this.sliderBody];
    for (const b of bodies) {
      if (b) this.world.removeRigidBody(b);
    }

    this.rootGroup.clear();
  }
}
