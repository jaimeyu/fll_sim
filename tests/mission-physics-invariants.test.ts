import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { RobotAssemblySpec } from '../src/cad/types';
import { FllPhysicsSpec } from '../src/cad/physics-spec';
import { CustomImportedMissionElement } from '../src/missions/custom-imported-element';
import { decomposeMissionAssembly } from '../src/missions/mission-decomposer';

describe('Mission Physics Invariants & Regression Suite', () => {
  let world: RAPIER.World;

  beforeAll(async () => {
    await RAPIER.init();
  });

  beforeEach(() => {
    world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    // Mat ground plane
    const groundDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0);
    const groundBody = world.createRigidBody(groundDesc);
    const groundCollider = RAPIER.ColliderDesc.cuboid(2.0, 0.001, 2.0).setFriction(0.8);
    world.createCollider(groundCollider, groundBody);
  });

  // ---------------------------------------------------------------------------
  // Invariant 1: Static Gravity Stability & Anti-Sag (Starting Pose Retention)
  // ---------------------------------------------------------------------------
  describe('Invariant 1: Static Gravity Stability & Anti-Sag', () => {
    it('maintains base position (drift < 0.5mm) and holds starting lever pose (droop < 0.5°) over 180 physics ticks', () => {
      const physicsSpec: FllPhysicsSpec = {
        schemaVersion: '1.1.0',
        modelId: 'inv_m01',
        name: 'Invariant Test Mechanism',
        entities: [
          {
            id: 'base_station',
            name: 'Base Station',
            type: 'anchored_station',
            clusterIds: ['base_cluster'],
            defaultFixed: true,
          },
          {
            id: 'swing_arm',
            name: 'Swing Arm',
            type: 'dynamic_payload',
            clusterIds: ['arm_cluster'],
            defaultFixed: false,
          },
        ],
        dualLockAnchors: [
          {
            id: 'dl_pad_1',
            clusterId: 'base_cluster',
            localStudCoordinates: [0, 0, 0],
            dimensionsMm: [25.4, 25.4],
          },
        ],
        joints: [
          {
            id: 'hinge_joint',
            name: 'Lever Hinge',
            type: 'revolute',
            parentClusterId: 'base_cluster',
            childClusterId: 'arm_cluster',
            anchor: [0, 0.05, 0],
            axis: [0, 0, 1], // Z-axis hinge
            limits: {
              minDegrees: 0,
              maxDegrees: 90,
              restitution: 0.05,
            },
            dynamics: {
              preset: 'tight_friction_pin',
              holdingTorqueNm: 0.065, // Authentic LEGO pin clutch torque
              viscousDamping: 0.60,
            },
          },
        ],
        states: {
          initialPose: {
            description: 'Horizontal resting pose',
            jointPositions: { hinge_joint: 0 },
          },
          scoredPoses: [
            {
              id: 'scored_lifted',
              label: 'Arm Raised Above 60° (20 pts)',
              points: 20,
              evaluator: {
                type: 'joint_threshold',
                jointId: 'hinge_joint',
                targetAngleMin: 60,
                targetAngleMax: 90,
              },
            },
          ],
        },
      };

      const spec: RobotAssemblySpec = {
        name: 'Invariant Test Mechanism',
        clusters: [
          {
            clusterId: 'base_cluster',
            name: 'Base Cluster',
            isRootChassis: true,
            isFixed: true,
            partIds: ['p_base'],
            totalMassKg: 0.25,
            colliders: [
              {
                shape: 'box',
                halfExtents: [0.05, 0.015, 0.05],
                offset: [0, 0.015, 0],
                rotation: [0, 0, 0, 1],
                friction: 0.8,
                restitution: 0.0,
              },
            ],
          },
          {
            clusterId: 'arm_cluster',
            name: 'Arm Cluster',
            isRootChassis: false,
            isFixed: false,
            partIds: ['p_arm'],
            totalMassKg: 0.04, // 40 grams cantilevered lever
            colliders: [
              {
                shape: 'box',
                halfExtents: [0.05, 0.008, 0.008], // Horizontal beam extending along X
                offset: [0.05, 0.05, 0],
                rotation: [0, 0, 0, 1],
                friction: 0.6,
                restitution: 0.05,
              },
            ],
          },
        ],
        joints: [],
        sensors: [],
        physicsSpec,
      };

      const elem = new CustomImportedMissionElement(spec, {
        id: 'inv_elem_1',
        name: 'Invariant Mechanism',
        isBaseFixed: true,
      });

      elem.init(world, { x: 0.5, y: 0.002, z: 0.5 }, 0);

      const baseBody = (elem as any).bodies.get('base_cluster') as RAPIER.RigidBody;
      const initBasePos = baseBody.translation();

      const initialAngle = elem.getJointAngleDegrees('hinge_joint');
      expect(initialAngle).not.toBeNull();

      // Step physics for 180 ticks (3.0 seconds at 60Hz) under full gravity (-9.81 m/s²)
      for (let i = 0; i < 180; i++) {
        world.step();
        elem.update(1 / 60);
      }

      const finalBasePos = baseBody.translation();
      const postGravityAngle = elem.getJointAngleDegrees('hinge_joint')!;

      // Invariant 1A: Base must not drift more than 0.5mm
      const baseDisplacementM = Math.sqrt(
        Math.pow(finalBasePos.x - initBasePos.x, 2) +
        Math.pow(finalBasePos.y - initBasePos.y, 2) +
        Math.pow(finalBasePos.z - initBasePos.z, 2)
      );
      expect(baseDisplacementM).toBeLessThan(0.0005); // < 0.5 mm

      // Invariant 1B: Lever must NOT droop or sag under its own weight (delta < 0.5°)
      const deltaAngle = Math.abs(postGravityAngle - initialAngle!);
      expect(deltaAngle).toBeLessThan(0.5);

      // Invariant 1C: Model should not be solved at rest
      const scoreResult = elem.evaluateScoreState();
      expect(scoreResult?.isScored ?? false).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Invariant 2: Breakout Torque & Mechanical Stop Limits
  // ---------------------------------------------------------------------------
  describe('Invariant 2: Breakout Torque & Mechanical Stop Limits', () => {
    it('resists torques below holding torque, but articulates smoothly to limit stop when pushed with sufficient torque', () => {
      const physicsSpec: FllPhysicsSpec = {
        schemaVersion: '1.1.0',
        modelId: 'inv_m02',
        name: 'Breakout Test Mechanism',
        entities: [
          {
            id: 'base',
            name: 'Base',
            type: 'anchored_station',
            clusterIds: ['base_c'],
            defaultFixed: true,
          },
          {
            id: 'dial',
            name: 'Rotary Dial',
            type: 'dynamic_payload',
            clusterIds: ['dial_c'],
            defaultFixed: false,
          },
        ],
        joints: [
          {
            id: 'dial_joint',
            name: 'Dial Revolute',
            type: 'revolute',
            parentClusterId: 'base_c',
            childClusterId: 'dial_c',
            anchor: [0, 0.05, 0],
            axis: [0, 0, 1], // Z-axis rotation
            limits: {
              minDegrees: 0,
              maxDegrees: 90,
              restitution: 0.0,
            },
            dynamics: {
              preset: 'tight_friction_pin',
              holdingTorqueNm: 0.065,
              viscousDamping: 0.50,
            },
          },
        ],
      };

      const spec: RobotAssemblySpec = {
        name: 'Breakout Mechanism',
        clusters: [
          {
            clusterId: 'base_c',
            name: 'Base',
            isRootChassis: true,
            isFixed: true,
            partIds: ['p1'],
            totalMassKg: 0.3,
            colliders: [
              {
                shape: 'box',
                halfExtents: [0.05, 0.015, 0.05],
                offset: [0, 0.015, 0],
                rotation: [0, 0, 0, 1],
                friction: 0.8,
                restitution: 0.0,
              },
            ],
          },
          {
            clusterId: 'dial_c',
            name: 'Dial',
            isRootChassis: false,
            isFixed: false,
            partIds: ['p2'],
            totalMassKg: 0.04,
            colliders: [
              {
                shape: 'box',
                halfExtents: [0.05, 0.008, 0.008],
                offset: [0.05, 0.05, 0],
                rotation: [0, 0, 0, 1],
                friction: 0.5,
                restitution: 0.0,
              },
            ],
          },
        ],
        joints: [],
        sensors: [],
        physicsSpec,
      };

      const elem = new CustomImportedMissionElement(spec, {
        id: 'inv_elem_2',
        name: 'Breakout Dial',
        isBaseFixed: true,
      });

      elem.init(world, { x: 0, y: 0.002, z: 0 });
      const dialBody = (elem as any).bodies.get('dial_c') as RAPIER.RigidBody;

      const initialAngle = elem.getJointAngleDegrees('dial_joint') || 0;

      // 1. Dial remains held at 0 degrees under gravity
      for (let i = 0; i < 60; i++) {
        world.step();
        elem.update(1 / 60);
      }
      const restAngle = elem.getJointAngleDegrees('dial_joint') || 0;
      expect(Math.abs(restAngle - initialAngle)).toBeLessThan(0.5);

      // 2. Apply actuation torque (0.003 Nms per tick) to drive dial to its 90° limit stop
      for (let i = 0; i < 90; i++) {
        dialBody.applyTorqueImpulse({ x: 0, y: 0, z: 0.003 }, true);
        world.step();
        elem.update(1 / 60);
      }

      const finalDialAngle = elem.getJointAngleDegrees('dial_joint') || 0;
      // Dial must have articulated to its limit stop (90°)
      expect(finalDialAngle).toBeGreaterThan(80.0);
      expect(finalDialAngle).toBeLessThanOrEqual(92.0);
    });
  });

  // ---------------------------------------------------------------------------
  // Invariant 3: Multi-Entity Decoupling
  // ---------------------------------------------------------------------------
  describe('Invariant 3: Multi-Entity Decoupling', () => {
    it('allows loose cart/payload to slide across mat without dragging or disrupting the anchored base station', () => {
      const spec: RobotAssemblySpec = {
        name: 'Multi-Entity Station and Cart',
        clusters: [
          {
            clusterId: 'station_base',
            name: 'Station Base',
            isRootChassis: true,
            isFixed: true,
            partIds: ['p_base'],
            totalMassKg: 0.4,
            colliders: [
              {
                shape: 'box',
                halfExtents: [0.06, 0.02, 0.06],
                offset: [0, 0.02, 0],
                rotation: [0, 0, 0, 1],
                friction: 0.8,
                restitution: 0.0,
              },
            ],
          },
          {
            clusterId: 'loose_cart',
            name: 'Loose Cart',
            isRootChassis: false,
            isFixed: false,
            partIds: ['p_cart'],
            totalMassKg: 0.08,
            colliders: [
              {
                shape: 'box',
                halfExtents: [0.03, 0.015, 0.03],
                offset: [0.15, 0.015, 0], // Positioned 15cm to the side
                rotation: [0, 0, 0, 1],
                friction: 0.2, // Low friction wheels/skids
                restitution: 0.0,
              },
            ],
          },
        ],
        joints: [], // No joints between station and loose cart
        sensors: [],
      };

      const decomposed = decomposeMissionAssembly(spec, 'm_multi', { x: 0, y: 0.001, z: 0 }, 0);
      expect(decomposed.length).toBe(2);

      const baseObj = decomposed.find((d) => d.isBaseFixed)!;
      const cartObj = decomposed.find((d) => !d.isBaseFixed)!;

      expect(baseObj).toBeDefined();
      expect(cartObj).toBeDefined();

      const baseElem = new CustomImportedMissionElement(baseObj.spec, {
        id: baseObj.id,
        name: baseObj.name,
        isBaseFixed: true,
      });
      baseElem.init(world, baseObj.initialPos);

      const cartElem = new CustomImportedMissionElement(cartObj.spec, {
        id: cartObj.id,
        name: cartObj.name,
        isBaseFixed: false,
      });
      cartElem.init(world, cartObj.initialPos);

      const baseBody = (baseElem as any).bodies.get('station_base') as RAPIER.RigidBody;
      const cartBody = (cartElem as any).bodies.get('loose_cart') as RAPIER.RigidBody;

      const baseInitialX = baseBody.translation().x;
      const cartInitialX = cartBody.translation().x;

      // Push the loose cart along X with an impulse
      cartBody.applyImpulse({ x: 0.2, y: 0, z: 0 }, true);

      for (let i = 0; i < 60; i++) {
        world.step();
        baseElem.update(1 / 60);
        cartElem.update(1 / 60);
      }

      const baseFinalX = baseBody.translation().x;
      const cartFinalX = cartBody.translation().x;

      // Invariant 3A: Cart must have moved significantly (> 20mm)
      expect(cartFinalX - cartInitialX).toBeGreaterThan(0.02);

      // Invariant 3B: Base station must remain perfectly stationary (< 0.1mm drift)
      expect(Math.abs(baseFinalX - baseInitialX)).toBeLessThan(0.0001);
    });
  });

  // ---------------------------------------------------------------------------
  // Invariant 4: Scoring Condition Evaluator
  // ---------------------------------------------------------------------------
  describe('Invariant 4: Scoring Condition Evaluator', () => {
    it('evaluates false at start pose, and triggers true with points when mechanism reaches target zone', () => {
      const physicsSpec: FllPhysicsSpec = {
        schemaVersion: '1.1.0',
        modelId: 'inv_m04',
        name: 'Scoring Test Mechanism',
        joints: [
          {
            id: 'target_lever',
            name: 'Target Lever',
            type: 'revolute',
            parentClusterId: 'base_c',
            childClusterId: 'lever_c',
            anchor: [0, 0.05, 0],
            axis: [1, 0, 0],
            limits: { minDegrees: 0, maxDegrees: 90 },
            dynamics: { holdingTorqueNm: 0.065, viscousDamping: 0.5 },
          },
        ],
        states: {
          initialPose: { jointPositions: { target_lever: 0 } },
          scoredPoses: [
            {
              id: 'flag_scored',
              label: 'Flag Fully Erected (30 pts)',
              points: 30,
              evaluator: {
                type: 'joint_threshold',
                jointId: 'target_lever',
                targetAngleMin: 75,
                targetAngleMax: 90,
              },
            },
          ],
        },
      };

      const spec: RobotAssemblySpec = {
        name: 'Scoring Mechanism',
        clusters: [
          {
            clusterId: 'base_c',
            name: 'Base',
            isRootChassis: true,
            isFixed: true,
            partIds: ['p1'],
            totalMassKg: 0.2,
            colliders: [{ shape: 'box', halfExtents: [0.04, 0.01, 0.04], offset: [0, 0.01, 0], rotation: [0, 0, 0, 1], friction: 0.8, restitution: 0 }],
          },
          {
            clusterId: 'lever_c',
            name: 'Lever',
            isRootChassis: false,
            isFixed: false,
            partIds: ['p2'],
            totalMassKg: 0.03,
            colliders: [{ shape: 'box', halfExtents: [0.01, 0.005, 0.06], offset: [0, 0.05, 0.06], rotation: [0, 0, 0, 1], friction: 0.5, restitution: 0 }],
          },
        ],
        joints: [],
        sensors: [],
        physicsSpec,
      };

      const elem = new CustomImportedMissionElement(spec, {
        id: 'inv_elem_4',
        name: 'Scoring Element',
        isBaseFixed: true,
      });

      elem.init(world, { x: 0, y: 0.001, z: 0 });

      // Check resting state: isSolved must be false
      expect(elem.isSolved()).toBe(false);
      expect(elem.getScore()).toBe(0);

      // Actuate the lever child body to 80 degrees (within the 75° to 90° scoring zone)
      const leverBody = (elem as any).bodies.get('lever_c') as RAPIER.RigidBody;
      const targetRad = (80 * Math.PI) / 180;
      const halfAngle = targetRad / 2;
      leverBody.setRotation({ x: Math.sin(halfAngle), y: 0, z: 0, w: Math.cos(halfAngle) }, true);

      // Re-evaluate score state
      const scoredResult = elem.evaluateScoreState();
      expect(scoredResult).not.toBeNull();
      expect(scoredResult!.isScored).toBe(true);
      expect(scoredResult!.points).toBe(30);
      expect(scoredResult!.label).toContain('Flag Fully Erected');
      expect(elem.isSolved()).toBe(true);
      expect(elem.getScore()).toBe(30);
    });
  });
});
