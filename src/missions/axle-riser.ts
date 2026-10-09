import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { MissionElement } from './types';
import {
  LEGO_COLORS,
  getLegoMaterial,
  createTechnicBeamGroup,
  createLegoPlateGroup,
} from '../view/lego-visuals';

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

  // Physics Bodies
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

  public init(world: RAPIER.World, basePosition: { x: number; y: number; z: number }): void {
    this.world = world;
    this.basePos = { ...basePosition };

    this.createPhysicsBodies();
    this.createLegoVisuals();
    this.syncVisuals();
  }

  private createPhysicsBodies(): void {
    const { x, y, z } = this.basePos;

    // 1. Fixed Base Anchor Body (Anchored firmly to field)
    const anchorDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(x - 0.09, y + 0.015, z);
    this.anchorBody = this.world.createRigidBody(anchorDesc);
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.040, 0.015, 0.045).setFriction(0.8),
      this.anchorBody
    );

    // 2. Dynamic Slider Push Body (Direct contact target for robot bumper and mouse tool)
    // Positioned at robot bumper height (Y = 0.015m to 0.045m)
    const sliderDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x + this.initialSliderOffset, y + 0.024, z)
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
      .setTranslation(x, y + 0.025, z);
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

    // 1. Clamp slider strictly within the mechanical track bounds
    const currTrans = this.sliderBody.translation();
    const minX = this.basePos.x + 0.035;
    const maxX = this.basePos.x + this.initialSliderOffset + 0.01;

    let clampedX = THREE.MathUtils.clamp(currTrans.x, minX, maxX);
    let clampedZ = this.basePos.z; // Prevent side drift
    let clampedY = this.basePos.y + 0.024;

    if (currTrans.x !== clampedX || Math.abs(currTrans.z - clampedZ) > 0.001) {
      this.sliderBody.setTranslation({ x: clampedX, y: clampedY, z: clampedZ }, true);
      const vel = this.sliderBody.linvel();
      this.sliderBody.setLinvel({ x: Math.min(vel.x, 0), y: 0, z: 0 }, true);
    }

    // 2. High Pin Friction: Damp velocity to simulate tight Technic friction pins
    const linvel = this.sliderBody.linvel();
    if (Math.abs(linvel.x) > 0.001) {
      this.sliderBody.setLinvel({ x: linvel.x * 0.88, y: 0, z: 0 }, true);
    }

    // 3. Compute 4-Bar Scissor Toggle Kinematics
    const distanceSpan = clampedX - (this.basePos.x - 0.09);
    // Span at rest ~0.21m, compressed ~0.125m
    const restSpan = this.initialSliderOffset + 0.09;
    const compressedSpan = 0.120;
    const progress = THREE.MathUtils.clamp((restSpan - distanceSpan) / (restSpan - compressedSpan), 0.0, 1.0);
    this.currentProgress = progress;

    // Kinematic riser elevation
    const elevationY = this.basePos.y + 0.020 + progress * 0.052; // Rises up to 7.4cm!
    const midX = (this.basePos.x - 0.09 + clampedX) / 2;

    this.riserBody.setTranslation({
      x: midX,
      y: elevationY + 0.016,
      z: this.basePos.z,
    }, true);
  }

  public syncVisuals(): void {
    if (!this.sliderBody || !this.anchorBody) return;

    const { x, y, z } = this.basePos;
    this.baseplateGroup.position.set(x, y + 0.002, z);

    // Anchor
    this.anchorMesh.position.set(x - 0.09, y + 0.008, z);

    // Slider
    const sP = this.sliderBody.translation();
    this.sliderMesh.position.set(sP.x, sP.y, sP.z);

    // Kinematic Riser
    const rP = this.riserBody.translation();
    this.riserMesh.position.set(rP.x, rP.y, rP.z);

    // 4-Bar Linkages: Link A and Link B
    // Link A connects Anchor (x - 0.09, y + 0.02) to Riser (rP.x - 0.022, rP.y)
    const pAnchor = new THREE.Vector3(x - 0.09, y + 0.022, z);
    const pRiserLeft = new THREE.Vector3(rP.x - 0.022, rP.y - 0.004, z);
    const midA = new THREE.Vector3().addVectors(pAnchor, pRiserLeft).multiplyScalar(0.5);
    const deltaA = new THREE.Vector3().subVectors(pRiserLeft, pAnchor);
    const angleA = Math.atan2(deltaA.y, deltaA.x);

    this.linkAMesh.position.set(midA.x, midA.y, midA.z + 0.014);
    this.linkAMesh.rotation.z = angleA;

    // Link B connects Riser (rP.x + 0.022, rP.y) to Slider (sP.x, y + 0.022)
    const pRiserRight = new THREE.Vector3(rP.x + 0.022, rP.y - 0.004, z);
    const pSlider = new THREE.Vector3(sP.x, y + 0.022, z);
    const midB = new THREE.Vector3().addVectors(pRiserRight, pSlider).multiplyScalar(0.5);
    const deltaB = new THREE.Vector3().subVectors(pSlider, pRiserRight);
    const angleB = Math.atan2(deltaB.y, deltaB.x);

    this.linkBMesh.position.set(midB.x, midB.y, midB.z + 0.014);
    this.linkBMesh.rotation.z = angleB;
  }

  public reset(): void {
    const { x, y, z } = this.basePos;
    const zeroVel = { x: 0, y: 0, z: 0 };
    const identQuat = { x: 0, y: 0, z: 0, w: 1 };

    this.anchorBody.setTranslation({ x: x - 0.09, y: y + 0.015, z }, true);
    this.anchorBody.setRotation(identQuat, true);

    this.sliderBody.setTranslation({ x: x + this.initialSliderOffset, y: y + 0.024, z }, true);
    this.sliderBody.setRotation(identQuat, true);
    this.sliderBody.setLinvel(zeroVel, true);
    this.sliderBody.setAngvel(zeroVel, true);

    this.riserBody.setTranslation({ x, y: y + 0.038, z }, true);
    this.riserBody.setRotation(identQuat, true);

    this.currentProgress = 0.0;
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
    const currX = this.sliderBody.translation().x;
    const targetX = THREE.MathUtils.clamp(
      groundTarget.x,
      this.basePos.x + 0.035,
      this.basePos.x + this.initialSliderOffset
    );
    const velX = (targetX - currX) * 15.0;
    this.sliderBody.setLinvel({ x: velX, y: 0, z: 0 }, true);
  }

  public destroy(): void {
    const bodies = [this.anchorBody, this.sliderBody, this.riserBody];
    for (const b of bodies) {
      if (b) this.world.removeRigidBody(b);
    }
    this.rootGroup.clear();
  }
}
