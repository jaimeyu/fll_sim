import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { MissionElement } from './types';
import {
  LEGO_COLORS,
  getLegoMaterial,
  createTechnicBeamGroup,
  createLegoPlateGroup,
  createTechnicGearGroup,
} from '../view/lego-visuals';

/**
 * Rotary Gear Turnstile Mission Mechanism
 *
 * Implements an authentic FIRST LEGO League gear turnstile built from
 * official LEGO Technic 24T and 12T gears, 9L liftarms, axle shafts, and a dial face.
 *
 * Driving the robot into any of the 4 cross paddle blades rotates the vertical shaft.
 * The 24T gear drives a 12T gear, rotating a dial indicator needle.
 * An authentic LEGO spring-loaded friction detent latches the dial into the 90-degree scored position.
 */
export class GearDialMission implements MissionElement {
  public readonly id = 'gear-dial';
  public readonly name = 'Mission 2: Rotary Gear Turnstile';
  public readonly description = 'Drive into the paddle arms to rotate the turnstile 90 degrees and activate the green indicator.';
  public readonly rootGroup: THREE.Group;

  private world!: RAPIER.World;
  private basePos: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
  private yawDegrees: number = 0;
  public isPlacedOnField: boolean = true;

  // Physics Bodies
  private pedestalBody!: RAPIER.RigidBody;
  private rotorBody!: RAPIER.RigidBody;

  // Visual Groups
  private baseplateGroup!: THREE.Group;
  private rotorMesh!: THREE.Group;
  private gearTrainGroup!: THREE.Group;
  private dialNeedleMesh!: THREE.Mesh;
  private flagMesh!: THREE.Mesh;

  private currentAngle = 0;
  private initialAngle = 0;

  constructor() {
    this.rootGroup = new THREE.Group();
  }

  public init(world: RAPIER.World, basePosition: { x: number; y: number; z: number }): void {
    this.world = world;
    this.basePos = { ...basePosition };

    this.createPhysicsBodies();
    this.createLegoVisuals();
    this.syncVisuals();
  }

  private createPhysicsBodies(): void {
    const { x, y, z } = this.basePos;

    // 1. Fixed Low-Profile Baseplate Anchor Body (Firmly anchored, low clearance)
    const baseDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y + 0.008, z);
    this.pedestalBody = this.world.createRigidBody(baseDesc);
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.065, 0.008, 0.065).setFriction(0.8),
      this.pedestalBody
    );

    // 2. Dynamic 4-Spoke Turnstile Rotor (Revolves strictly around Y axis, zero pitch/roll wobble)
    // Centered at robot bumper height: Y = 0.035m (Spans Y = 0.021m to 0.049m)
    const rotorDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y + 0.035, z)
      .setAngularDamping(2.8)
      .setLinearDamping(10.0) // Resist translation; shaft holds it in place
      .lockTranslations(); // Rotate only around Y
    this.rotorBody = this.world.createRigidBody(rotorDesc);
    // Authentically rigid Technic pin fit: strictly lock X (pitch) and Z (roll) rotations
    this.rotorBody.setEnabledRotations(false, true, false, true);

    // 4 Cross-Paddle Colliders (Arm 1 along X, Arm 2 along Z, 160mm total span)
    const arm1 = RAPIER.ColliderDesc.cuboid(0.080, 0.014, 0.008)
      .setDensity(1.8)
      .setFriction(0.6)
      .setRestitution(0.0);
    const arm2 = RAPIER.ColliderDesc.cuboid(0.008, 0.014, 0.080)
      .setDensity(1.8)
      .setFriction(0.6)
      .setRestitution(0.0);

    this.world.createCollider(arm1, this.rotorBody);
    this.world.createCollider(arm2, this.rotorBody);

    this.initialAngle = this.getRotationAngle();
    this.currentAngle = this.initialAngle;
  }

  private createLegoVisuals(): void {
    // 1. LEGO Dark Bluish Gray Baseplate (14 x 14 studs with authentic studs on top)
    this.baseplateGroup = createLegoPlateGroup(14, 14, LEGO_COLORS.DARK_GRAY, 1);
    this.rootGroup.add(this.baseplateGroup);

    // 2. Center Technic Turntable Base & Shaft Tower
    const towerGeom = new THREE.CylinderGeometry(0.018, 0.022, 0.028, 24);
    const towerMat = getLegoMaterial(LEGO_COLORS.DARK_GRAY, 0.4);
    const towerMesh = new THREE.Mesh(towerGeom, towerMat);
    towerMesh.position.set(0, 0.014, 0);
    towerMesh.castShadow = true;
    this.rootGroup.add(towerMesh);

    // 3. Rotating 4-Spoke Turnstile Assembly
    this.rotorMesh = new THREE.Group();

    // Central LEGO Technic Hub Bushing
    const hubGeom = new THREE.CylinderGeometry(0.014, 0.014, 0.032, 24);
    const hubMat = getLegoMaterial(LEGO_COLORS.BLACK, 0.4);
    const hubMesh = new THREE.Mesh(hubGeom, hubMat);
    hubMesh.castShadow = true;
    this.rotorMesh.add(hubMesh);

    // 4 Cross-Paddle Arms built from Medium Azure 9L Technic Liftarms with holes
    const blade1 = createTechnicBeamGroup(9, LEGO_COLORS.AZURE, {
      width: 0.008,
      thickness: 0.022,
      withPinsAt: [0, 4, 8],
    });
    blade1.position.set(0, 0, 0);
    this.rotorMesh.add(blade1);

    const blade2 = createTechnicBeamGroup(9, LEGO_COLORS.AZURE, {
      width: 0.008,
      thickness: 0.022,
      withPinsAt: [0, 4, 8],
    });
    blade2.rotation.y = Math.PI / 2;
    this.rotorMesh.add(blade2);

    // Contact Target Strips on each blade tip (Bright Yellow LEGO accents)
    for (const [bx, bz, rotY] of [
      [0.034, 0, 0],
      [-0.034, 0, 0],
      [0, 0.034, Math.PI / 2],
      [0, -0.034, Math.PI / 2],
    ] as const) {
      const tipMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.012, 0.020, 0.009),
        getLegoMaterial(LEGO_COLORS.YELLOW, 0.3)
      );
      tipMesh.position.set(bx, 0, bz);
      tipMesh.rotation.y = rotY;
      tipMesh.castShadow = true;
      this.rotorMesh.add(tipMesh);
    }

    // 4. Authentic LEGO Technic 24-Tooth Spur Gear mounted on the central shaft
    const gear24 = createTechnicGearGroup(24, 0.024, LEGO_COLORS.LIGHT_GRAY, 0.007);
    gear24.position.set(0, 0.018, 0);
    this.rotorMesh.add(gear24);

    this.rootGroup.add(this.rotorMesh);

    // 5. Gear Train & Dial Indicator Assembly on Base
    this.gearTrainGroup = new THREE.Group();

    // Meshing 12-Tooth Bevel Gear (2:1 gear ratio driving the dial)
    const gear12 = createTechnicGearGroup(12, 0.012, LEGO_COLORS.DARK_GRAY, 0.005);
    gear12.position.set(0.032, 0.018, 0);
    this.gearTrainGroup.add(gear12);

    // Circular Printed Dial Face Tile
    const dialFaceGeom = new THREE.CylinderGeometry(0.018, 0.018, 0.003, 32);
    const dialFaceMat = getLegoMaterial(LEGO_COLORS.WHITE, 0.3);
    const dialFace = new THREE.Mesh(dialFaceGeom, dialFaceMat);
    dialFace.position.set(0.032, 0.023, 0);
    dialFace.castShadow = true;
    this.gearTrainGroup.add(dialFace);

    // Red Needle Pointer on Dial Face
    const needleGeom = new THREE.BoxGeometry(0.015, 0.0015, 0.003);
    needleGeom.translate(0.007, 0, 0); // Pivot at center
    const needleMat = getLegoMaterial(LEGO_COLORS.RED, 0.2);
    this.dialNeedleMesh = new THREE.Mesh(needleGeom, needleMat);
    this.dialNeedleMesh.position.set(0.032, 0.025, 0);
    this.gearTrainGroup.add(this.dialNeedleMesh);

    // Green Indicator Flag that pops up upon completing 90 degrees
    const flagPole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.002, 0.002, 0.030, 12),
      getLegoMaterial(LEGO_COLORS.LIGHT_GRAY)
    );
    flagPole.position.set(0, 0.032, 0);
    this.rotorMesh.add(flagPole);

    this.flagMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.022, 0.014, 0.002),
      getLegoMaterial(LEGO_COLORS.GREEN, 0.2)
    );
    this.flagMesh.position.set(0.011, 0.040, 0);
    this.flagMesh.castShadow = true;
    this.rotorMesh.add(this.flagMesh);

    this.rootGroup.add(this.gearTrainGroup);
  }

  public update(_dt: number): void {
    if (!this.rotorBody) return;

    // 1. Keep rotor body firmly centered at base
    const p = this.rotorBody.translation();
    const targetY = this.basePos.y + 0.035;
    if (Math.abs(p.x - this.basePos.x) > 0.001 || Math.abs(p.z - this.basePos.z) > 0.001) {
      this.rotorBody.setTranslation({ x: this.basePos.x, y: targetY, z: this.basePos.z }, true);
      this.rotorBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }

    // 2. Sample Angle
    this.currentAngle = this.getRotationAngle();
    let angleDelta = Math.abs(this.currentAngle - this.initialAngle);
    if (angleDelta > Math.PI) angleDelta = 2 * Math.PI - angleDelta;

    // 3. LEGO Spring-Loaded Ratchet Detent Torque (Snap to 90-degree quadrant)
    const angVel = this.rotorBody.angvel();
    if (Math.abs(angVel.y) < 1.5) {
      // Gentle spring detent torque at every 90 degrees
      const targetQuadrant = Math.round(this.currentAngle / (Math.PI / 2)) * (Math.PI / 2);
      const err = targetQuadrant - this.currentAngle;
      if (Math.abs(err) < 0.25) {
        this.rotorBody.applyTorqueImpulse({ x: 0, y: err * 0.0008, z: 0 }, true);
      }
    }
  }

  public syncVisuals(): void {
    if (!this.rotorBody) return;

    const { x, y, z } = this.basePos;
    const radYaw = (this.yawDegrees * Math.PI) / 180;
    this.baseplateGroup.position.set(x, y + 0.002, z);
    this.baseplateGroup.rotation.y = radYaw;
    this.gearTrainGroup.position.set(x, y + 0.002, z);
    this.gearTrainGroup.rotation.y = radYaw;

    // Rotor transform
    const rP = this.rotorBody.translation();
    const rR = this.rotorBody.rotation();
    this.rotorMesh.position.set(rP.x, rP.y, rP.z);
    this.rotorMesh.quaternion.set(rR.x, rR.y, rR.z, rR.w);

    // 2:1 Gear Ratio Needle Pointer Rotation
    const angleDelta = this.currentAngle - this.initialAngle;
    this.dialNeedleMesh.rotation.y = -angleDelta * 2.0;

    // Flag elevation glow on solve
    if (this.isSolved()) {
      this.flagMesh.position.y = 0.044;
    } else {
      this.flagMesh.position.y = 0.038;
    }
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
    const radYaw = (this.yawDegrees * Math.PI) / 180;
    const qy = Math.sin(radYaw / 2);
    const qw = Math.cos(radYaw / 2);
    const yawQuat = { x: 0, y: qy, z: 0, w: qw };

    this.pedestalBody.setTranslation({ x, y: y + 0.008, z }, true);
    this.pedestalBody.setRotation(yawQuat, true);

    this.rotorBody.setTranslation({ x, y: y + 0.035, z }, true);
    this.rotorBody.setRotation(yawQuat, true);
    this.rotorBody.setLinvel(zeroVel, true);
    this.rotorBody.setAngvel(zeroVel, true);
    this.rotorBody.setEnabledRotations(false, true, false, true);

    this.initialAngle = this.getRotationAngle();
    this.currentAngle = this.initialAngle;
    this.syncVisuals();
  }

  public setPosition(pos: { x: number; y: number; z: number }, yawDegrees?: number): void {
    this.basePos = { ...pos };
    if (yawDegrees !== undefined) {
      this.yawDegrees = yawDegrees;
    }
    this.reset();
  }

  public setRotation(yawDegrees: number): void {
    this.yawDegrees = yawDegrees;
    this.reset();
  }

  public getYawDegrees(): number {
    return this.yawDegrees;
  }

  public getPosition(): { x: number; y: number; z: number } {
    return { ...this.basePos };
  }

  public isSolved(): boolean {
    this.currentAngle = this.getRotationAngle();
    let angleDeltaDeg = (Math.abs(this.currentAngle - this.initialAngle) * 180) / Math.PI;
    if (angleDeltaDeg > 180) angleDeltaDeg = 360 - angleDeltaDeg;
    return angleDeltaDeg >= 70; // Rotated past 70 degrees
  }

  public getScore(): number {
    this.currentAngle = this.getRotationAngle();
    let angleDeltaDeg = (Math.abs(this.currentAngle - this.initialAngle) * 180) / Math.PI;
    if (angleDeltaDeg > 180) angleDeltaDeg = 360 - angleDeltaDeg;
    return Math.min(100, Math.max(0, Math.round((angleDeltaDeg / 90) * 100)));
  }

  public getInteractiveMeshes(): THREE.Object3D[] {
    return this.rotorMesh ? [this.rotorMesh] : [];
  }

  public applyUserDrag(groundTarget: THREE.Vector3): void {
    if (!this.rotorBody) return;
    const dx = groundTarget.x - this.basePos.x;
    const dz = groundTarget.z - this.basePos.z;
    const targetAngle = Math.atan2(dx, dz);
    let diff = targetAngle - this.currentAngle;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    this.rotorBody.setAngvel({ x: 0, y: diff * 12.0, z: 0 }, true);
  }

  public destroy(): void {
    if (this.pedestalBody) this.world.removeRigidBody(this.pedestalBody);
    if (this.rotorBody) this.world.removeRigidBody(this.rotorBody);
    this.rootGroup.clear();
  }
}
