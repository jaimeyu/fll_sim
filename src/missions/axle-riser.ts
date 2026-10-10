import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { MissionElement } from './types';
import {
  LEGO_COLORS,
  getLegoMaterial,
  createTechnicBeamGroup,
  createLegoPlateGroup,
} from '../view/lego-visuals';
import { DualLockMarker } from './dual-lock-marker';

/**
 * 4-Axle Riser Mission Mechanism
 *
 * Implements an authentic FIRST LEGO League 4-bar scissor toggle linkage built from
 * official LEGO Technic liftarms, friction pins, and studded bricks.
 *
 * One end is securely anchored to the field mat. Pushing the opposite end (red slider plate)
 * compresses the 4-axle linkage, forcing the middle scoring module to elevate vertically.
 * Authentic Technic pin friction holds the assembly aloft against gravity once raised.
 */
export class AxleRiserMission implements MissionElement {
  public readonly id = 'axle-riser';
  public readonly name = 'Mission 1: 4-Axle Toggle Riser';
  public readonly description = 'Push the red slider plate toward the fixed base to elevate the middle scoring block.';
  public readonly rootGroup: THREE.Group;

  private world!: RAPIER.World;
  private basePos: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
  private yawDegrees: number = 0;
  public isPlacedOnField: boolean = true;
  public isDualLocked: boolean = true;
  private dualLockMarker: DualLockMarker | null = null;
  private dualLockAnchorOffset: { x: number; z: number } = { x: 0, z: 0 };
  private anchorBody!: RAPIER.RigidBody;
  private sliderBody!: RAPIER.RigidBody;
  private riserBody!: RAPIER.RigidBody;

  // Visual Groups
  private baseplateGroup!: THREE.Group;
  private anchorMesh!: THREE.Group;
  private sliderMesh!: THREE.Group;
  private riserMesh!: THREE.Group;
  private linkAMesh!: THREE.Group;
  private linkBMesh!: THREE.Group;

  // Current Kinematic State
  private currentProgress = 0.0; // 0.0 (rest/flat) to 1.0 (fully elevated)
  private initialSliderOffset = 0.120; // 120mm spacing at rest

  constructor() {
    this.rootGroup = new THREE.Group();
  }

  public init(world: RAPIER.World, basePosition: { x: number; y: number; z: number }, yawDegrees = 0): void {
    this.world = world;
    this.basePos = { ...basePosition };
    this.yawDegrees = yawDegrees;

    this.createPhysicsBodies();
    this.createLegoVisuals();
    this.syncVisuals();
    this.updateDualLockVisualMesh();
  }

  private getDirectionVectors(): { ux: number; uz: number; wx: number; wz: number } {
    const rad = (this.yawDegrees * Math.PI) / 180;
    return {
      ux: Math.cos(rad),
      uz: -Math.sin(rad),
      wx: Math.sin(rad),
      wz: Math.cos(rad),
    };
  }

  private createPhysicsBodies(): void {
    const { x, y, z } = this.basePos;
    const { ux, uz } = this.getDirectionVectors();
    const rad = (this.yawDegrees * Math.PI) / 180;
    const qy = Math.sin(rad / 2);
    const qw = Math.cos(rad / 2);
    const yawQuat = { x: 0, y: qy, z: 0, w: qw };

    // 1. Fixed Base Anchor Body (Anchored firmly to field)
    const anchorDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(x - 0.09 * ux, y + 0.015, z - 0.09 * uz)
      .setRotation(yawQuat);
    this.anchorBody = this.world.createRigidBody(anchorDesc);
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.040, 0.015, 0.045).setFriction(0.8),
      this.anchorBody
    );

    // 2. Dynamic Slider Push Body (Direct contact target for robot bumper and mouse tool)
    // Positioned at robot bumper height (Y = 0.015m to 0.045m)
    const sliderDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x + this.initialSliderOffset * ux, y + 0.024, z + this.initialSliderOffset * uz)
      .setRotation(yawQuat)
      .setLinearDamping(4.5)  // Technic friction pin resistance opposes runaway movement
      .setAngularDamping(8.0)
      .lockRotations(); // Keep slider aligned with field track
    this.sliderBody = this.world.createRigidBody(sliderDesc);

    // Solid push plate collider (Width 36mm, Height 36mm, Depth 88mm)
    const sliderCollider = RAPIER.ColliderDesc.cuboid(0.020, 0.018, 0.044)
      .setDensity(2.5)
      .setFriction(0.6)
      .setRestitution(0.0);
    this.world.createCollider(sliderCollider, this.sliderBody);

    // 3. Middle Elevated Riser Body (Scoring element body)
    const riserDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(x, y + 0.025, z)
      .setRotation(yawQuat);
    this.riserBody = this.world.createRigidBody(riserDesc);
    const riserCollider = RAPIER.ColliderDesc.cuboid(0.022, 0.020, 0.035)
      .setFriction(0.5);
    this.world.createCollider(riserCollider, this.riserBody);
  }

  private createLegoVisuals(): void {
    // 1. LEGO Dark Bluish Gray Baseplate (16 x 8 studs with authentic studs on top)
    this.baseplateGroup = createLegoPlateGroup(18, 10, LEGO_COLORS.DARK_GRAY, 1);
    this.rootGroup.add(this.baseplateGroup);

    // 2. Base Anchor Support (Fixed Technic upright frame)
    this.anchorMesh = new THREE.Group();
    const anchorUpright = createTechnicBeamGroup(5, LEGO_COLORS.DARK_BLUE, { width: 0.012, thickness: 0.036 });
    anchorUpright.rotation.z = Math.PI / 2;
    anchorUpright.position.set(0, 0.018, 0);
    this.anchorMesh.add(anchorUpright);

    // Technic friction pin connecting beam pivot
    const anchorPin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.003, 0.003, 0.038, 16),
      getLegoMaterial(LEGO_COLORS.BLACK, 0.4)
    );
    anchorPin.rotation.x = Math.PI / 2;
    anchorPin.position.set(0, 0.022, 0);
    this.anchorMesh.add(anchorPin);
    this.rootGroup.add(this.anchorMesh);

    // 3. Link A (Left Technic 11L Liftarm in Light Bluish Gray with 11 Technic holes)
    this.linkAMesh = createTechnicBeamGroup(11, LEGO_COLORS.LIGHT_GRAY, {
      width: 0.008,
      thickness: 0.008,
      withPinsAt: [0, 10],
    });
    this.rootGroup.add(this.linkAMesh);

    // 4. Link B (Right Technic 11L Liftarm in Light Bluish Gray with 11 Technic holes)
    this.linkBMesh = createTechnicBeamGroup(11, LEGO_COLORS.LIGHT_GRAY, {
      width: 0.008,
      thickness: 0.008,
      withPinsAt: [0, 10],
    });
    this.rootGroup.add(this.linkBMesh);

    // 5. Middle Scoring Riser (Yellow LEGO scoring module with green indicator flag)
    this.riserMesh = new THREE.Group();
    const riserBox = createLegoPlateGroup(6, 6, LEGO_COLORS.YELLOW, 3);
    riserBox.position.set(0, -0.010, 0);
    this.riserMesh.add(riserBox);

    // High-visibility Green Scoring Flag on top
    const flagPole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.002, 0.002, 0.025, 12),
      getLegoMaterial(LEGO_COLORS.LIGHT_GRAY)
    );
    flagPole.position.set(0, 0.022, 0);
    this.riserMesh.add(flagPole);

    const flagMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.024, 0.016, 0.002),
      getLegoMaterial(LEGO_COLORS.GREEN, 0.25)
    );
    flagMesh.position.set(0.012, 0.028, 0);
    flagMesh.castShadow = true;
    this.riserMesh.add(flagMesh);

    this.rootGroup.add(this.riserMesh);

    // 6. Red Pusher Slider Plate (Contact plate with white chevron arrows)
    this.sliderMesh = new THREE.Group();

    // Red Pusher Beam Frame
    const sliderBase = createTechnicBeamGroup(7, LEGO_COLORS.RED, {
      width: 0.016,
      thickness: 0.028,
      withPinsAt: [0, 3, 6],
    });
    sliderBase.rotation.y = Math.PI / 2;
    this.sliderMesh.add(sliderBase);

    // White LEGO Target Chevron Tile on contact face
    const chevronTile = new THREE.Mesh(
      new THREE.BoxGeometry(0.004, 0.022, 0.060),
      getLegoMaterial(LEGO_COLORS.WHITE, 0.3)
    );
    chevronTile.position.set(0.012, 0, 0);
    chevronTile.castShadow = true;
    this.sliderMesh.add(chevronTile);

    this.rootGroup.add(this.sliderMesh);
  }

  public update(_dt: number): void {
    this.updateKinematics();
  }

  private updateKinematics(): void {
    if (!this.sliderBody || !this.anchorBody) return;

    const { ux, uz } = this.getDirectionVectors();
    const currTrans = this.sliderBody.translation();

    // 1. Project slider position onto local mechanism track axis u
    const distSpan = (currTrans.x - this.basePos.x) * ux + (currTrans.z - this.basePos.z) * uz;
    const minS = 0.035;
    const maxS = this.initialSliderOffset + 0.01;
    const clampedS = THREE.MathUtils.clamp(distSpan, minS, maxS);

    const clampedX = this.basePos.x + clampedS * ux;
    const clampedY = this.basePos.y + 0.024;
    const clampedZ = this.basePos.z + clampedS * uz;

    const dx = currTrans.x - clampedX;
    const dz = currTrans.z - clampedZ;
    if (Math.sqrt(dx * dx + dz * dz) > 0.001) {
      this.sliderBody.setTranslation({ x: clampedX, y: clampedY, z: clampedZ }, true);
      const vel = this.sliderBody.linvel();
      const dotV = vel.x * ux + vel.z * uz;
      const dampedV = Math.min(dotV, 0);
      this.sliderBody.setLinvel({ x: dampedV * ux, y: 0, z: dampedV * uz }, true);
    }

    // 2. High Pin Friction: Damp velocity to simulate tight Technic friction pins
    const linvel = this.sliderBody.linvel();
    const speed = Math.sqrt(linvel.x * linvel.x + linvel.z * linvel.z);
    if (speed > 0.001) {
      this.sliderBody.setLinvel({ x: linvel.x * 0.88, y: 0, z: linvel.z * 0.88 }, true);
    }

    // 3. Compute 4-Bar Scissor Toggle Kinematics
    const distanceSpan = clampedS + 0.09;
    const restSpan = this.initialSliderOffset + 0.09;
    const compressedSpan = 0.120;
    const progress = THREE.MathUtils.clamp((restSpan - distanceSpan) / (restSpan - compressedSpan), 0.0, 1.0);
    this.currentProgress = progress;

    // Kinematic riser elevation
    const elevationY = this.basePos.y + 0.020 + progress * 0.052; // Rises up to 7.4cm!
    const midS = (clampedS - 0.09) / 2;

    this.riserBody.setTranslation({
      x: this.basePos.x + midS * ux,
      y: elevationY + 0.016,
      z: this.basePos.z + midS * uz,
    }, true);
  }

  public syncVisuals(): void {
    if (!this.sliderBody || !this.anchorBody) return;

    const { ux, uz, wx, wz } = this.getDirectionVectors();
    if (!this.isDualLocked) {
      const aP = this.anchorBody.translation();
      this.basePos.x = aP.x + 0.09 * ux;
      this.basePos.z = aP.z + 0.09 * uz;
    }
    const { x, y, z } = this.basePos;
    const radYaw = (this.yawDegrees * Math.PI) / 180;

    // Baseplate
    this.baseplateGroup.position.set(x, y + 0.002, z);
    this.baseplateGroup.rotation.y = radYaw;

    // Anchor
    this.anchorMesh.position.set(x - 0.09 * ux, y + 0.008, z - 0.09 * uz);
    this.anchorMesh.rotation.y = radYaw;

    // Slider
    const sP = this.sliderBody.translation();
    this.sliderMesh.position.set(sP.x, sP.y, sP.z);
    this.sliderMesh.rotation.y = radYaw;

    // Kinematic Riser
    const rP = this.riserBody.translation();
    this.riserMesh.position.set(rP.x, rP.y, rP.z);
    this.riserMesh.rotation.y = radYaw;

    // 4-Bar Linkages: Link A and Link B
    // Link A connects Anchor (x - 0.09, y + 0.022) to Riser (rP.x - 0.022, rP.y)
    const pAnchor = new THREE.Vector3(x - 0.09 * ux, y + 0.022, z - 0.09 * uz);
    const pRiserLeft = new THREE.Vector3(rP.x - 0.022 * ux, rP.y - 0.004, rP.z - 0.022 * uz);
    const midA = new THREE.Vector3().addVectors(pAnchor, pRiserLeft).multiplyScalar(0.5);
    const deltaAY = pRiserLeft.y - pAnchor.y;
    const deltaAH = Math.hypot(pRiserLeft.x - pAnchor.x, pRiserLeft.z - pAnchor.z);
    const angleA = Math.atan2(deltaAY, deltaAH);

    this.linkAMesh.position.set(midA.x + 0.014 * wx, midA.y, midA.z + 0.014 * wz);
    this.linkAMesh.rotation.set(0, 0, 0);
    this.linkAMesh.rotation.y = radYaw;
    this.linkAMesh.rotateZ(angleA);

    // Link B connects Riser (rP.x + 0.022, rP.y) to Slider (sP.x, y + 0.022)
    const pRiserRight = new THREE.Vector3(rP.x + 0.022 * ux, rP.y - 0.004, rP.z + 0.022 * uz);
    const pSlider = new THREE.Vector3(sP.x, y + 0.022, sP.z);
    const midB = new THREE.Vector3().addVectors(pRiserRight, pSlider).multiplyScalar(0.5);
    const deltaBY = pSlider.y - pRiserRight.y;
    const deltaBH = Math.hypot(pSlider.x - pRiserRight.x, pSlider.z - pRiserRight.z);
    const angleB = Math.atan2(deltaBY, deltaBH);

    this.linkBMesh.position.set(midB.x + 0.014 * wx, midB.y, midB.z + 0.014 * wz);
    this.linkBMesh.rotation.set(0, 0, 0);
    this.linkBMesh.rotation.y = radYaw;
    this.linkBMesh.rotateZ(angleB);
  }

  public reset(): void {
    const { x, y, z } = this.basePos;
    const { ux, uz } = this.getDirectionVectors();
    const zeroVel = { x: 0, y: 0, z: 0 };
    const rad = (this.yawDegrees * Math.PI) / 180;
    const qy = Math.sin(rad / 2);
    const qw = Math.cos(rad / 2);
    const yawQuat = { x: 0, y: qy, z: 0, w: qw };

    this.anchorBody.setTranslation({ x: x - 0.09 * ux, y: y + 0.015, z: z - 0.09 * uz }, true);
    this.anchorBody.setRotation(yawQuat, true);

    this.sliderBody.setTranslation({
      x: x + this.initialSliderOffset * ux,
      y: y + 0.024,
      z: z + this.initialSliderOffset * uz,
    }, true);
    this.sliderBody.setRotation(yawQuat, true);
    this.sliderBody.setLinvel(zeroVel, true);
    this.sliderBody.setAngvel(zeroVel, true);

    this.riserBody.setTranslation({ x, y: y + 0.038, z }, true);
    this.riserBody.setRotation(yawQuat, true);

    this.currentProgress = 0.0;
    this.syncVisuals();
  }

  public setPosition(pos: { x: number; y: number; z: number }, yawDegrees?: number): void {
    this.basePos = { ...pos };
    if (yawDegrees !== undefined) {
      this.yawDegrees = yawDegrees;
    }
    this.reset();
    this.updateDualLockVisualMesh();
  }

  public setDualLocked(locked: boolean, anchorPoint?: { x: number; z: number }): void {
    this.isDualLocked = locked;
    if (anchorPoint) {
      this.dualLockAnchorOffset = {
        x: anchorPoint.x - this.basePos.x,
        z: anchorPoint.z - this.basePos.z,
      };
    }
    if (this.anchorBody) {
      this.anchorBody.setBodyType(
        locked ? RAPIER.RigidBodyType.Fixed : RAPIER.RigidBodyType.Dynamic,
        true
      );
      if (!locked) {
        this.anchorBody.setLinearDamping(2.5);
        this.anchorBody.setAngularDamping(3.5);
        this.anchorBody.wakeUp();
      }
    }
    this.updateDualLockVisualMesh();
  }

  public getDualLockPosition(): { x: number; z: number } | null {
    if (!this.isDualLocked) return null;
    return {
      x: this.basePos.x + this.dualLockAnchorOffset.x,
      z: this.basePos.z + this.dualLockAnchorOffset.z,
    };
  }

  private updateDualLockVisualMesh(): void {
    if (!this.dualLockMarker) {
      this.dualLockMarker = new DualLockMarker(this.id);
      this.rootGroup.add(this.dualLockMarker.group);
    }
    this.dualLockMarker.setVisible(this.isDualLocked);
    if (this.isDualLocked) {
      const { ux, uz } = this.getDirectionVectors();
      const defaultAnchorX = this.basePos.x - 0.09 * ux;
      const defaultAnchorZ = this.basePos.z - 0.09 * uz;
      const posX = (this.dualLockAnchorOffset.x !== 0 || this.dualLockAnchorOffset.z !== 0)
        ? this.basePos.x + this.dualLockAnchorOffset.x
        : defaultAnchorX;
      const posZ = (this.dualLockAnchorOffset.x !== 0 || this.dualLockAnchorOffset.z !== 0)
        ? this.basePos.z + this.dualLockAnchorOffset.z
        : defaultAnchorZ;
      this.dualLockMarker.setPosition(posX, 0.002, posZ);
    }
  }

  public getDualLockMarker(): DualLockMarker | null {
    return this.dualLockMarker;
  }

  public setDualLockHoverHighlight(isHovered: boolean, isEraseMode: boolean = false): void {
    this.dualLockMarker?.setHoverHighlight(isHovered, isEraseMode);
  }

  public setRotation(yawDegrees: number): void {
    this.yawDegrees = yawDegrees;
    this.reset();
    this.updateDualLockVisualMesh();
  }

  public getYawDegrees(): number {
    return this.yawDegrees;
  }

  public getPosition(): { x: number; y: number; z: number } {
    return { ...this.basePos };
  }

  public isSolved(): boolean {
    this.updateKinematics();
    return this.currentProgress >= 0.70; // Elevates by at least 70%
  }

  public getScore(): number {
    this.updateKinematics();
    return Math.min(100, Math.max(0, Math.round(this.currentProgress * 100)));
  }

  public getInteractiveMeshes(): THREE.Object3D[] {
    return this.sliderMesh ? [this.sliderMesh] : [];
  }

  public applyUserDrag(groundTarget: THREE.Vector3): void {
    if (!this.sliderBody) return;
    const { ux, uz } = this.getDirectionVectors();
    const currTrans = this.sliderBody.translation();
    const currS = (currTrans.x - this.basePos.x) * ux + (currTrans.z - this.basePos.z) * uz;

    const targetS = THREE.MathUtils.clamp(
      (groundTarget.x - this.basePos.x) * ux + (groundTarget.z - this.basePos.z) * uz,
      0.035,
      this.initialSliderOffset
    );
    const velS = (targetS - currS) * 15.0;
    this.sliderBody.setLinvel({ x: velS * ux, y: 0, z: velS * uz }, true);
  }

  public destroy(): void {
    const bodies = [this.anchorBody, this.sliderBody, this.riserBody];
    for (const b of bodies) {
      if (b) this.world.removeRigidBody(b);
    }
    this.dualLockMarker?.destroy();
    this.rootGroup.clear();
  }
}
