import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { MissionElement } from './types';
import { RobotAssemblySpec } from '../cad/types';
import { LEGO_COLORS, getLegoMaterial } from '../view/lego-visuals';

export interface CustomElementOptions {
  id: string;
  name: string;
  description?: string;
  sourceFile?: string;
  isBaseFixed?: boolean;
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
  public isPlacedOnField: boolean = true;
  public readonly rootGroup: THREE.Group;

  private world!: RAPIER.World;
  private spec: RobotAssemblySpec;
  private basePos: { x: number; y: number; z: number } = { x: 0, y: 0.002, z: 0 };
  private yawDegrees: number = 0;
  private isBaseFixed: boolean;

  // Physics Bodies
  private bodies: Map<string, RAPIER.RigidBody> = new Map();
  private initialBodyPoses: Map<string, { translation: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number; w: number } }> = new Map();
  private joints: RAPIER.ImpulseJoint[] = [];

  // Visual Groups
  private clusterMeshes: Map<string, THREE.Group> = new Map();
  private interactiveMeshes: THREE.Object3D[] = [];

  // Scored state
  private hasMovedFromInitial = false;

  constructor(spec: RobotAssemblySpec, options: CustomElementOptions) {
    this.spec = spec;
    this.id = options.id;
    this.name = options.name;
    this.description = options.description || `Imported mission model: ${options.name}`;
    this.sourceFile = options.sourceFile;
    this.isBaseFixed = options.isBaseFixed ?? true;
    this.rootGroup = new THREE.Group();
  }

  public init(world: RAPIER.World, basePosition: { x: number; y: number; z: number }, yawDegrees = 0): void {
    this.world = world;
    this.basePos = { ...basePosition };
    this.yawDegrees = yawDegrees;

    this.createPhysicsAndVisuals();
    this.reset();
  }

  private createPhysicsAndVisuals(): void {
    const yawRad = (this.yawDegrees * Math.PI) / 180;
    const halfYaw = yawRad / 2;
    const qy = Math.sin(halfYaw);
    const qw = Math.cos(halfYaw);

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
      const isBase = cluster.isRootChassis;
      const clusterColor = clusterPalette[colorIdx % clusterPalette.length];
      colorIdx++;

      // Create Rapier RigidBody
      let bodyDesc: RAPIER.RigidBodyDesc;
      if (isBase && this.isBaseFixed) {
        bodyDesc = RAPIER.RigidBodyDesc.fixed()
          .setTranslation(this.basePos.x, this.basePos.y, this.basePos.z)
          .setRotation({ x: 0, y: qy, z: 0, w: qw });
      } else {
        bodyDesc = RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(this.basePos.x, this.basePos.y + 0.02, this.basePos.z)
          .setRotation({ x: 0, y: qy, z: 0, w: qw })
          .setLinearDamping(3.0)
          .setAngularDamping(4.0)
          .setAdditionalMass(Math.max(0.05, cluster.totalMassKg));
      }

      const body = this.world.createRigidBody(bodyDesc);
      this.bodies.set(cluster.clusterId, body);

      // Create Visual Group for this cluster
      const clusterGroup = new THREE.Group();
      this.rootGroup.add(clusterGroup);
      this.clusterMeshes.set(cluster.clusterId, clusterGroup);

      // Create colliders and visual representations
      for (const col of cluster.colliders) {
        let colDesc: RAPIER.ColliderDesc;
        let meshGeom: THREE.BufferGeometry;

        if (col.shape === 'sphere') {
          const r = col.radius || 0.015;
          colDesc = RAPIER.ColliderDesc.ball(r);
          meshGeom = new THREE.SphereGeometry(r, 16, 16);
        } else if (col.shape === 'cylinder') {
          const r = col.radius || 0.015;
          const hh = col.halfHeight || 0.02;
          colDesc = RAPIER.ColliderDesc.cylinder(hh, r);
          meshGeom = new THREE.CylinderGeometry(r, r, hh * 2, 16);
        } else {
          // Default: Box collider
          const hx = col.halfExtents ? col.halfExtents[0] : 0.03;
          const hy = col.halfExtents ? col.halfExtents[1] : 0.015;
          const hz = col.halfExtents ? col.halfExtents[2] : 0.03;
          colDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz);
          meshGeom = new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2);
        }

        colDesc
          .setTranslation(col.offset[0], col.offset[1], col.offset[2])
          .setFriction(col.friction || 0.6)
          .setRestitution(col.restitution || 0.0);
        this.world.createCollider(colDesc, body);

        const meshMat = getLegoMaterial(clusterColor, 0.35, 0.05);
        const colMesh = new THREE.Mesh(meshGeom, meshMat);
        colMesh.position.set(col.offset[0], col.offset[1], col.offset[2]);
        colMesh.castShadow = true;
        colMesh.receiveShadow = true;
        clusterGroup.add(colMesh);

        if (!isBase || !this.isBaseFixed) {
          this.interactiveMeshes.push(colMesh);
        }
      }
    }

    // Connect joints between clusters
    for (const jointSpec of this.spec.joints) {
      const parentBody = this.bodies.get(jointSpec.parentClusterId);
      const childBody = this.bodies.get(jointSpec.childClusterId);
      if (parentBody && childBody) {
        const rapierJoint = this.world.createImpulseJoint(
          RAPIER.JointData.revolute(
            { x: jointSpec.anchorParent[0], y: jointSpec.anchorParent[1], z: jointSpec.anchorParent[2] },
            { x: jointSpec.anchorChild[0], y: jointSpec.anchorChild[1], z: jointSpec.anchorChild[2] },
            { x: jointSpec.axis[0], y: jointSpec.axis[1], z: jointSpec.axis[2] }
          ),
          parentBody,
          childBody,
          true
        );
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
    }
  }

  public reset(): void {
    const yawRad = (this.yawDegrees * Math.PI) / 180;
    const halfYaw = yawRad / 2;
    const qy = Math.sin(halfYaw);
    const qw = Math.cos(halfYaw);
    const zeroVel = { x: 0, y: 0, z: 0 };

    for (const [id, body] of this.bodies.entries()) {
      const cluster = this.spec.clusters.find((c) => c.clusterId === id);
      const isBase = cluster?.isRootChassis ?? false;

      let posY = isBase && this.isBaseFixed ? this.basePos.y : this.basePos.y + 0.02;
      body.setTranslation({ x: this.basePos.x, y: posY, z: this.basePos.z }, true);
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
    return this.interactiveMeshes.length > 0 ? this.interactiveMeshes : [this.rootGroup];
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
