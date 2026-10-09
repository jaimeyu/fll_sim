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
    // Kinematic position-based rigid body for physical contact forces
    const desc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(this.currentTargetPos.x, this.currentTargetPos.y, this.currentTargetPos.z);
    this.pusherBody = this.world.createRigidBody(desc);

    // Omni-directional cylindrical bumper: radius 4cm, half-height 2cm
    // Glides effortlessly against flat or curved surfaces without snagging corners
    const colliderDesc = RAPIER.ColliderDesc.cylinder(0.02, 0.04)
      .setFriction(0.8)
      .setRestitution(0.1);
    this.world.createCollider(colliderDesc, this.pusherBody);

    // Three.js visual mesh
    this.pusherMesh = new THREE.Group();

    // 1. High-visibility orange bumper body
    const cylinderGeom = new THREE.CylinderGeometry(0.04, 0.04, 0.038, 32);
    const cylinderMat = new THREE.MeshStandardMaterial({
      color: 0xf97316, // Vibrant safety orange
      roughness: 0.3,
      metalness: 0.2,
    });
    const cylinderMesh = new THREE.Mesh(cylinderGeom, cylinderMat);
    cylinderMesh.castShadow = true;
    this.pusherMesh.add(cylinderMesh);

    // 2. Heavy-duty rubber bumper ring
    const ringGeom = new THREE.TorusGeometry(0.04, 0.005, 12, 32);
    ringGeom.rotateX(Math.PI / 2);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 });
    const ringMesh = new THREE.Mesh(ringGeom, ringMat);
    this.pusherMesh.add(ringMesh);

    // 3. Ergonomic grip handle on top
    const handleGeom = new THREE.CylinderGeometry(0.014, 0.016, 0.035, 16);
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.3 });
    const handleMesh = new THREE.Mesh(handleGeom, handleMat);
    handleMesh.position.set(0, 0.032, 0);
    this.pusherMesh.add(handleMesh);

    // 4. Grip cap
    const capGeom = new THREE.SphereGeometry(0.018, 16, 12);
    const capMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.2 });
    const capMesh = new THREE.Mesh(capGeom, capMat);
    capMesh.position.set(0, 0.05, 0);
    this.pusherMesh.add(capMesh);

    this.rootGroup.add(this.pusherMesh);
    this.syncVisuals();
  }

  /**
   * Drops a dynamic 2x4 LEGO-style test brick onto the table near the mechanism
   */
  public spawnTestBlock(spawnPos?: { x: number; y: number; z: number }): void {
    const x = spawnPos?.x ?? (Math.random() * 0.1 - 0.05);
    const y = spawnPos?.y ?? 0.12; // Drop from above
    const z = spawnPos?.z ?? (0.08 + Math.random() * 0.06);

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

  public getSpawnedBlocks(): Array<{ body: RAPIER.RigidBody; mesh: THREE.Mesh }> {
    return this.spawnedBlocks;
  }

  public dragBlock(item: { body: RAPIER.RigidBody; mesh: THREE.Mesh }, x: number, z: number): void {
    const clampedX = THREE.MathUtils.clamp(x, -0.45, 0.45);
    const clampedZ = THREE.MathUtils.clamp(z, -0.45, 0.45);
    item.body.setTranslation({ x: clampedX, y: 0.02, z: clampedZ }, true);
    item.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    item.mesh.position.set(clampedX, 0.02, clampedZ);
  }

  public setPusherInitialPose(pos: { x: number; y: number; z: number }): void {
    this.currentTargetPos.set(pos.x, pos.y, pos.z);
    if (this.pusherBody) {
      this.pusherBody.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
    }
    if (this.pusherMesh) {
      this.pusherMesh.position.set(pos.x, pos.y, pos.z);
    }
  }

  /**
   * Updates target position of pusher tool based on mouse raycast coordinates
   */
  public movePusherTo(x: number, z: number): void {
    if (!this.pusherBody || !this.isActive) return;

    // Constrain tool to reasonable test bench boundaries
    const clampedX = THREE.MathUtils.clamp(x, -0.48, 0.48);
    const clampedZ = THREE.MathUtils.clamp(z, -0.48, 0.48);
    this.currentTargetPos.set(clampedX, 0.035, clampedZ);

    this.pusherBody.setNextKinematicTranslation({
      x: this.currentTargetPos.x,
      y: this.currentTargetPos.y,
      z: this.currentTargetPos.z,
    });

    // Immediate visual update for ultra-smooth responsiveness
    if (this.pusherMesh) {
      this.pusherMesh.position.set(clampedX, 0.035, clampedZ);
    }
  }

  public setActive(active: boolean): void {
    this.isActive = active;
    this.rootGroup.visible = active;
    if (this.pusherBody) {
      if (active) {
        this.pusherBody.setTranslation({
          x: this.currentTargetPos.x,
          y: this.currentTargetPos.y,
          z: this.currentTargetPos.z,
        }, true);
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
