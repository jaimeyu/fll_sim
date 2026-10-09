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
 * Multi-Gear Cascading Dial Mission Mechanism
 *
 * Implements an authentic FIRST LEGO League cascading gear train consisting of 4
 * sequential meshed gears (24T driver -> 16T idler 1 -> 16T idler 2 -> 12T driven gear).
 * Driving the robot into the paddle arms turns the first gear, causing the entire
 * 4-gear cascade to counter-rotate with authentic mechanical gear ratios and driving
 * a high-speed dial indicator needle and mission completion flag.
 */
export class CascadeGearDialMission implements MissionElement {
  public readonly id = 'gear-cascade';
  public readonly name = 'Mission 3: Multi-Gear Cascade';
  public readonly description = 'Drive into the paddle arms to actuate a 4-gear cascading train driving a high-speed dial indicator.';
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
  private gearCascadeGroup!: THREE.Group;

  // Individual Visual Gears in the Cascade
  private gear1Mesh!: THREE.Group; // 24T Driver Gear (Azure/Gray) on Axle 1
  private gear2Mesh!: THREE.Group; // 16T Idler Gear (Bright Yellow) on Axle 2
  private gear3Mesh!: THREE.Group; // 16T Intermediate Gear (Dark Gray) on Axle 3
  private gear4Mesh!: THREE.Group; // 12T Driven Gear (Bright Red) on Axle 4

  // Output Dial & Flag
  private dialNeedleMesh!: THREE.Mesh;
  private flagMesh!: THREE.Mesh;

  // Gear Specifications & Axle Offsets (meters along local X axis)
  // R1 = 0.024m (24T), R2 = 0.016m (16T), R3 = 0.016m (16T), R4 = 0.012m (12T)
  private readonly axle1X = -0.045; // Driver Axle (with input paddles)
  private readonly axle2X = -0.005; // Idler 1 (R1 + R2 = 0.040m)
  private readonly axle3X = 0.027;  // Idler 2 (R2 + R3 = 0.032m)
  private readonly axle4X = 0.055;  // Driven Output (R3 + R4 = 0.028m)

  // Gear Ratios relative to Gear 1
  // Gear 1: ratio = 1.0
  // Gear 2: ratio = -(24 / 16) = -1.50
  // Gear 3: ratio = -(-1.50 * 16 / 16) = +1.50
  // Gear 4: ratio = -(+1.50 * 16 / 12) = -2.00 (Speed multiplier 2x)
  private readonly ratioG2 = -1.5;
  private readonly ratioG3 = 1.5;
  private readonly ratioG4 = -2.0;

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
    const radYaw = (this.yawDegrees * Math.PI) / 180;
    const cosY = Math.cos(radYaw);
    const sinY = Math.sin(radYaw);

    // 1. Fixed Baseplate Anchor Body (low profile, wide footprint)
    const baseDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y + 0.008, z);
    this.pedestalBody = this.world.createRigidBody(baseDesc);
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.090, 0.008, 0.055).setFriction(0.8),
      this.pedestalBody
    );

    // 2. Dynamic Input Rotor Body centered on Axle 1
    // Local Axle 1 offset rotated by yaw
    const worldAxle1X = x + this.axle1X * cosY;
    const worldAxle1Z = z - this.axle1X * sinY;

    const rotorDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(worldAxle1X, y + 0.035, worldAxle1Z)
      .setAngularDamping(2.8)
      .setLinearDamping(10.0)
      .lockTranslations();
    this.rotorBody = this.world.createRigidBody(rotorDesc);

    // Authentic rigid pin fit: strictly lock X (pitch) and Z (roll) rotations
    this.rotorBody.setEnabledRotations(false, true, false, true);

    // 4 Cross-Paddle Colliders on Driver Shaft at bumper height
    const arm1 = RAPIER.ColliderDesc.cuboid(0.075, 0.014, 0.008)
      .setDensity(1.8)
      .setFriction(0.6)
      .setRestitution(0.0);
    const arm2 = RAPIER.ColliderDesc.cuboid(0.008, 0.014, 0.075)
      .setDensity(1.8)
      .setFriction(0.6)
      .setRestitution(0.0);

    this.world.createCollider(arm1, this.rotorBody);
    this.world.createCollider(arm2, this.rotorBody);

    this.initialAngle = this.getRotationAngle();
    this.currentAngle = this.initialAngle;
  }

  private createLegoVisuals(): void {
    // 1. Baseplate: Authentic LEGO Dark Bluish Gray 20 x 12 Studded Plate
    this.baseplateGroup = createLegoPlateGroup(20, 12, LEGO_COLORS.DARK_GRAY, 1);
    this.rootGroup.add(this.baseplateGroup);

    // 2. Structural Technic Support Frame & Axle Bushings
    this.gearCascadeGroup = new THREE.Group();

    // Twin Technic 15L Liftarm Rails along base
    const bottomRail1 = createTechnicBeamGroup(15, LEGO_COLORS.BLACK, {
      width: 0.008,
      thickness: 0.008,
      withPinsAt: [1, 6, 10, 14],
    });
    bottomRail1.position.set(0.005, 0.007, 0.024);
    this.gearCascadeGroup.add(bottomRail1);

    const bottomRail2 = createTechnicBeamGroup(15, LEGO_COLORS.BLACK, {
      width: 0.008,
      thickness: 0.008,
      withPinsAt: [1, 6, 10, 14],
    });
    bottomRail2.position.set(0.005, 0.007, -0.024);
    this.gearCascadeGroup.add(bottomRail2);

    // Top Cross-Brace Technic Beam holding top of axles
    const topBrace = createTechnicBeamGroup(15, LEGO_COLORS.DARK_GRAY, {
      width: 0.008,
      thickness: 0.008,
    });
    topBrace.position.set(0.005, 0.026, 0);
    this.gearCascadeGroup.add(topBrace);

    // 4 Vertical Axle Shafts & Bushing Collars
    const axleGeom = new THREE.CylinderGeometry(0.0024, 0.0024, 0.032, 12);
    const axleMat = getLegoMaterial(LEGO_COLORS.BLACK, 0.3);
    const bushGeom = new THREE.CylinderGeometry(0.0042, 0.0042, 0.006, 16);
    const bushMat = getLegoMaterial(LEGO_COLORS.LIGHT_GRAY, 0.3);

    for (const ax of [this.axle1X, this.axle2X, this.axle3X, this.axle4X]) {
      const axleMesh = new THREE.Mesh(axleGeom, axleMat);
      axleMesh.position.set(ax, 0.016, 0);
      axleMesh.castShadow = true;
      this.gearCascadeGroup.add(axleMesh);

      // Bottom bushing
      const bushBottom = new THREE.Mesh(bushGeom, bushMat);
      bushBottom.position.set(ax, 0.008, 0);
      bushBottom.castShadow = true;
      this.gearCascadeGroup.add(bushBottom);

      // Top bushing
      const bushTop = new THREE.Mesh(bushGeom, bushMat);
      bushTop.position.set(ax, 0.024, 0);
      bushTop.castShadow = true;
      this.gearCascadeGroup.add(bushTop);
    }

    // 3. Four Intermeshed Gears in Cascade
    const gearY = 0.016;

    // Gear 1 (Axle 1): 24-Tooth Driver Spur Gear (Azure / Gray)
    this.gear1Mesh = createTechnicGearGroup(24, 0.024, LEGO_COLORS.AZURE, 0.006);
    this.gear1Mesh.position.set(this.axle1X, gearY, 0);
    this.gearCascadeGroup.add(this.gear1Mesh);

    // Gear 2 (Axle 2): 16-Tooth Idler Gear (Bright Yellow)
    this.gear2Mesh = createTechnicGearGroup(16, 0.016, LEGO_COLORS.YELLOW, 0.006);
    this.gear2Mesh.position.set(this.axle2X, gearY, 0);
    this.gearCascadeGroup.add(this.gear2Mesh);

    // Gear 3 (Axle 3): 16-Tooth Idler Gear (Dark Bluish Gray)
    this.gear3Mesh = createTechnicGearGroup(16, 0.016, LEGO_COLORS.DARK_GRAY, 0.006);
    this.gear3Mesh.position.set(this.axle3X, gearY, 0);
    this.gearCascadeGroup.add(this.gear3Mesh);

    // Gear 4 (Axle 4): 12-Tooth Driven Gear (Bright Red)
    this.gear4Mesh = createTechnicGearGroup(12, 0.012, LEGO_COLORS.RED, 0.006);
    this.gear4Mesh.position.set(this.axle4X, gearY, 0);
    this.gearCascadeGroup.add(this.gear4Mesh);

    // 4. Output Dial Face & High-Speed Needle on Axle 4
    const dialFaceGeom = new THREE.CylinderGeometry(0.020, 0.020, 0.003, 32);
    const dialFaceMat = getLegoMaterial(LEGO_COLORS.WHITE, 0.25);
    const dialFace = new THREE.Mesh(dialFaceGeom, dialFaceMat);
    dialFace.position.set(this.axle4X, 0.030, 0);
    dialFace.castShadow = true;
    this.gearCascadeGroup.add(dialFace);

    // Radial degree markings on dial face (0°, 90°, 180°, 270°)
    for (let d = 0; d < 4; d++) {
      const tick = new THREE.Mesh(
        new THREE.BoxGeometry(0.004, 0.0006, 0.0012),
        getLegoMaterial(d === 0 ? LEGO_COLORS.RED : LEGO_COLORS.BLACK)
      );
      const tickAngle = (d * Math.PI) / 2;
      tick.position.set(
        this.axle4X + Math.sin(tickAngle) * 0.015,
        0.032,
        Math.cos(tickAngle) * 0.015
      );
      tick.rotation.y = tickAngle;
      this.gearCascadeGroup.add(tick);
    }

    // High-contrast Needle Pointer
    const needleGeom = new THREE.BoxGeometry(0.016, 0.0016, 0.003);
    needleGeom.translate(0.007, 0, 0);
    this.dialNeedleMesh = new THREE.Mesh(needleGeom, getLegoMaterial(LEGO_COLORS.RED, 0.2));
    this.dialNeedleMesh.position.set(this.axle4X, 0.033, 0);
    this.gearCascadeGroup.add(this.dialNeedleMesh);

    // Mission Completion Indicator Flag on Axle 4
    const flagPole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.002, 0.002, 0.032, 12),
      getLegoMaterial(LEGO_COLORS.LIGHT_GRAY)
    );
    flagPole.position.set(this.axle4X, 0.046, 0);
    this.gearCascadeGroup.add(flagPole);

    this.flagMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.024, 0.015, 0.002),
      getLegoMaterial(LEGO_COLORS.GREEN, 0.2)
    );
    this.flagMesh.position.set(this.axle4X + 0.012, 0.052, 0);
    this.flagMesh.castShadow = true;
    this.gearCascadeGroup.add(this.flagMesh);

    this.rootGroup.add(this.gearCascadeGroup);

    // 5. Input Paddle Assembly on Axle 1
    this.rotorMesh = new THREE.Group();

    // Central LEGO Technic Hub
    const hubGeom = new THREE.CylinderGeometry(0.012, 0.012, 0.032, 24);
    const hubMat = getLegoMaterial(LEGO_COLORS.BLACK, 0.4);
    const hubMesh = new THREE.Mesh(hubGeom, hubMat);
    hubMesh.castShadow = true;
    this.rotorMesh.add(hubMesh);

    // 4 Cross-Paddle Arms built from Medium Azure Technic Liftarms
    const blade1 = createTechnicBeamGroup(9, LEGO_COLORS.AZURE, {
      width: 0.008,
      thickness: 0.020,
      withPinsAt: [0, 4, 8],
    });
    this.rotorMesh.add(blade1);

    const blade2 = createTechnicBeamGroup(9, LEGO_COLORS.AZURE, {
      width: 0.008,
      thickness: 0.020,
      withPinsAt: [0, 4, 8],
    });
    blade2.rotation.y = Math.PI / 2;
    this.rotorMesh.add(blade2);

    // Target Strips on each blade tip (Bright Yellow)
    for (const [bx, bz, rotY] of [
      [0.032, 0, 0],
      [-0.032, 0, 0],
      [0, 0.032, Math.PI / 2],
      [0, -0.032, Math.PI / 2],
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

    this.rootGroup.add(this.rotorMesh);
  }

  public update(_dt: number): void {
    if (!this.rotorBody) return;

    // 1. Keep driver rotor body centered at world Axle 1 location
    const radYaw = (this.yawDegrees * Math.PI) / 180;
    const cosY = Math.cos(radYaw);
    const sinY = Math.sin(radYaw);
    const worldAxle1X = this.basePos.x + this.axle1X * cosY;
    const worldAxle1Z = this.basePos.z - this.axle1X * sinY;
    const targetY = this.basePos.y + 0.035;

    const p = this.rotorBody.translation();
    if (Math.abs(p.x - worldAxle1X) > 0.001 || Math.abs(p.z - worldAxle1Z) > 0.001) {
      this.rotorBody.setTranslation({ x: worldAxle1X, y: targetY, z: worldAxle1Z }, true);
      this.rotorBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }

    // 2. Sample Angle
    this.currentAngle = this.getRotationAngle();

    // 3. LEGO Detent Resistance Torque (gentle ratchet resistance at 90 deg quadrants)
    const angVel = this.rotorBody.angvel();
    if (Math.abs(angVel.y) < 1.5) {
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

    // Baseplate and gear support frame transforms
    this.baseplateGroup.position.set(x, y + 0.002, z);
    this.baseplateGroup.rotation.y = radYaw;

    this.gearCascadeGroup.position.set(x, y + 0.002, z);
    this.gearCascadeGroup.rotation.y = radYaw;

    // Rotor transform (Axle 1)
    const rP = this.rotorBody.translation();
    const rR = this.rotorBody.rotation();
    this.rotorMesh.position.set(rP.x, rP.y, rP.z);
    this.rotorMesh.quaternion.set(rR.x, rR.y, rR.z, rR.w);

    // Delta rotation of Gear 1 from initial state
    const deltaTheta = this.currentAngle - this.initialAngle;

    // Sync all 4 cascading gears with exact mechanical gear ratios and counter-rotations
    this.gear1Mesh.rotation.y = deltaTheta;
    this.gear2Mesh.rotation.y = deltaTheta * this.ratioG2 + Math.PI / 16; // Interlocking tooth offset
    this.gear3Mesh.rotation.y = deltaTheta * this.ratioG3 + Math.PI / 16;
    this.gear4Mesh.rotation.y = deltaTheta * this.ratioG4 + Math.PI / 12;

    // Output dial needle turns at 2x gear ratio
    this.dialNeedleMesh.rotation.y = deltaTheta * this.ratioG4;

    // Flag elevation glow on solve
    if (this.isSolved()) {
      this.flagMesh.position.y = 0.056;
    } else {
      this.flagMesh.position.y = 0.050;
    }
  }

  private getRotationAngle(): number {
    if (!this.rotorBody) return 0;
    const rot = this.rotorBody.rotation();
    const siny_cosp = 2 * (rot.w * rot.y - rot.z * rot.x);
    const cosy_cosp = 1 - 2 * (rot.y * rot.y + rot.x * rot.x);
    return Math.atan2(siny_cosp, cosy_cosp);
  }

  public reset(): void {
    const { x, y, z } = this.basePos;
    const zeroVel = { x: 0, y: 0, z: 0 };
    const radYaw = (this.yawDegrees * Math.PI) / 180;
    const cosY = Math.cos(radYaw);
    const sinY = Math.sin(radYaw);
    const qy = Math.sin(radYaw / 2);
    const qw = Math.cos(radYaw / 2);
    const yawQuat = { x: 0, y: qy, z: 0, w: qw };

    this.pedestalBody.setTranslation({ x, y: y + 0.008, z }, true);
    this.pedestalBody.setRotation(yawQuat, true);

    const worldAxle1X = x + this.axle1X * cosY;
    const worldAxle1Z = z - this.axle1X * sinY;
    this.rotorBody.setTranslation({ x: worldAxle1X, y: y + 0.035, z: worldAxle1Z }, true);
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
    return angleDeltaDeg >= 65; // Solved when turned past 65 degrees
  }

  public getScore(): number {
    this.currentAngle = this.getRotationAngle();
    let angleDeltaDeg = (Math.abs(this.currentAngle - this.initialAngle) * 180) / Math.PI;
    if (angleDeltaDeg > 180) angleDeltaDeg = 360 - angleDeltaDeg;
    return Math.min(100, Math.max(0, Math.round((angleDeltaDeg / 90) * 100)));
  }

  public getInteractiveMeshes(): THREE.Object3D[] {
    return this.rotorMesh ? [this.rotorMesh, this.gearCascadeGroup] : [];
  }

  public applyUserDrag(groundTarget: THREE.Vector3): void {
    if (!this.rotorBody) return;
    const radYaw = (this.yawDegrees * Math.PI) / 180;
    const worldAxle1X = this.basePos.x + this.axle1X * Math.cos(radYaw);
    const worldAxle1Z = this.basePos.z - this.axle1X * Math.sin(radYaw);

    const dx = groundTarget.x - worldAxle1X;
    const dz = groundTarget.z - worldAxle1Z;
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
