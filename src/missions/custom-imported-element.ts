import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { MissionElement } from './types';
import { RobotAssemblySpec } from '../cad/types';
import { LEGO_COLORS, getLegoMaterial } from '../view/lego-visuals';
import { legoAssetManager } from '../cad/lego-asset-manager';
import { DualLockMarker } from './dual-lock-marker';
import { consolidateGroupMeshes } from '../cad/mesh-consolidator';

export interface CustomElementOptions {
  id: string;
  name: string;
  description?: string;
  sourceFile?: string;
  isBaseFixed?: boolean;
  isSolidRigidMode?: boolean;
  parentMissionId?: string;
}

/**
 * Custom Imported Mission Element
 * 
 * Instantiates any Studio 2.0 (.io) or LDraw (.ldr/.mpd/.dat) assembly as a
 * fully interactive physical mission model with accurate Rapier colliders,
 * joints, and authentic LEGO visual materials.
 */
export class CustomImportedMissionElement implements MissionElement {
  public readonly id: string;
  public readonly name: string;
  public readonly description: string;
  public readonly sourceFile?: string;
  public parentMissionId?: string;
  public isDualLocked: boolean = true;
  public isPlacedOnField: boolean = true;
  public readonly rootGroup: THREE.Group;

  private world!: RAPIER.World;
  private spec: RobotAssemblySpec;
  private basePos: { x: number; y: number; z: number } = { x: 0, y: 0.002, z: 0 };
  private yawDegrees: number = 0;
  private isBaseFixed: boolean;
  private isSolidRigidMode: boolean;
  private groundCorrectionY: number = 0;
  private dualLockMarker: DualLockMarker | null = null;
  private dualLockAnchorOffset: { x: number; z: number } = { x: 0, z: 0 };
  private dualLockJoint: RAPIER.ImpulseJoint | null = null;
  private dualLockAnchorBody: RAPIER.RigidBody | null = null;

  // Physics Bodies
  private bodies: Map<string, RAPIER.RigidBody> = new Map();
  private initialBodyPoses: Map<string, { translation: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number; w: number } }> = new Map();
  private joints: RAPIER.ImpulseJoint[] = [];

  // Visual Groups
  public readonly clusterMeshes: Map<string, THREE.Group> = new Map();
  private interactiveMeshes: THREE.Object3D[] = [];

  // Scored state
  private hasMovedFromInitial = false;

  constructor(spec: RobotAssemblySpec, options: CustomElementOptions) {
    this.spec = spec;
    this.id = options.id;
    this.name = options.name;
    this.description = options.description || `Imported mission model: ${options.name}`;
    this.sourceFile = options.sourceFile;
    this.parentMissionId = options.parentMissionId;
    this.isBaseFixed = options.isBaseFixed ?? true;
    this.isDualLocked = this.isBaseFixed;
    this.isSolidRigidMode = options.isSolidRigidMode ?? false;
    this.rootGroup = new THREE.Group();
  }

  public setSolidRigidMode(enabled: boolean): void {
    if (this.isSolidRigidMode === enabled) return;
    this.isSolidRigidMode = enabled;
    if (this.world) {
      this.destroy();
      this.createPhysicsAndVisuals();
      this.reset();
    }
  }

  public getSolidRigidMode(): boolean {
    return this.isSolidRigidMode;
  }

  public setIsBaseFixed(fixed: boolean): void {
    if (this.isBaseFixed === fixed) return;
    this.isBaseFixed = fixed;
    if (this.world) {
      this.destroy();
      this.createPhysicsAndVisuals();
      this.reset();
    }
  }

  public getIsBaseFixed(): boolean {
    return this.isBaseFixed;
  }

  /**
   * Sets Dual-Lock fastening status (base fixed to field, mechanisms stay dynamic)
   */
  public setDualLocked(locked: boolean, anchorPoint?: { x: number; z: number }): void {
    this.isDualLocked = locked;
    this.isBaseFixed = locked;

    if (anchorPoint) {
      this.dualLockAnchorOffset = {
        x: anchorPoint.x - this.basePos.x,
        z: anchorPoint.z - this.basePos.z,
      };
    }

    // Clean up any existing physical Dual Lock joint
    if (this.dualLockJoint && this.world) {
      try {
        this.world.removeImpulseJoint(this.dualLockJoint, true);
      } catch {
        // ignore
      }
      this.dualLockJoint = null;
    }
    if (this.dualLockAnchorBody && this.world) {
      try {
        this.world.removeRigidBody(this.dualLockAnchorBody);
      } catch {
        // ignore
      }
      this.dualLockAnchorBody = null;
    }

    // Determine the base cluster ID (root frame where Dual Lock is attached to the field)
    const baseClusterId = this.spec.clusters.find((c) => c.isRootChassis)?.clusterId || this.spec.clusters[0]?.clusterId || 'base';

    // Update Rapier bodies:
    // Only the base cluster where Dual Lock is applied is fixed to the field mat.
    // All mechanism clusters, levers, dials, and dynamic parts REMAIN DYNAMIC!
    for (const [cid, body] of this.bodies.entries()) {
      const isBase = cid === baseClusterId || cid === 'base' || cid === 'chassis_root';
      const cluster = this.spec.clusters.find((c) => c.clusterId === cid);

      // Only base is fixed when locked; mechanisms and dynamic clusters stay dynamic!
      const shouldBeFixed = this.isSolidRigidMode || 
        (locked && isBase && (cluster?.isFixed !== false));

      body.setBodyType(
        shouldBeFixed ? RAPIER.RigidBodyType.Fixed : RAPIER.RigidBodyType.Dynamic,
        true
      );
      if (!shouldBeFixed) {
        body.setLinearDamping(2.0);
        body.setAngularDamping(3.0);
        body.wakeUp();
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
      const worldX = this.basePos.x + this.dualLockAnchorOffset.x;
      const worldZ = this.basePos.z + this.dualLockAnchorOffset.z;
      this.dualLockMarker.setPosition(worldX, 0.002, worldZ);
    }
  }

  public getDualLockMarker(): DualLockMarker | null {
    return this.dualLockMarker;
  }

  public setDualLockHoverHighlight(isHovered: boolean, isEraseMode: boolean = false): void {
    this.dualLockMarker?.setHoverHighlight(isHovered, isEraseMode);
  }

  public getSpec(): RobotAssemblySpec {
    return this.spec;
  }

  public init(world: RAPIER.World, basePosition: { x: number; y: number; z: number }, yawDegrees = 0): void {
    this.world = world;
    this.basePos = { ...basePosition };
    this.yawDegrees = yawDegrees;

    this.createPhysicsAndVisuals();
    this.reset();
    this.updateDualLockVisualMesh();
  }

  private createPhysicsAndVisuals(): void {
    const yawRad = (this.yawDegrees * Math.PI) / 180;
    const halfYaw = yawRad / 2;
    const qy = Math.sin(halfYaw);
    const qw = Math.cos(halfYaw);

    // Calculate vertical normalization offset so lowest part rests exactly at ground level (this.basePos.y)
    let lowestPartY = Infinity;
    for (const cluster of this.spec.clusters) {
      if (cluster.parts && cluster.parts.length > 0) {
        for (const p of cluster.parts) {
          const py = p.position[1] / 1000;
          if (py < lowestPartY) lowestPartY = py;
        }
      } else {
        for (const col of cluster.colliders) {
          const cy = col.offset[1];
          const hy = col.halfExtents ? col.halfExtents[1] : 0.015;
          const bottomY = cy - hy;
          if (bottomY < lowestPartY) lowestPartY = bottomY;
        }
      }
    }
    this.groundCorrectionY = lowestPartY !== Infinity ? -lowestPartY : 0;
    const initialY = this.basePos.y + this.groundCorrectionY;

    // Color palette cycling for imported clusters
    const clusterPalette = [
      LEGO_COLORS.DARK_BLUE,
      LEGO_COLORS.RED,
      LEGO_COLORS.YELLOW,
      LEGO_COLORS.DARK_GRAY,
      LEGO_COLORS.LIGHT_GRAY,
      LEGO_COLORS.AZURE,
      LEGO_COLORS.ORANGE,
    ];

    let colorIdx = 0;

    for (const cluster of this.spec.clusters) {
      const isFixedCluster = cluster.isFixed !== undefined
        ? cluster.isFixed
        : (cluster.isRootChassis && this.isBaseFixed);
      const clusterColor = clusterPalette[colorIdx % clusterPalette.length];
      colorIdx++;

      // Create Rapier RigidBody:
      // Fixed if in solid rigid mode, or if tagged fixed (anchored to field mat).
      // Dynamic clusters react to robot pushes, tools, and collisions!
      let bodyDesc: RAPIER.RigidBodyDesc;
      if (this.isSolidRigidMode || isFixedCluster) {
        bodyDesc = RAPIER.RigidBodyDesc.fixed()
          .setTranslation(this.basePos.x, initialY, this.basePos.z)
          .setRotation({ x: 0, y: qy, z: 0, w: qw });
      } else {
        bodyDesc = RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(this.basePos.x, initialY, this.basePos.z)
          .setRotation({ x: 0, y: qy, z: 0, w: qw })
          .setLinearDamping(2.0)
          .setAngularDamping(3.0)
          .setAdditionalMass(Math.max(0.05, cluster.totalMassKg));
      }

      const body = this.world.createRigidBody(bodyDesc);
      this.bodies.set(cluster.clusterId, body);

      // Create Visual Group for this cluster
      const clusterGroup = new THREE.Group();
      this.rootGroup.add(clusterGroup);
      this.clusterMeshes.set(cluster.clusterId, clusterGroup);

      // Create physical colliders in Rapier
      for (const col of cluster.colliders) {
        let colDesc: RAPIER.ColliderDesc;

        if (col.shape === 'sphere') {
          const r = col.radius || 0.015;
          colDesc = RAPIER.ColliderDesc.ball(r);
        } else if (col.shape === 'cylinder') {
          const r = col.radius || 0.015;
          const hh = col.halfHeight || 0.02;
          colDesc = RAPIER.ColliderDesc.cylinder(hh, r);
        } else {
          // Default: Box collider
          const hx = col.halfExtents ? col.halfExtents[0] : 0.03;
          const hy = col.halfExtents ? col.halfExtents[1] : 0.015;
          const hz = col.halfExtents ? col.halfExtents[2] : 0.03;
          colDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz);
        }

        // Collision filtering:
        // Group 3 (0x0008): Fixed base clusters (filters 0xFFEF, ignores dynamic mechanisms)
        // Group 4 (0x0010): Dynamic mechanism clusters (filters 0xFFF7, ignores fixed base)
        const membership = isFixedCluster ? 0x0008 : 0x0010;
        const filter = isFixedCluster ? 0xFFEF : 0xFFF7;
        colDesc.setCollisionGroups((membership << 16) | filter);

        colDesc
          .setTranslation(col.offset[0], col.offset[1], col.offset[2])
          .setFriction(col.friction || 0.6)
          .setRestitution(col.restitution || 0.0);
        this.world.createCollider(colDesc, body);
      }

      // Render authentic LEGO bricks, plates, beams, pins, axles!
      const hasDetailedParts = cluster.parts && cluster.parts.length > 0;
      if (hasDetailedParts) {
        for (const part of cluster.parts!) {
          const partColor = part.colorHex ?? clusterColor;
          const partMesh = legoAssetManager.loadPartMeshSync(part.partNumber, partColor, part.role);
          partMesh.position.set(part.position[0] / 1000, part.position[1] / 1000, part.position[2] / 1000);
          partMesh.quaternion.set(part.rotation[0], part.rotation[1], part.rotation[2], part.rotation[3]);
          clusterGroup.add(partMesh);
        }

        // Consolidate cluster geometries to reduce draw calls from thousands down to 1-3
        if (cluster.parts!.length > 2) {
          consolidateGroupMeshes(clusterGroup, { clusterId: cluster.clusterId });
        }

        if (!isFixedCluster) {
          for (const child of clusterGroup.children) {
            this.interactiveMeshes.push(child);
          }
        }

        // Asynchronously upgrade to Draco GLB mesh when ready
        if (legoAssetManager.getRenderMode() === 'draco_glb') {
          Promise.all(
            cluster.parts!.map(async (part) => {
              const partColor = part.colorHex ?? clusterColor;
              const loadedMesh = await legoAssetManager.loadPartMesh(part.partNumber, partColor, part.role);
              loadedMesh.position.set(part.position[0] / 1000, part.position[1] / 1000, part.position[2] / 1000);
              loadedMesh.quaternion.set(part.rotation[0], part.rotation[1], part.rotation[2], part.rotation[3]);
              return loadedMesh;
            })
          ).then((upgradedMeshes) => {
            clusterGroup.clear();
            for (const m of upgradedMeshes) {
              clusterGroup.add(m);
            }
            if (cluster.parts!.length > 2) {
              consolidateGroupMeshes(clusterGroup, { clusterId: cluster.clusterId });
            }
            if (!isFixedCluster) {
              this.interactiveMeshes = this.interactiveMeshes.filter((m) => !clusterGroup.children.includes(m));
              for (const child of clusterGroup.children) {
                this.interactiveMeshes.push(child);
              }
            }
          });
        }
      } else {
        // Fallback: render collider bounding box if parts list is empty
        for (const col of cluster.colliders) {
          const hx = col.halfExtents ? col.halfExtents[0] : 0.03;
          const hy = col.halfExtents ? col.halfExtents[1] : 0.015;
          const hz = col.halfExtents ? col.halfExtents[2] : 0.03;
          const meshGeom = new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2);
          const meshMat = getLegoMaterial(clusterColor, 0.35, 0.05);
          const colMesh = new THREE.Mesh(meshGeom, meshMat);
          colMesh.position.set(col.offset[0], col.offset[1], col.offset[2]);
          colMesh.castShadow = true;
          colMesh.receiveShadow = true;
          clusterGroup.add(colMesh);

          if (!isFixedCluster) {
            this.interactiveMeshes.push(colMesh);
          }
        }
      }
    }

    // Connect joints between clusters
    for (const jointSpec of this.spec.joints) {
      const parentBody = this.bodies.get(jointSpec.parentClusterId);
      const childBody = this.bodies.get(jointSpec.childClusterId);
      if (parentBody && childBody) {
        const jointData = jointSpec.type === 'SPHERICAL'
          ? RAPIER.JointData.spherical(
              { x: jointSpec.anchorParent[0], y: jointSpec.anchorParent[1], z: jointSpec.anchorParent[2] },
              { x: jointSpec.anchorChild[0], y: jointSpec.anchorChild[1], z: jointSpec.anchorChild[2] }
            )
          : RAPIER.JointData.revolute(
              { x: jointSpec.anchorParent[0], y: jointSpec.anchorParent[1], z: jointSpec.anchorParent[2] },
              { x: jointSpec.anchorChild[0], y: jointSpec.anchorChild[1], z: jointSpec.anchorChild[2] },
              { x: jointSpec.axis[0], y: jointSpec.axis[1], z: jointSpec.axis[2] }
            );
        const rapierJoint = this.world.createImpulseJoint(jointData, parentBody, childBody, true);
        rapierJoint.setContactsEnabled(false);
        this.joints.push(rapierJoint);
      }
    }

    this.recordInitialPoses();
  }

  private recordInitialPoses(): void {
    this.initialBodyPoses.clear();
    for (const [id, body] of this.bodies.entries()) {
      const trans = body.translation();
      const rot = body.rotation();
      this.initialBodyPoses.set(id, {
        translation: { x: trans.x, y: trans.y, z: trans.z },
        rotation: { x: rot.x, y: rot.y, z: rot.z, w: rot.w },
      });
    }
  }

  public update(_dt: number): void {
    if (!this.bodies.size) return;

    // Check if any non-fixed cluster has moved from its resting position
    for (const [id, body] of this.bodies.entries()) {
      const initPose = this.initialBodyPoses.get(id);
      if (!initPose) continue;
      const curTrans = body.translation();
      const dx = curTrans.x - initPose.translation.x;
      const dy = curTrans.y - initPose.translation.y;
      const dz = curTrans.z - initPose.translation.z;
      if (dx * dx + dy * dy + dz * dz > 0.001) {
        this.hasMovedFromInitial = true;
        break;
      }
    }
  }

  public syncVisuals(): void {
    for (const [id, body] of this.bodies.entries()) {
      const group = this.clusterMeshes.get(id);
      if (!group) continue;
      const t = body.translation();
      const r = body.rotation();
      group.position.set(t.x, t.y, t.z);
      group.quaternion.set(r.x, r.y, r.z, r.w);

      const cluster = this.spec.clusters.find((c) => c.clusterId === id);
      if (cluster?.isRootChassis || id === 'chassis_root' || this.spec.clusters.length === 1) {
        this.basePos.x = t.x;
        this.basePos.z = t.z;
      }
    }
  }

  public reset(): void {
    const yawRad = (this.yawDegrees * Math.PI) / 180;
    const halfYaw = yawRad / 2;
    const qy = Math.sin(halfYaw);
    const qw = Math.cos(halfYaw);
    const zeroVel = { x: 0, y: 0, z: 0 };

    const initialY = this.basePos.y + this.groundCorrectionY;

    for (const body of this.bodies.values()) {
      body.setTranslation({ x: this.basePos.x, y: initialY, z: this.basePos.z }, true);
      body.setRotation({ x: 0, y: qy, z: 0, w: qw }, true);
      body.setLinvel(zeroVel, true);
      body.setAngvel(zeroVel, true);
    }

    this.hasMovedFromInitial = false;
    this.recordInitialPoses();
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
    return this.hasMovedFromInitial;
  }

  public getScore(): number {
    return this.hasMovedFromInitial ? 100 : 0;
  }

  public getInteractiveMeshes(): THREE.Object3D[] {
    return this.interactiveMeshes;
  }

  public applyUserDrag(groundTarget: THREE.Vector3): void {
    // Apply dynamic impulse to non-fixed bodies
    for (const [id, body] of this.bodies.entries()) {
      const cluster = this.spec.clusters.find((c) => c.clusterId === id);
      if (cluster?.isRootChassis && this.isBaseFixed) continue;

      const curTrans = body.translation();
      const vx = (groundTarget.x - curTrans.x) * 10.0;
      const vz = (groundTarget.z - curTrans.z) * 10.0;
      body.setLinvel({ x: vx, y: 0, z: vz }, true);
    }
  }

  public destroy(): void {
    if (this.dualLockMarker) {
      this.rootGroup.remove(this.dualLockMarker.group);
      this.dualLockMarker = null;
    }

    if (this.dualLockJoint && this.world) {
      try {
        this.world.removeImpulseJoint(this.dualLockJoint, true);
      } catch {
        // ignore
      }
      this.dualLockJoint = null;
    }
    if (this.dualLockAnchorBody && this.world) {
      try {
        this.world.removeRigidBody(this.dualLockAnchorBody);
      } catch {
        // ignore
      }
      this.dualLockAnchorBody = null;
    }

    for (const joint of this.joints) {
      this.world.removeImpulseJoint(joint, true);
    }
    this.joints = [];

    for (const body of this.bodies.values()) {
      this.world.removeRigidBody(body);
    }
    this.bodies.clear();
    this.rootGroup.clear();
  }
}
