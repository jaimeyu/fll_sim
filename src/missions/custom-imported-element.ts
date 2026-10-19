import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { MissionElement } from './types';
import { RobotAssemblySpec } from '../cad/types';
import type { FllPhysicsSpec, FllJointDef } from '../cad/physics-spec';
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
  private dualLockLocalOffset: { x: number; z: number } | null = null;
  private anchoredClusterId: string | null = null;
  private dualLockJoint: RAPIER.ImpulseJoint | null = null;
  private dualLockAnchorBody: RAPIER.RigidBody | null = null;

  // Physics Bodies
  private bodies: Map<string, RAPIER.RigidBody> = new Map();
  private initialBodyPoses: Map<string, { translation: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number; w: number } }> = new Map();
  private joints: RAPIER.ImpulseJoint[] = [];
  private physicsJointMap: Map<string, { joint: RAPIER.ImpulseJoint; def: FllJointDef }> = new Map();
  private jointInitialRelativeRot: Map<string, THREE.Quaternion> = new Map();

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
    this.isDualLocked = fixed;
    if (this.world) {
      this.destroy();
      this.createPhysicsAndVisuals();
      this.reset();
    }
  }

  public getIsBaseFixed(): boolean {
    return this.isDualLocked;
  }

  /**
   * Resolves the primary base cluster ID that rests on the field mat and holds Dual Lock fasteners
   */
  public getBaseClusterId(): string {
    if (this.spec.physicsSpec?.dualLockAnchors && this.spec.physicsSpec.dualLockAnchors.length > 0) {
      const anchorClusterId = this.spec.physicsSpec.dualLockAnchors[0].clusterId;
      if (this.spec.clusters.some((c) => c.clusterId === anchorClusterId)) {
        return anchorClusterId;
      }
    }
    if (this.anchoredClusterId && this.spec.clusters.some((c) => c.clusterId === this.anchoredClusterId)) {
      return this.anchoredClusterId;
    }
    const root = this.spec.clusters.find((c) => c.isRootChassis || c.clusterId === 'chassis_root');
    if (root) return root.clusterId;

    // Pick the cluster with the lowest bottom-Y (resting closest to the mat)
    let lowestClusterId = this.spec.clusters[0]?.clusterId || 'base';
    let lowestY = Infinity;
    for (const c of this.spec.clusters) {
      let cMinY = Infinity;
      if (c.parts && c.parts.length > 0) {
        for (const p of c.parts) {
          if (p.position[1] / 1000 < cMinY) cMinY = p.position[1] / 1000;
        }
      } else {
        for (const col of c.colliders) {
          const hy = col.halfExtents ? col.halfExtents[1] : 0.015;
          const bottom = col.offset[1] - hy;
          if (bottom < cMinY) cMinY = bottom;
        }
      }
      if (cMinY < lowestY) {
        lowestY = cMinY;
        lowestClusterId = c.clusterId;
      }
    }
    return lowestClusterId;
  }

  public isClusterDualLockAnchored(clusterId: string): boolean {
    if (this.spec.physicsSpec?.dualLockAnchors && this.spec.physicsSpec.dualLockAnchors.length > 0) {
      return this.spec.physicsSpec.dualLockAnchors.some((a) => a.clusterId === clusterId);
    }
    return clusterId === this.getBaseClusterId();
  }

  public getAnchoredClusterId(): string | null {
    return this.isDualLocked ? (this.anchoredClusterId || this.getBaseClusterId()) : null;
  }

  /**
   * Sets Dual-Lock fastening status (base cluster fixed to field, mechanisms stay dynamic)
   */
  public setDualLocked(locked: boolean, anchorPoint?: { x: number; z: number }, targetClusterId?: string): void {
    this.isDualLocked = locked;
    this.isBaseFixed = locked;

    if (locked) {
      if (targetClusterId && this.spec.clusters.some((c) => c.clusterId === targetClusterId)) {
        this.anchoredClusterId = targetClusterId;
      }
    } else {
      this.anchoredClusterId = null;
      this.dualLockLocalOffset = null;
    }

    if (anchorPoint && locked) {
      const radYaw = (this.yawDegrees * Math.PI) / 180;
      const cosY = Math.cos(radYaw);
      const sinY = Math.sin(radYaw);
      const dx = anchorPoint.x - this.basePos.x;
      const dz = anchorPoint.z - this.basePos.z;
      this.dualLockLocalOffset = {
        x: dx * cosY - dz * sinY,
        z: dx * sinY + dz * cosY,
      };
    } else if (locked && !this.dualLockLocalOffset) {
      if (this.spec.physicsSpec?.dualLockAnchors?.[0]) {
        const anchor = this.spec.physicsSpec.dualLockAnchors[0];
        const rawX = anchor.localStudCoordinates[0];
        const rawZ = anchor.localStudCoordinates[2];
        const offX = Math.abs(rawX) > 2 ? rawX / 1000 : rawX;
        const offZ = Math.abs(rawZ) > 2 ? rawZ / 1000 : rawZ;
        this.dualLockLocalOffset = { x: offX, z: offZ };
      } else if (targetClusterId) {
        const targetCluster = this.spec.clusters.find((c) => c.clusterId === targetClusterId);
        if (targetCluster) {
          let avgX = 0;
          let avgZ = 0;
          let count = 0;
          if (targetCluster.parts && targetCluster.parts.length > 0) {
            for (const p of targetCluster.parts) {
              avgX += p.position[0] / 1000;
              avgZ += p.position[2] / 1000;
              count++;
            }
          } else if (targetCluster.colliders && targetCluster.colliders.length > 0) {
            for (const col of targetCluster.colliders) {
              avgX += col.offset[0];
              avgZ += col.offset[2];
              count++;
            }
          }
          if (count > 0) {
            this.dualLockLocalOffset = { x: avgX / count, z: avgZ / count };
          }
        }
      }
      if (!this.dualLockLocalOffset) {
        this.dualLockLocalOffset = { x: 0, z: 0 };
      }
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
    const baseClusterId = this.getBaseClusterId();

    // Update Rapier bodies:
    // Only the base cluster where Dual Lock is applied is fixed to the field mat.
    // All mechanism clusters, levers, dials, and dynamic parts REMAIN DYNAMIC!
    for (const [cid, body] of this.bodies.entries()) {
      const isBase = this.isClusterDualLockAnchored(cid) || cid === baseClusterId;
      const shouldBeFixed = this.isSolidRigidMode || (locked && isBase);

      body.setBodyType(
        shouldBeFixed ? RAPIER.RigidBodyType.Fixed : RAPIER.RigidBodyType.Dynamic,
        true
      );
      if (!shouldBeFixed) {
        body.setLinearDamping(1.5);
        body.setAngularDamping(2.0);
        body.wakeUp();
      }
    }

    // Keep cluster specs synchronized
    for (const cluster of this.spec.clusters) {
      const isBase = this.isClusterDualLockAnchored(cluster.clusterId) || cluster.clusterId === baseClusterId;
      cluster.isFixed = this.isSolidRigidMode || (locked && isBase);
    }

    this.updateDualLockVisualMesh();
  }

  public getDualLockPosition(): { x: number; z: number } | null {
    if (!this.isDualLocked) return null;
    const offset = this.dualLockLocalOffset || { x: 0, z: 0 };
    const radYaw = (this.yawDegrees * Math.PI) / 180;
    const cosY = Math.cos(radYaw);
    const sinY = Math.sin(radYaw);
    return {
      x: this.basePos.x + (offset.x * cosY + offset.z * sinY),
      z: this.basePos.z + (-offset.x * sinY + offset.z * cosY),
    };
  }

  private updateDualLockVisualMesh(): void {
    if (!this.dualLockMarker) {
      this.dualLockMarker = new DualLockMarker(this.id);
      this.rootGroup.add(this.dualLockMarker.group);
    }

    this.dualLockMarker.setVisible(this.isDualLocked);
    if (this.isDualLocked) {
      const pos = this.getDualLockPosition() || this.basePos;
      this.dualLockMarker.setPosition(pos.x, 0.002, pos.z);
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

  public getPhysicsSpec(): FllPhysicsSpec | undefined {
    return this.spec.physicsSpec;
  }

  public init(world: RAPIER.World, basePosition: { x: number; y: number; z: number }, yawDegrees = 0): void {
    this.world = world;
    this.basePos = { ...basePosition };
    this.yawDegrees = yawDegrees;

    if (!this.dualLockLocalOffset && this.spec.physicsSpec?.dualLockAnchors?.[0]) {
      const firstAnchor = this.spec.physicsSpec.dualLockAnchors[0];
      const rawX = firstAnchor.localStudCoordinates[0];
      const rawZ = firstAnchor.localStudCoordinates[2];
      const offX = Math.abs(rawX) > 2 ? rawX / 1000 : rawX;
      const offZ = Math.abs(rawZ) > 2 ? rawZ / 1000 : rawZ;
      this.dualLockLocalOffset = { x: offX, z: offZ };
    }

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

    const baseClusterId = this.getBaseClusterId();

    for (const cluster of this.spec.clusters) {
      const isBase = this.isClusterDualLockAnchored(cluster.clusterId) || cluster.clusterId === baseClusterId;
      const isFixedCluster = this.isSolidRigidMode || (this.isDualLocked && isBase);
      cluster.isFixed = isFixedCluster;
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
        // Group 3 (0x0008): Fixed base clusters
        // Group 4 (0x0010): Dynamic mechanism clusters
        // Both fixed and dynamic clusters collide with everything (filter 0xFFFF).
        // (Jointed pairs already have mutual contact disabled via rapierJoint.setContactsEnabled(false)).
        const membership = isFixedCluster ? 0x0008 : 0x0010;
        const filter = 0xFFFF;
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
    this.physicsJointMap.clear();
    this.jointInitialRelativeRot.clear();

    if (this.spec.physicsSpec?.joints && this.spec.physicsSpec.joints.length > 0) {
      for (const jointDef of this.spec.physicsSpec.joints) {
        const parentBody = this.bodies.get(jointDef.parentClusterId);
        const childBody = this.bodies.get(jointDef.childClusterId);
        if (!parentBody || !childBody) continue;

        const anchor = {
          x: jointDef.anchor[0],
          y: jointDef.anchor[1],
          z: jointDef.anchor[2],
        };
        const axis = {
          x: jointDef.axis[0],
          y: jointDef.axis[1],
          z: jointDef.axis[2],
        };

        let jointData: RAPIER.JointData;
        if (jointDef.type === 'prismatic') {
          jointData = RAPIER.JointData.prismatic(anchor, anchor, axis);
        } else if (jointDef.type === 'spherical') {
          jointData = RAPIER.JointData.spherical(anchor, anchor);
        } else if (jointDef.type === 'fixed') {
          jointData = RAPIER.JointData.fixed(
            anchor,
            { x: 0, y: 0, z: 0, w: 1 },
            anchor,
            { x: 0, y: 0, z: 0, w: 1 }
          );
        } else {
          // Default: revolute
          jointData = RAPIER.JointData.revolute(anchor, anchor, axis);
        }

        const rapierJoint = this.world.createImpulseJoint(jointData, parentBody, childBody, true);
        rapierJoint.setContactsEnabled(false);

        if (jointDef.type === 'revolute') {
          const revJoint = rapierJoint as RAPIER.RevoluteImpulseJoint;
          if (jointDef.limits) {
            const minRad =
              jointDef.limits.minDegrees !== undefined
                ? (jointDef.limits.minDegrees * Math.PI) / 180
                : -Math.PI;
            const maxRad =
              jointDef.limits.maxDegrees !== undefined
                ? (jointDef.limits.maxDegrees * Math.PI) / 180
                : Math.PI;
            revJoint.setLimits(minRad, maxRad);
          }

          const damping =
            jointDef.dynamics?.viscousDamping !== undefined
              ? jointDef.dynamics.viscousDamping
              : 0.6;
          const holdingTorque =
            jointDef.dynamics?.holdingTorqueNm !== undefined
              ? jointDef.dynamics.holdingTorqueNm
              : 0.065;

          revJoint.configureMotorVelocity(0.0, damping);
          revJoint.setMotorMaxForce(holdingTorque);
        } else if (jointDef.type === 'prismatic') {
          const prismJoint = rapierJoint as RAPIER.PrismaticImpulseJoint;
          if (
            jointDef.limits?.minMeters !== undefined &&
            jointDef.limits?.maxMeters !== undefined
          ) {
            prismJoint.setLimits(jointDef.limits.minMeters, jointDef.limits.maxMeters);
          }
          const damping = jointDef.dynamics?.viscousDamping ?? 0.6;
          const maxForce = jointDef.dynamics?.holdingTorqueNm ?? 5.0;
          prismJoint.configureMotorVelocity(0.0, damping);
          prismJoint.setMotorMaxForce(maxForce);
        }

        this.joints.push(rapierJoint);
        this.physicsJointMap.set(jointDef.id, { joint: rapierJoint, def: jointDef });

        // Record initial relative orientation at rest (0-degree reference)
        const pRot = parentBody.rotation();
        const cRot = childBody.rotation();
        const qP = new THREE.Quaternion(pRot.x, pRot.y, pRot.z, pRot.w);
        const qC = new THREE.Quaternion(cRot.x, cRot.y, cRot.z, cRot.w);
        const qRel0 = qP.clone().invert().multiply(qC);
        this.jointInitialRelativeRot.set(jointDef.id, qRel0);
      }
    } else {
      // Connect heuristic joints between clusters
      for (const jointSpec of this.spec.joints) {
        const parentBody = this.bodies.get(jointSpec.parentClusterId);
        const childBody = this.bodies.get(jointSpec.childClusterId);
        if (parentBody && childBody) {
          const jointData =
            jointSpec.type === 'SPHERICAL'
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
          if (jointSpec.type === 'REVOLUTE') {
            (rapierJoint as RAPIER.RevoluteImpulseJoint).configureMotorVelocity(0.0, 0.5);
            (rapierJoint as RAPIER.RevoluteImpulseJoint).setMotorMaxForce(0.01);
          }
          this.joints.push(rapierJoint);
        }
      }
    }

    this.applyInitialPose();
    this.recordInitialPoses();
  }

  private applyInitialPose(): void {
    const initPose = this.spec.physicsSpec?.states?.initialPose;
    if (!initPose || !initPose.jointPositions) return;

    for (const [jointId, posValue] of Object.entries(initPose.jointPositions)) {
      const entry = this.physicsJointMap.get(jointId);
      if (!entry) continue;

      const { def } = entry;
      const parentBody = this.bodies.get(def.parentClusterId);
      const childBody = this.bodies.get(def.childClusterId);
      if (!parentBody || !childBody) continue;

      const pPos = parentBody.translation();
      const pRot = parentBody.rotation();
      const parentP = new THREE.Vector3(pPos.x, pPos.y, pPos.z);
      const parentQ = new THREE.Quaternion(pRot.x, pRot.y, pRot.z, pRot.w);

      if (def.type === 'revolute') {
        const anchorLocal = new THREE.Vector3(def.anchor[0], def.anchor[1], def.anchor[2]);
        const axisLocal = new THREE.Vector3(def.axis[0], def.axis[1], def.axis[2]).normalize();
        const angleRad = (posValue * Math.PI) / 180;

        const rLocal = new THREE.Quaternion().setFromAxisAngle(axisLocal, angleRad);
        const childQ = parentQ.clone().multiply(rLocal);

        // Child position in world: parentP + parentQ * (anchorLocal - rLocal * anchorLocal)
        const rotatedAnchor = anchorLocal.clone().applyQuaternion(rLocal);
        const offsetLocal = anchorLocal.clone().sub(rotatedAnchor);
        const offsetWorld = offsetLocal.clone().applyQuaternion(parentQ);
        const childP = parentP.clone().add(offsetWorld);

        childBody.setTranslation({ x: childP.x, y: childP.y, z: childP.z }, true);
        childBody.setRotation({ x: childQ.x, y: childQ.y, z: childQ.z, w: childQ.w }, true);
        childBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
        childBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
      } else if (def.type === 'prismatic') {
        const axisLocal = new THREE.Vector3(def.axis[0], def.axis[1], def.axis[2]).normalize();
        const offsetLocal = axisLocal.clone().multiplyScalar(posValue);
        const offsetWorld = offsetLocal.clone().applyQuaternion(parentQ);
        const childP = parentP.clone().add(offsetWorld);

        childBody.setTranslation({ x: childP.x, y: childP.y, z: childP.z }, true);
        childBody.setRotation({ x: parentQ.x, y: parentQ.y, z: parentQ.z, w: parentQ.w }, true);
        childBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
        childBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
    }
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
    const baseClusterId = this.getBaseClusterId();
    for (const [id, body] of this.bodies.entries()) {
      const group = this.clusterMeshes.get(id);
      if (!group) continue;
      const t = body.translation();
      const r = body.rotation();
      group.position.set(t.x, t.y, t.z);
      group.quaternion.set(r.x, r.y, r.z, r.w);

      if (id === baseClusterId) {
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

    this.applyInitialPose();
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
    if (this.isDualLocked) {
      const fixedPoint = this.getDualLockPosition();
      if (fixedPoint) {
        const offset = this.dualLockLocalOffset || { x: 0, z: 0 };
        const radNew = (yawDegrees * Math.PI) / 180;
        const cosN = Math.cos(radNew);
        const sinN = Math.sin(radNew);
        this.basePos.x = fixedPoint.x - (offset.x * cosN + offset.z * sinN);
        this.basePos.z = fixedPoint.z - (-offset.x * sinN + offset.z * cosN);
      }
    }
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

  /**
   * Returns current joint angle in degrees for revolute joints, relative to initial rest orientation
   */
  public getJointAngleDegrees(jointId: string): number | null {
    const entry = this.physicsJointMap.get(jointId);
    if (!entry) return null;

    const { def } = entry;
    const parentBody = this.bodies.get(def.parentClusterId);
    const childBody = this.bodies.get(def.childClusterId);
    if (!parentBody || !childBody) return null;

    const pRot = parentBody.rotation();
    const cRot = childBody.rotation();
    const qP = new THREE.Quaternion(pRot.x, pRot.y, pRot.z, pRot.w);
    const qC = new THREE.Quaternion(cRot.x, cRot.y, cRot.z, cRot.w);

    const qRel = qP.clone().invert().multiply(qC);
    const qRel0 = this.jointInitialRelativeRot.get(jointId) || new THREE.Quaternion();
    const qDisp = qRel0.clone().invert().multiply(qRel);

    const axisVec = new THREE.Vector3(def.axis[0], def.axis[1], def.axis[2]).normalize();

    let w = qDisp.w;
    let dot = new THREE.Vector3(qDisp.x, qDisp.y, qDisp.z).dot(axisVec);
    if (w < 0) {
      w = -w;
      dot = -dot;
    }
    return (2 * Math.atan2(dot, w) * 180) / Math.PI;
  }

  /**
   * Evaluates scored pose definitions defined in physicsSpec.states.scoredPoses
   */
  public evaluateScoreState(): { isScored: boolean; points: number; label: string } | null {
    const scoredPoses = this.spec.physicsSpec?.states?.scoredPoses;
    if (!scoredPoses || scoredPoses.length === 0) {
      return null;
    }

    const sortedPoses = [...scoredPoses].sort((a, b) => b.points - a.points);

    for (const pose of sortedPoses) {
      const ev = pose.evaluator;
      let isMet = false;

      if (ev.type === 'joint_threshold') {
        if (ev.jointId) {
          const currentAngle = this.getJointAngleDegrees(ev.jointId);
          if (currentAngle !== null) {
            const minOk = ev.targetAngleMin === undefined || currentAngle >= ev.targetAngleMin;
            const maxOk = ev.targetAngleMax === undefined || currentAngle <= ev.targetAngleMax;
            isMet = minOk && maxOk;
          }
        }
      } else if (ev.type === 'cluster_zone') {
        if (ev.targetClusterId) {
          const body = this.bodies.get(ev.targetClusterId);
          const initPose = this.initialBodyPoses.get(ev.targetClusterId);
          if (body && initPose) {
            const cur = body.translation();
            const dx = cur.x - initPose.translation.x;
            const dy = cur.y - initPose.translation.y;
            const dz = cur.z - initPose.translation.z;
            isMet = Math.sqrt(dx * dx + dy * dy + dz * dz) > 0.02;
          }
        }
      } else if (ev.type === 'payload_transfer') {
        if (ev.targetClusterId) {
          const body = this.bodies.get(ev.targetClusterId);
          const baseClusterId = this.getBaseClusterId();
          const baseBody = this.bodies.get(baseClusterId);
          if (body && baseBody) {
            const cur = body.translation();
            const bPos = baseBody.translation();
            const dist = Math.hypot(cur.x - bPos.x, cur.z - bPos.z);
            isMet = dist > 0.05;
          }
        }
      }

      if (isMet) {
        return {
          isScored: true,
          points: pose.points,
          label: pose.label,
        };
      }
    }

    return {
      isScored: false,
      points: 0,
      label: 'Not Scored',
    };
  }

  public isSolved(): boolean {
    const scoreState = this.evaluateScoreState();
    if (scoreState !== null) {
      return scoreState.isScored;
    }
    return this.hasMovedFromInitial;
  }

  public getScore(): number {
    const scoreState = this.evaluateScoreState();
    if (scoreState !== null) {
      return scoreState.isScored ? scoreState.points : 0;
    }
    return this.hasMovedFromInitial ? 100 : 0;
  }

  public getInteractiveMeshes(): THREE.Object3D[] {
    const baseClusterId = this.getBaseClusterId();
    const meshes: THREE.Object3D[] = [];
    for (const [cid, group] of this.clusterMeshes.entries()) {
      const isFixed =
        this.isSolidRigidMode ||
        (this.isDualLocked && (this.isClusterDualLockAnchored(cid) || cid === baseClusterId));
      if (!isFixed) {
        group.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            meshes.push(obj);
          }
        });
      }
    }
    return meshes;
  }

  public applyUserDrag(groundTarget: THREE.Vector3): void {
    // Apply dynamic impulse only to non-fixed bodies
    for (const body of this.bodies.values()) {
      if (body.bodyType() === RAPIER.RigidBodyType.Fixed) continue;

      const curTrans = body.translation();
      const vx = Math.min(2.5, Math.max(-2.5, (groundTarget.x - curTrans.x) * 6.0));
      const vz = Math.min(2.5, Math.max(-2.5, (groundTarget.z - curTrans.z) * 6.0));
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
      try {
        this.world.removeImpulseJoint(joint, true);
      } catch {
        // ignore
      }
    }
    this.joints = [];
    this.physicsJointMap.clear();
    this.jointInitialRelativeRot.clear();

    for (const body of this.bodies.values()) {
      this.world.removeRigidBody(body);
    }
    this.bodies.clear();
    this.rootGroup.clear();
  }
}
