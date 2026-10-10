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
