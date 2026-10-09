import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

/**
 * Interactive Mouse Testing Tool & Dynamic Test Blocks
 *
 * Allows users in Sandbox Mode to physically manipulate mission mechanisms using
 * a mouse-controlled kinematic pusher probe and spawnable dynamic LEGO-style test blocks.
 */
export class SandboxInteractionTool {
  public rootGroup: THREE.Group;
  public isActive = true;

  private world!: RAPIER.World;
  private pusherBody: RAPIER.RigidBody | null = null;
  private pusherMesh: THREE.Group | null = null;

  // Dynamic test blocks spawned by user
  private spawnedBlocks: Array<{
    body: RAPIER.RigidBody;
    mesh: THREE.Mesh;
  }> = [];

  private currentTargetPos = new THREE.Vector3(0, 0.035, 0.20);

  constructor() {
    this.rootGroup = new THREE.Group();
  }

  public init(world: RAPIER.World, parentScene: THREE.Scene): void {
    this.world = world;
    parentScene.add(this.rootGroup);

    this.createPusherTool();
  }

  private createPusherTool(): void {
    // Kinematic position-based rigid body so it exerts physical contact forces on mechanisms
    const desc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(this.currentTargetPos.x, this.currentTargetPos.y, this.currentTargetPos.z);
    this.pusherBody = this.world.createRigidBody(desc);

    // Pusher probe collider: 10cm wide x 3.5cm high x 5cm deep
    const colliderDesc = RAPIER.ColliderDesc.cuboid(0.05, 0.018, 0.025)
      .setFriction(0.8)
      .setRestitution(0.1);
    this.world.createCollider(colliderDesc, this.pusherBody);

    // Three.js visual mesh
    this.pusherMesh = new THREE.Group();

    // Main orange beam
    const beamGeom = new THREE.BoxGeometry(0.10, 0.036, 0.05);
    const beamMat = new THREE.MeshStandardMaterial({
      color: 0xf97316, // Vibrant orange
      roughness: 0.3,
      metalness: 0.2,
    });
    const beamMesh = new THREE.Mesh(beamGeom, beamMat);
    beamMesh.castShadow = true;
    this.pusherMesh.add(beamMesh);

    // Handle / Grip knob on top
    const knobGeom = new THREE.CylinderGeometry(0.015, 0.015, 0.025, 16);
    const knobMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 });
    const knobMesh = new THREE.Mesh(knobGeom, knobMat);
    knobMesh.position.set(0, 0.025, 0);
    this.pusherMesh.add(knobMesh);

    // Front contact face highlight
    const contactGeom = new THREE.BoxGeometry(0.095, 0.03, 0.005);
    const contactMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
    const contactMesh = new THREE.Mesh(contactGeom, contactMat);
    contactMesh.position.set(0, 0, -0.026);
    this.pusherMesh.add(contactMesh);

    this.rootGroup.add(this.pusherMesh);
    this.syncVisuals();
  }

  /**
   * Drops a dynamic 2x4 LEGO-style test brick onto the table
   */
  public spawnTestBlock(spawnPos?: { x: number; y: number; z: number }): void {
    const x = spawnPos?.x ?? (Math.random() * 0.1 - 0.05);
    const y = spawnPos?.y ?? 0.12; // Drop from above
    const z = spawnPos?.z ?? (0.15 + Math.random() * 0.05);

    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y, z)
      .setLinearDamping(0.8)
      .setAngularDamping(1.5);
    const body = this.world.createRigidBody(desc);

    // LEGO 2x4 block dimensions: ~6.4cm x 2cm x 3.2cm
    const collider = RAPIER.ColliderDesc.cuboid(0.032, 0.01, 0.016)
      .setDensity(1.2)
      .setFriction(0.6);
    this.world.createCollider(collider, body);

    // Palette of vibrant LEGO colors
    const colors = [0x0284c7, 0xef4444, 0x10b981, 0xfacc15, 0x8b5cf6];
    const color = colors[this.spawnedBlocks.length % colors.length];

    const geom = new THREE.BoxGeometry(0.064, 0.02, 0.032);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.3 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.rootGroup.add(mesh);

    this.spawnedBlocks.push({ body, mesh });
  }

  /**
   * Updates target position of pusher tool based on mouse raycast coordinates
   */
  public movePusherTo(x: number, z: number): void {
    if (!this.pusherBody || !this.isActive) return;

    // Constrain tool to reasonable test bench boundaries
    const clampedX = THREE.MathUtils.clamp(x, -0.60, 0.60);
    const clampedZ = THREE.MathUtils.clamp(z, -0.40, 0.40);
    this.currentTargetPos.set(clampedX, 0.035, clampedZ);

    this.pusherBody.setNextKinematicTranslation({
      x: this.currentTargetPos.x,
      y: this.currentTargetPos.y,
      z: this.currentTargetPos.z,
    });
  }

  public setActive(active: boolean): void {
    this.isActive = active;
    this.rootGroup.visible = active;
    if (this.pusherBody) {
      if (active) {
        this.pusherBody.setTranslation({ x: 0, y: 0.035, z: 0.20 }, true);
      } else {
        // Move off-stage when inactive
        this.pusherBody.setTranslation({ x: 0, y: -50, z: 0 }, true);
      }
    }
  }

  public syncVisuals(): void {
    if (this.pusherBody && this.pusherMesh) {
      const p = this.pusherBody.translation();
      const r = this.pusherBody.rotation();
      this.pusherMesh.position.set(p.x, p.y, p.z);
      this.pusherMesh.quaternion.set(r.x, r.y, r.z, r.w);
    }

    // Sync spawned blocks
    for (const item of this.spawnedBlocks) {
      const p = item.body.translation();
      const r = item.body.rotation();
      item.mesh.position.set(p.x, p.y, p.z);
      item.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  public resetPusher(): void {
    if (!this.pusherBody) return;
    this.currentTargetPos.set(0, 0.035, 0.20);
    this.pusherBody.setTranslation({ x: 0, y: 0.035, z: 0.20 }, true);
    this.syncVisuals();
  }

  public clearSpawnedBlocks(): void {
    for (const item of this.spawnedBlocks) {
      this.world.removeRigidBody(item.body);
      this.rootGroup.remove(item.mesh);
    }
    this.spawnedBlocks = [];
  }

  public resetAll(): void {
    this.resetPusher();
    this.clearSpawnedBlocks();
  }

  public getPusherMesh(): THREE.Object3D | null {
    return this.pusherMesh;
  }
}
