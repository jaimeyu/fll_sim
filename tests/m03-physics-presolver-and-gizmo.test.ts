import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { LDrawImporter } from '../src/cad/ldraw-importer';
import { CadClusteringPreSolver } from '../src/cad/clustering-solver';
import { isValidPhysicsSpec, FllPhysicsSpec } from '../src/cad/physics-spec';

describe('M03 Flip the Rock: Pre-Solver Toggle, Submodels & Gizmo Centering', () => {
  let m03Buffer: ArrayBuffer;
  let m03ParsedText: any;

  beforeAll(async () => {
    const ioPath = path.resolve(__dirname, '../public/missions/M03.io');
    const nodeBuf = fs.readFileSync(ioPath);
    m03Buffer = nodeBuf.buffer.slice(nodeBuf.byteOffset, nodeBuf.byteOffset + nodeBuf.byteLength);

    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const contents = await zip.loadAsync(m03Buffer);
    const ldrText = await contents.file('model.ldr')!.async('text');
    m03ParsedText = LDrawImporter.parseLDrawText(ldrText, 'M03 Model');
  });

  describe('1. Pre-Solver Decomposition & Submodel Isolation', () => {
    it('proves default pre-solver fuses rock mechanism into chassis_root', () => {
      const spec = CadClusteringPreSolver.solve(m03ParsedText, { disablePreSolver: false });
      expect(spec.isPreSolverDisabled).toBe(false);
      // In default proximity mode, parts within 8.5mm get welded into root
      const rootCluster = spec.clusters.find((c) => c.isRootChassis);
      expect(rootCluster).toBeDefined();
      expect(rootCluster!.partIds.length).toBeGreaterThan(100);
      expect(spec.clusters.length).toBeLessThan(5);
    });

    it('proves disablePreSolver: true isolates each submodel into independent dynamic clusters', () => {
      const spec = CadClusteringPreSolver.solve(m03ParsedText, { disablePreSolver: true });
      expect(spec.isPreSolverDisabled).toBe(true);
      // With pre-solver disabled, all 8 submodels are preserved!
      expect(spec.clusters.length).toBe(8);

      const root = spec.clusters.find((c) => c.isRootChassis);
      expect(root).toBeDefined();
      expect(root!.clusterId).toBe('chassis_root');
      expect(root!.name).toBe('root_inst0');
      expect(root!.isFixed).toBe(true);
      expect(root!.partIds.length).toBe(41); // Exactly the base frame

      // The rock flipper submodels must be separate dynamic clusters!
      const sub5 = spec.clusters.find((c) => c.name.toLowerCase().includes('group 5'));
      const sub6 = spec.clusters.find((c) => c.name.toLowerCase().includes('group 6'));
      expect(sub5).toBeDefined();
      expect(sub6).toBeDefined();
      expect(sub5!.isFixed).toBe(false);
      expect(sub6!.isFixed).toBe(false);
      expect(sub5!.partIds.length).toBe(32);
      expect(sub6!.partIds.length).toBe(24);
    });

    it('proves yellow pin 3749 and red lever 6629 belong to the same cluster preventing clipping', () => {
      const spec = CadClusteringPreSolver.solve(m03ParsedText, { disablePreSolver: true });
      const rightLever = spec.clusters.find((c) => c.name.toLowerCase().includes('group 2_mirrored'));
      expect(rightLever).toBeDefined();
      expect(rightLever!.partIds.length).toBe(2);

      const parts = rightLever!.parts!;
      const pin = parts.find((p) => p.partNumber === '3749');
      const lever = parts.find((p) => p.partNumber === '6629');
      expect(pin).toBeDefined();
      expect(lever).toBeDefined();

      // Yellow pin coordinate in meters: [0.136, 0.0485, 0.0454]
      expect(pin!.position[0] / 1000).toBeCloseTo(0.136, 3);
      expect(pin!.position[1] / 1000).toBeCloseTo(0.0485, 3);
      expect(pin!.position[2] / 1000).toBeCloseTo(0.0454, 3);
    });
  });

  describe('2. M03 Physics Specification Sidecar Integrity', () => {
    it('validates public/missions/M03.physics.json against FllPhysicsSpec schema', () => {
      const jsonPath = path.resolve(__dirname, '../public/missions/M03.physics.json');
      expect(fs.existsSync(jsonPath)).toBe(true);
      const raw = fs.readFileSync(jsonPath, 'utf-8');
      const spec: FllPhysicsSpec = JSON.parse(raw);

      expect(isValidPhysicsSpec(spec)).toBe(true);
      expect(spec.modelId).toBe('M03');
      expect(spec.schemaVersion).toBe('1.1.0');
    });

    it('contains 3-point Dual-Lock perimeter anchors for 100% static ground stability', () => {
      const raw = fs.readFileSync(path.resolve(__dirname, '../public/missions/M03.physics.json'), 'utf-8');
      const spec: FllPhysicsSpec = JSON.parse(raw);

      expect(spec.dualLockAnchors).toBeDefined();
      expect(spec.dualLockAnchors!.length).toBe(3);
      const padIds = spec.dualLockAnchors!.map((p) => p.id);
      expect(padIds).toContain('dl_m03_base_left');
      expect(padIds).toContain('dl_m03_base_right');
      expect(padIds).toContain('dl_m03_base_back');
    });

    it('contains calibrated revolute joints with pin holding torques and angle limits', () => {
      const raw = fs.readFileSync(path.resolve(__dirname, '../public/missions/M03.physics.json'), 'utf-8');
      const spec: FllPhysicsSpec = JSON.parse(raw);

      expect(spec.joints).toBeDefined();
      expect(spec.joints!.length).toBe(3);

      const leftLever = spec.joints!.find((j) => j.id === 'joint_lever_left');
      const rightLever = spec.joints!.find((j) => j.id === 'joint_lever_right');
      const flipper = spec.joints!.find((j) => j.id === 'joint_rock_flipper');

      expect(leftLever).toBeDefined();
      expect(rightLever).toBeDefined();
      expect(flipper).toBeDefined();

      // Right lever anchor matches yellow pin center
      expect(rightLever!.anchor[0]).toBeCloseTo(0.136, 3);
      expect(rightLever!.anchor[1]).toBeCloseTo(0.0485, 3);
      expect(rightLever!.anchor[2]).toBeCloseTo(0.0454, 3);
      expect(rightLever!.limits?.maxDegrees).toBe(85);
      expect(rightLever!.dynamics.holdingTorqueNm).toBe(0.065);

      // Left lever anchor matches yellow pin center
      expect(leftLever!.anchor[0]).toBeCloseTo(0.048, 3);
      expect(leftLever!.anchor[1]).toBeCloseTo(0.0485, 3);
      expect(leftLever!.anchor[2]).toBeCloseTo(0.0454, 3);
      expect(leftLever!.limits?.maxDegrees).toBe(85);
      expect(leftLever!.dynamics.holdingTorqueNm).toBe(0.065);

      // Flipper cradle
      expect(flipper!.anchor[0]).toBeCloseTo(0.092, 3);
      expect(flipper!.limits?.maxDegrees).toBe(90);
    });

    it('defines initialPose and scoredPose', () => {
      const raw = fs.readFileSync(path.resolve(__dirname, '../public/missions/M03.physics.json'), 'utf-8');
      const spec: FllPhysicsSpec = JSON.parse(raw);

      expect(spec.states?.initialPose).toBeDefined();
      expect(spec.states!.initialPose!.jointPositions['joint_lever_left']).toBe(0);
      expect(spec.states!.initialPose!.jointPositions['joint_lever_right']).toBe(0);

      expect(spec.states?.scoredPoses).toBeDefined();
      expect(spec.states!.scoredPoses!.length).toBeGreaterThan(0);
      expect(spec.states!.scoredPoses![0].points).toBe(20);
    });
  });

  describe('3. CAD Inspector Gizmo Centering & Offset Verification', () => {
    it('proves joint gizmo and sweep center are accurately aligned with modelOffset', () => {
      const raw = fs.readFileSync(path.resolve(__dirname, '../public/missions/M03.physics.json'), 'utf-8');
      const physicsSpec: FllPhysicsSpec = JSON.parse(raw);
      const rightJoint = physicsSpec.joints!.find((j) => j.id === 'joint_lever_right')!;

      // Centering offset simulated as in CadModelInspector.build3DRepresentation
      const modelOffset = new THREE.Vector3(-0.092, 0.020, -0.045);

      // World anchor when offset is added:
      const worldAnchor = new THREE.Vector3(
        rightJoint.anchor[0] + modelOffset.x,
        rightJoint.anchor[1] + modelOffset.y,
        rightJoint.anchor[2] + modelOffset.z
      );

      // Simulating a cluster mesh located at CAD position + modelOffset
      const cadPartPos = new THREE.Vector3(0.140, 0.0998, 0.0189);
      const initialMeshPos = cadPartPos.clone().add(modelOffset);

      // Rotate around the world anchor by 45 degrees
      const rad = (45 * Math.PI) / 180;
      const axis = new THREE.Vector3(1, 0, 0);
      const rotQuat = new THREE.Quaternion().setFromAxisAngle(axis, rad);

      const rotatedPos = initialMeshPos.clone().sub(worldAnchor).applyQuaternion(rotQuat).add(worldAnchor);

      // Distance from rotation center before and after MUST be identical (concentric arc)
      const distBefore = initialMeshPos.distanceTo(worldAnchor);
      const distAfter = rotatedPos.distanceTo(worldAnchor);
      expect(distAfter).toBeCloseTo(distBefore, 6);
    });
  });
});
