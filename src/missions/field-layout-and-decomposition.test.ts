import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { decomposeMissionAssembly } from './mission-decomposer';
import { FieldLayoutManager } from './field-layout-manager';
import { CustomImportedMissionElement } from './custom-imported-element';
import { MissionManager } from './mission-manager';
import { RobotAssemblySpec } from '../cad/types';

class MockLocalStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

describe('Mission Model Decomposition & Dual Lock Layout Management', () => {
  let world: RAPIER.World;

  beforeAll(async () => {
    await RAPIER.init();
    if (typeof globalThis.localStorage === 'undefined') {
      (globalThis as any).localStorage = new MockLocalStorage();
    }
  });

  beforeEach(() => {
    world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    globalThis.localStorage.clear();
  });

  describe('decomposeMissionAssembly', () => {
    it('decomposes unconnected clusters into distinct mission elements with centered local coordinates', () => {
      const mockAssembly: RobotAssemblySpec = {
        name: 'M01 Innovation Station',
        clusters: [
          {
            clusterId: 'chassis_root',
            name: 'Stationary Platform',
            isRootChassis: true,
            isFixed: true,
            partIds: ['p1', 'p2'],
            totalMassKg: 0.3,
            colliders: [
              {
                shape: 'box',
                halfExtents: [0.05, 0.02, 0.05],
                offset: [0, 0, 0],
                rotation: [0, 0, 0, 1],
                friction: 0.8,
                restitution: 0.0,
              },
            ],
            parts: [
              {
                id: 'p1',
                partNumber: '3001',
                position: [0, 0, 0],
                rotation: [0, 0, 0, 1],
                role: 'GENERIC_RIGID',
              },
            ],
          },
          {
            clusterId: 'cart_cluster',
            name: 'Rolling Cart',
            isRootChassis: false,
            isFixed: false,
            partIds: ['p3'],
            totalMassKg: 0.08,
            colliders: [
              {
                shape: 'box',
                halfExtents: [0.03, 0.02, 0.03],
                offset: [0.2, 0, 0.1], // 200mm X, 100mm Z in model
                rotation: [0, 0, 0, 1],
                friction: 0.2,
                restitution: 0.0,
              },
            ],
            parts: [
              {
                id: 'p3',
                partNumber: '3003',
                position: [200, 0, 100], // 200mm X, 100mm Z
                rotation: [0, 0, 0, 1],
                role: 'GENERIC_RIGID',
              },
            ],
          },
        ],
        joints: [], // No joints between platform and cart
        sensors: [],
      };

      const decomposed = decomposeMissionAssembly(
        mockAssembly,
        'M01',
        { x: 0.5, y: 0.002, z: -0.3 },
        0
      );

      // Should separate into 2 elements: the platform and the cart
      expect(decomposed.length).toBe(2);

      const baseElem = decomposed[0];
      const cartElem = decomposed[1];

      expect(baseElem.id).toBe('M01');
      expect(baseElem.isBaseFixed).toBe(true);

      expect(cartElem.id).toBe('M01_obj_1');
      expect(cartElem.isBaseFixed).toBe(false);
      // Cart world pos shifted by its 200mm X and 100mm Z offset
      expect(cartElem.initialPos.x).toBeCloseTo(0.7, 2);
      expect(cartElem.initialPos.z).toBeCloseTo(-0.2, 2);
    });

    it('keeps mechanically jointed clusters grouped together in the same element', () => {
      const mockAssembly: RobotAssemblySpec = {
        name: 'M02 Gear Riser',
        clusters: [
          {
            clusterId: 'chassis_root',
            name: 'Tower Frame',
            isRootChassis: true,
            isFixed: true,
            partIds: ['p1'],
            totalMassKg: 0.4,
            colliders: [],
          },
          {
            clusterId: 'lever_cluster',
            name: 'Revolute Lever',
            isRootChassis: false,
            isFixed: false,
            partIds: ['p2'],
            totalMassKg: 0.05,
            colliders: [],
          },
        ],
        joints: [
          {
            jointId: 'lever_hinge',
            name: 'Lever Hinge',
            type: 'REVOLUTE',
            parentClusterId: 'chassis_root',
            childClusterId: 'lever_cluster',
            anchorParent: [0, 0.05, 0],
            anchorChild: [0, 0, 0],
            axis: [0, 1, 0],
            maxTorqueNm: 2.0,
            maxVelocityDegPerSec: 360,
          },
        ],
        sensors: [],
      };

      const decomposed = decomposeMissionAssembly(
        mockAssembly,
        'M02',
        { x: 0, y: 0.002, z: 0 },
        0
      );

      // Even though there are 2 clusters, they are connected by a joint, so they stay together
      expect(decomposed.length).toBe(1);
      expect(decomposed[0].id).toBe('M02');
      expect(decomposed[0].spec.clusters.length).toBe(2);
      expect(decomposed[0].spec.joints.length).toBe(1);
    });
  });

  describe('Dual Lock Dynamic/Fixed Toggling on CustomImportedMissionElement', () => {
    it('dynamically switches Rapier body between Fixed and Dynamic and creates visual Dual Lock pad', () => {
      const mockSpec: RobotAssemblySpec = {
        name: 'DualLock Test Model',
        clusters: [
          {
            clusterId: 'base',
            name: 'Main Base',
            isRootChassis: true,
            isFixed: true,
            partIds: ['p1'],
            totalMassKg: 0.25,
            colliders: [
              {
                shape: 'box',
                halfExtents: [0.04, 0.02, 0.04],
                offset: [0, 0, 0],
                rotation: [0, 0, 0, 1],
                friction: 0.8,
                restitution: 0.0,
              },
            ],
          },
        ],
        joints: [],
        sensors: [],
      };

      const elem = new CustomImportedMissionElement(mockSpec, {
        id: 'dl_test_1',
        name: 'DL Test',
        isBaseFixed: true,
      });
      elem.init(world, { x: 0.2, y: 0.002, z: 0.3 });

      // @ts-ignore
      const body = elem['bodies'].get('base') as RAPIER.RigidBody;
      expect(body.bodyType()).toBe(RAPIER.RigidBodyType.Fixed);
      expect(elem.isDualLocked).toBe(true);

      // Unfasten Dual Lock: becomes dynamic to allow sliding or pushing
      elem.setDualLocked(false);
      expect(elem.isDualLocked).toBe(false);
      expect(body.bodyType()).toBe(RAPIER.RigidBodyType.Dynamic);

      // Refasten Dual Lock at anchor point: becomes fixed again
      elem.setDualLocked(true, { x: 0.22, z: 0.31 });
      expect(elem.isDualLocked).toBe(true);
      expect(body.bodyType()).toBe(RAPIER.RigidBodyType.Fixed);

      const dualLockPos = elem.getDualLockPosition();
      expect(dualLockPos).not.toBeNull();
      expect(dualLockPos!.x).toBeCloseTo(0.22, 2);
      expect(dualLockPos!.z).toBeCloseTo(0.31, 2);
    });

    it('keeps mechanism clusters dynamic while only anchoring the base cluster to the mat', () => {
      const multiClusterSpec: RobotAssemblySpec = {
        name: 'Mechanism with Base',
        clusters: [
          {
            clusterId: 'mat_base_frame',
            name: 'Base Frame',
            isRootChassis: true,
            isFixed: true,
            partIds: ['p_base'],
            totalMassKg: 0.3,
            colliders: [
              {
                shape: 'box',
                halfExtents: [0.05, 0.01, 0.05],
                offset: [0, 0, 0],
                rotation: [0, 0, 0, 1],
                friction: 0.8,
                restitution: 0.0,
              },
            ],
          },
          {
            clusterId: 'rotating_dial',
            name: 'Revolute Dial Mechanism',
            isRootChassis: false,
            isFixed: false,
            partIds: ['p_dial'],
            totalMassKg: 0.05,
            colliders: [
              {
                shape: 'cylinder',
                radius: 0.03,
                halfHeight: 0.01,
                offset: [0, 0.02, 0],
                rotation: [0, 0, 0, 1],
                friction: 0.4,
                restitution: 0.0,
              },
            ],
          },
        ],
        joints: [
          {
            jointId: 'dial_joint',
            name: 'Dial Pivot',
            type: 'REVOLUTE',
            parentClusterId: 'mat_base_frame',
            childClusterId: 'rotating_dial',
            anchorParent: [0, 0.02, 0],
            anchorChild: [0, 0, 0],
            axis: [0, 1, 0],
            maxTorqueNm: 0.2,
            maxVelocityDegPerSec: 360,
          },
        ],
        sensors: [],
      };

      const elem = new CustomImportedMissionElement(multiClusterSpec, {
        id: 'multi_clust_1',
        name: 'Multi Clust Test',
        isBaseFixed: true,
      });
      elem.init(world, { x: 0.1, y: 0.002, z: 0.1 });

      // @ts-ignore
      const baseBody = elem['bodies'].get('mat_base_frame') as RAPIER.RigidBody;
      // @ts-ignore
      const dialBody = elem['bodies'].get('rotating_dial') as RAPIER.RigidBody;

      // Base must be Fixed, Dial mechanism MUST be Dynamic!
      expect(baseBody.bodyType()).toBe(RAPIER.RigidBodyType.Fixed);
      expect(dialBody.bodyType()).toBe(RAPIER.RigidBodyType.Dynamic);

      // Unfastening Dual Lock releases base to Dynamic
      elem.setDualLocked(false);
      expect(baseBody.bodyType()).toBe(RAPIER.RigidBodyType.Dynamic);
      expect(dialBody.bodyType()).toBe(RAPIER.RigidBodyType.Dynamic);

      // Fastening Dual Lock restores Fixed to base only
      elem.setDualLocked(true);
      expect(baseBody.bodyType()).toBe(RAPIER.RigidBodyType.Fixed);
      expect(dialBody.bodyType()).toBe(RAPIER.RigidBodyType.Dynamic);
    });

    it('can anchor a decomposed secondary object whose clusters were initialized as non-fixed', () => {
      // Simulates a secondary object decomposed from a larger model
      const decomposedSpec: RobotAssemblySpec = {
        name: 'Secondary Piece',
        clusters: [
          {
            clusterId: 'loose_payload_box',
            name: 'Payload Piece',
            isRootChassis: false,
            isFixed: false, // Originally not fixed
            partIds: ['p_box'],
            totalMassKg: 0.1,
            colliders: [
              {
                shape: 'box',
                halfExtents: [0.02, 0.02, 0.02],
                offset: [0, 0, 0],
                rotation: [0, 0, 0, 1],
                friction: 0.5,
                restitution: 0.0,
              },
            ],
          },
        ],
        joints: [],
        sensors: [],
      };

      const elem = new CustomImportedMissionElement(decomposedSpec, {
        id: 'decomposed_obj_1',
        name: 'Decomposed Piece',
        isBaseFixed: false, // Initialized dynamic
      });
      elem.init(world, { x: 0.3, y: 0.002, z: 0.3 });

      // @ts-ignore
      const body = elem['bodies'].get('loose_payload_box') as RAPIER.RigidBody;
      expect(body.bodyType()).toBe(RAPIER.RigidBodyType.Dynamic);
      expect(elem.isDualLocked).toBe(false);

      // User anchors this piece to the field using Dual Lock tool
      elem.setDualLocked(true, { x: 0.3, z: 0.3 });
      expect(elem.isDualLocked).toBe(true);
      expect(body.bodyType()).toBe(RAPIER.RigidBodyType.Fixed);
    });

    it('supports selecting a specific cluster to anchor via targetClusterId', () => {
      const dualLegSpec: RobotAssemblySpec = {
        name: 'Two Leg Frame',
        clusters: [
          {
            clusterId: 'leg_left',
            name: 'Left Leg',
            isRootChassis: false,
            partIds: ['p_l'],
            totalMassKg: 0.1,
            colliders: [{ shape: 'box', halfExtents: [0.02, 0.02, 0.02], offset: [-0.05, 0, 0], rotation: [0, 0, 0, 1], friction: 0.5, restitution: 0.0 }],
          },
          {
            clusterId: 'leg_right',
            name: 'Right Leg',
            isRootChassis: false,
            partIds: ['p_r'],
            totalMassKg: 0.1,
            colliders: [{ shape: 'box', halfExtents: [0.02, 0.02, 0.02], offset: [0.05, 0, 0], rotation: [0, 0, 0, 1], friction: 0.5, restitution: 0.0 }],
          },
        ],
        joints: [],
        sensors: [],
      };

      const elem = new CustomImportedMissionElement(dualLegSpec, {
        id: 'two_leg_1',
        name: 'Two Leg',
        isBaseFixed: false,
      });
      elem.init(world, { x: 0.0, y: 0.002, z: 0.0 });

      // @ts-ignore
      const leftBody = elem['bodies'].get('leg_left') as RAPIER.RigidBody;
      // @ts-ignore
      const rightBody = elem['bodies'].get('leg_right') as RAPIER.RigidBody;

      // Anchor leg_right specifically
      elem.setDualLocked(true, { x: 0.05, z: 0.0 }, 'leg_right');
      expect(elem.getAnchoredClusterId()).toBe('leg_right');
      expect(rightBody.bodyType()).toBe(RAPIER.RigidBodyType.Fixed);
      expect(leftBody.bodyType()).toBe(RAPIER.RigidBodyType.Dynamic);
    });

    it('ensures mechanism clusters stay dynamic when base is dual locked and all become dynamic when unfastened', () => {
      const assemblyWithMechanism: RobotAssemblySpec = {
        name: 'Lever Model',
        clusters: [
          {
            clusterId: 'chassis_root',
            name: 'Stationary Base Frame',
            isRootChassis: true,
            isFixed: true,
            partIds: ['base_p1'],
            totalMassKg: 0.25,
            colliders: [{ shape: 'box', halfExtents: [0.05, 0.02, 0.05], offset: [0, 0, 0], rotation: [0, 0, 0, 1], friction: 0.8, restitution: 0.0 }],
          },
          {
            clusterId: 'lever_arm',
            name: 'Articulated Lever',
            isRootChassis: false,
            isFixed: false,
            partIds: ['lever_p1'],
            totalMassKg: 0.05,
            colliders: [{ shape: 'box', halfExtents: [0.01, 0.01, 0.04], offset: [0, 0.03, 0.02], rotation: [0, 0, 0, 1], friction: 0.5, restitution: 0.0 }],
          },
          {
            clusterId: 'payload_cart',
            name: 'Sliding Cart',
            isRootChassis: false,
            isFixed: false,
            partIds: ['cart_p1'],
            totalMassKg: 0.08,
            colliders: [{ shape: 'box', halfExtents: [0.02, 0.02, 0.02], offset: [0.03, 0.01, 0], rotation: [0, 0, 0, 1], friction: 0.1, restitution: 0.0 }],
          },
        ],
        joints: [
          {
            jointId: 'hinge_1',
            name: 'Hinge',
            type: 'REVOLUTE',
            parentClusterId: 'chassis_root',
            childClusterId: 'lever_arm',
            anchorParent: [0, 0.03, 0],
            anchorChild: [0, 0, 0],
            axis: [1, 0, 0],
            maxTorqueNm: 0.25,
            maxVelocityDegPerSec: 1000,
          },
        ],
        sensors: [],
      };

      const elem = new CustomImportedMissionElement(assemblyWithMechanism, {
        id: 'lever_model_1',
        name: 'Lever Model',
        isBaseFixed: true,
      });
      elem.init(world, { x: 0.2, y: 0.002, z: 0.3 });

      // @ts-ignore
      const baseBody = elem['bodies'].get('chassis_root') as RAPIER.RigidBody;
      // @ts-ignore
      const leverBody = elem['bodies'].get('lever_arm') as RAPIER.RigidBody;
      // @ts-ignore
      const cartBody = elem['bodies'].get('payload_cart') as RAPIER.RigidBody;

      // 1. Initial fastened state: only base is Fixed; lever and cart are Dynamic
      expect(baseBody.bodyType()).toBe(RAPIER.RigidBodyType.Fixed);
      expect(leverBody.bodyType()).toBe(RAPIER.RigidBodyType.Dynamic);
      expect(cartBody.bodyType()).toBe(RAPIER.RigidBodyType.Dynamic);

      // 2. Erase / remove fastener: ALL clusters become Dynamic so the entire assembly can move/tip
      elem.setDualLocked(false);
      expect(elem.getIsBaseFixed()).toBe(false);
      expect(baseBody.bodyType()).toBe(RAPIER.RigidBodyType.Dynamic);
      expect(leverBody.bodyType()).toBe(RAPIER.RigidBodyType.Dynamic);
      expect(cartBody.bodyType()).toBe(RAPIER.RigidBodyType.Dynamic);

      // 3. Fasten again targeting chassis_root: only base becomes Fixed; lever and cart remain Dynamic
      elem.setDualLocked(true, { x: 0.2, z: 0.3 }, 'chassis_root');
      expect(elem.getIsBaseFixed()).toBe(true);
      expect(baseBody.bodyType()).toBe(RAPIER.RigidBodyType.Fixed);
      expect(leverBody.bodyType()).toBe(RAPIER.RigidBodyType.Dynamic);
      expect(cartBody.bodyType()).toBe(RAPIER.RigidBodyType.Dynamic);

      // 4. Test dragging: only dynamic bodies receive velocities, fixed body stays at 0
      elem.applyUserDrag(new THREE.Vector3(0.5, 0, 0.5));
      expect(baseBody.linvel().x).toBe(0);
      expect(baseBody.linvel().z).toBe(0);
      expect(leverBody.isSleeping()).toBe(false);
      expect(cartBody.isSleeping()).toBe(false);
    });
  });

  describe('FieldLayoutManager', () => {
    it('saves current field element layout to localStorage and restores it accurately', async () => {
      const scene = new THREE.Scene();
      const missionManager = new MissionManager();
      missionManager.init(world, scene);

      // Reposition an element
      const riser = missionManager.getElement('axle-riser') as any;
      expect(riser).toBeDefined();
      riser.basePos = { x: 0.45, y: 0.002, z: -0.6 };

      // Save layout
      const savedLayout = FieldLayoutManager.saveCurrentLayout(missionManager.getAllElements());
      expect(savedLayout.elements.length).toBeGreaterThanOrEqual(1);

      // Move element to a different position
      riser.basePos = { x: 0.0, y: 0.002, z: 0.0 };

      // Restore layout from localStorage
      const loaded = FieldLayoutManager.loadSavedLayout();
      expect(loaded).not.toBeNull();

      const result = await FieldLayoutManager.applyLayout(loaded!, missionManager);
      expect(result.restoredCount).toBeGreaterThanOrEqual(1);
      expect(riser.basePos.x).toBeCloseTo(0.45, 2);
      expect(riser.basePos.z).toBeCloseTo(-0.6, 2);
    });

    it('exports and parses layout JSON safely', () => {
      const scene = new THREE.Scene();
      const missionManager = new MissionManager();
      missionManager.init(world, scene);

      const layout = FieldLayoutManager.saveCurrentLayout(missionManager.getAllElements());
      const jsonStr = JSON.stringify(layout, null, 2);

      const parsed = JSON.parse(jsonStr);
      expect(parsed.version).toBe(1);
      expect(Array.isArray(parsed.elements)).toBe(true);
      expect(parsed.elements.length).toBeGreaterThan(0);
    });
  });
});
