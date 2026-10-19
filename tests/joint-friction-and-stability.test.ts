import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { RobotAssemblySpec } from '../src/cad/types';
import { FllPhysicsSpec } from '../src/cad/physics-spec';
import { CustomImportedMissionElement } from '../src/missions/custom-imported-element';

describe('Joint Friction, Anti-Sag Holding Torque & Physics Spec Integration', () => {
  let world: RAPIER.World;

  beforeAll(async () => {
    await RAPIER.init();
  });

  beforeEach(() => {
    world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  });

  function createTestLeverSpec(
    holdingTorqueNm = 0.065,
    initialAngleDegrees = 0,
    minDegrees = initialAngleDegrees
  ): RobotAssemblySpec {
    const physicsSpec: FllPhysicsSpec = {
      schemaVersion: '1.1.0',
      modelId: 'test_lever_assembly',
      name: 'FLL Test Lever Assembly',
      dualLockAnchors: [
        {
          id: 'dl_pad_base',
          clusterId: 'base_cluster',
          localStudCoordinates: [0, 0, 0],
          dimensionsMm: [25.4, 25.4],
        },
      ],
      joints: [
        {
          id: 'joint_lever',
          name: 'Main Swing Lever',
          type: 'revolute',
          parentClusterId: 'base_cluster',
          childClusterId: 'lever_cluster',
          anchor: [0, 0.05, 0],
          axis: [0, 0, 1],
          limits: {
            minDegrees,
            maxDegrees: 85,
            restitution: 0.05,
          },
          dynamics: {
            preset: holdingTorqueNm >= 0.065 ? 'tight_friction_pin' : 'free',
            holdingTorqueNm,
            viscousDamping: 0.6,
          },
        },
      ],
      states: {
        initialPose: {
          description: `Starting pose at ${initialAngleDegrees} deg`,
          jointPositions: {
            joint_lever: initialAngleDegrees,
          },
        },
        scoredPoses: [
          {
            id: 'state_raised_high',
            label: 'Lever Raised High (20 pts)',
            points: 20,
            evaluator: {
              type: 'joint_threshold',
              jointId: 'joint_lever',
              targetAngleMin: 80,
              targetAngleMax: 90,
            },
          },
          {
            id: 'state_raised_mid',
            label: 'Lever Raised Mid (10 pts)',
            points: 10,
            evaluator: {
              type: 'joint_threshold',
              jointId: 'joint_lever',
              targetAngleMin: 40,
              targetAngleMax: 79,
            },
          },
        ],
      },
    };

    return {
      name: 'Test Lever Assembly',
      clusters: [
        {
          clusterId: 'base_cluster',
          name: 'Station Base',
          isRootChassis: true,
          partIds: ['p1'],
          totalMassKg: 0.25,
          colliders: [
            {
              shape: 'box',
              halfExtents: [0.05, 0.015, 0.05],
              offset: [0, 0.015, 0],
              rotation: [0, 0, 0, 1],
              friction: 0.6,
              restitution: 0.0,
            },
          ],
        },
        {
          clusterId: 'lever_cluster',
          name: 'Articulated Lever',
          isRootChassis: false,
          partIds: ['p2'],
          totalMassKg: 0.04, // 40 grams LEGO beam
          colliders: [
            {
              shape: 'box',
              halfExtents: [0.05, 0.008, 0.008], // 10cm long horizontal beam
              offset: [0.05, 0.05, 0],
              rotation: [0, 0, 0, 1],
              friction: 0.6,
              restitution: 0.0,
            },
          ],
        },
      ],
      joints: [],
      physicsSpec,
      sensors: [],
    };
  }

  it('guarantees that under gravity (180 ticks), a lever with holdingTorqueNm = 0.065 does NOT droop (delta angle < 0.5 degrees)', () => {
    const spec = createTestLeverSpec(0.065, 0);
    const elem = new CustomImportedMissionElement(spec, {
      id: 'mission_lever',
      name: 'Mission Lever',
      isBaseFixed: true,
    });

    elem.init(world, { x: 0.5, y: 0.002, z: 0.5 }, 0);

    const initialAngle = elem.getJointAngleDegrees('joint_lever');
    expect(initialAngle).not.toBeNull();
    expect(Math.abs(initialAngle!)).toBeLessThan(0.05);

    // Step 180 ticks under standard earth gravity (-9.81 m/s^2)
    for (let tick = 0; tick < 180; tick++) {
      world.step();
      elem.update(1 / 60);
    }

    const postGravityAngle = elem.getJointAngleDegrees('joint_lever')!;
    const deltaAngle = Math.abs(postGravityAngle - initialAngle!);

    // Holding torque (0.065 Nm) must firmly hold the horizontal 40g lever against gravitational droop!
    expect(deltaAngle).toBeLessThan(0.5);

    // Should not trigger scored state
    const scoreState = elem.evaluateScoreState();
    expect(scoreState).not.toBeNull();
    expect(scoreState!.isScored).toBe(false);
    expect(elem.isSolved()).toBe(false);
  });

  it('proves that without adequate holding torque (free pin: 0.001 Nm), the lever droops significantly under gravity', () => {
    const looseSpec = createTestLeverSpec(0.001, 0);
    // Allow lever to droop down by opening min limit
    looseSpec.physicsSpec!.joints![0].limits = { minDegrees: -85, maxDegrees: 85 };

    const elem = new CustomImportedMissionElement(looseSpec, {
      id: 'loose_lever',
      name: 'Loose Lever',
      isBaseFixed: true,
    });

    elem.init(world, { x: 0.5, y: 0.002, z: 0.5 }, 0);

    // Step 180 ticks under gravity
    for (let tick = 0; tick < 180; tick++) {
      world.step();
      elem.update(1 / 60);
    }

    const droopAngle = elem.getJointAngleDegrees('joint_lever')!;
    // Without holding torque, the lever falls downwards under its own weight
    expect(Math.abs(droopAngle)).toBeGreaterThan(5.0);
  });

  it('articulates smoothly to its limit stop when applying torque greater than holdingTorqueNm and achieves scored pose', () => {
    const spec = createTestLeverSpec(0.065, 0);
    const elem = new CustomImportedMissionElement(spec, {
      id: 'mission_lever',
      name: 'Mission Lever',
      isBaseFixed: true,
    });

    elem.init(world, { x: 0.5, y: 0.002, z: 0.5 }, 0);

    // Initial state: not scored
    expect(elem.evaluateScoreState()!.isScored).toBe(false);
    expect(elem.getScore()).toBe(0);

    // @ts-ignore
    const bodies = elem['bodies'] as Map<string, RAPIER.RigidBody>;
    const leverBody = bodies.get('lever_cluster')!;
    expect(leverBody).toBeDefined();

    // Apply torque greater than holdingTorqueNm in the positive rotation direction (around Z)
    // 0.003 N*m*s per tick comfortably overcomes 0.065 Nm holding torque
    for (let tick = 0; tick < 180; tick++) {
      leverBody.applyTorqueImpulse({ x: 0, y: 0, z: 0.003 }, true);
      world.step();
      elem.update(1 / 60);
    }

    // Lever must have rotated to its hard limit stop (85 degrees)
    const finalAngle = elem.getJointAngleDegrees('joint_lever')!;
    expect(finalAngle).toBeGreaterThan(80.0);
    expect(finalAngle).toBeLessThanOrEqual(88.0); // Within limit bounce buffer

    // Scoring evaluator must now report high score achieved!
    const finalScore = elem.evaluateScoreState();
    expect(finalScore).not.toBeNull();
    expect(finalScore!.isScored).toBe(true);
    expect(finalScore!.points).toBe(20);
    expect(finalScore!.label).toBe('Lever Raised High (20 pts)');

    expect(elem.isSolved()).toBe(true);
    expect(elem.getScore()).toBe(20);
  });

  it('correctly applies non-zero initialPose upon init() and reset()', () => {
    // Start pose at 45 degrees
    const spec = createTestLeverSpec(0.065, 45);
    const elem = new CustomImportedMissionElement(spec, {
      id: 'mission_lever_posed',
      name: 'Mission Lever Posed',
      isBaseFixed: true,
    });

    elem.init(world, { x: 0.5, y: 0.002, z: 0.5 }, 0);

    // Initial angle should be ~45 degrees
    const angleAtStart = elem.getJointAngleDegrees('joint_lever')!;
    expect(angleAtStart).toBeCloseTo(45.0, 1);

    // Evaluator should reflect mid scored pose (40 - 79 deg)
    const startScore = elem.evaluateScoreState();
    expect(startScore!.isScored).toBe(true);
    expect(startScore!.points).toBe(10);
    expect(startScore!.label).toBe('Lever Raised Mid (10 pts)');

    // Step 180 ticks under gravity - must hold at 45 deg without drooping!
    for (let tick = 0; tick < 180; tick++) {
      world.step();
      elem.update(1 / 60);
    }

    const angleAfterGravity = elem.getJointAngleDegrees('joint_lever')!;
    expect(Math.abs(angleAfterGravity - 45.0)).toBeLessThan(0.5);

    // Articulate further up to high score
    // @ts-ignore
    const leverBody = elem['bodies'].get('lever_cluster')!;
    for (let tick = 0; tick < 120; tick++) {
      leverBody.applyTorqueImpulse({ x: 0, y: 0, z: 0.003 }, true);
      world.step();
      elem.update(1 / 60);
    }
    expect(elem.getJointAngleDegrees('joint_lever')!).toBeGreaterThan(80.0);
    expect(elem.getScore()).toBe(20);

    // Call reset() - must snap cleanly back to initial 45 deg pose!
    elem.reset();
    const angleAfterReset = elem.getJointAngleDegrees('joint_lever')!;
    expect(angleAfterReset).toBeCloseTo(45.0, 1);
    expect(elem.getScore()).toBe(10);
  });

  it('anchors designated cluster when dualLockAnchors is present in physicsSpec', () => {
    const spec = createTestLeverSpec(0.065, 0);
    const elem = new CustomImportedMissionElement(spec, {
      id: 'mission_lever',
      name: 'Mission Lever',
      isBaseFixed: true,
    });

    elem.init(world, { x: 0.5, y: 0.002, z: 0.5 }, 0);

    expect(elem.getBaseClusterId()).toBe('base_cluster');
    expect(elem.isClusterDualLockAnchored('base_cluster')).toBe(true);
    expect(elem.isClusterDualLockAnchored('lever_cluster')).toBe(false);

    // @ts-ignore
    const bodies = elem['bodies'] as Map<string, RAPIER.RigidBody>;
    expect(bodies.get('base_cluster')!.bodyType()).toBe(RAPIER.RigidBodyType.Fixed);
    expect(bodies.get('lever_cluster')!.bodyType()).toBe(RAPIER.RigidBodyType.Dynamic);
  });
});
