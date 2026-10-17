import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { LDrawImporter } from '../src/cad/ldraw-importer';
import { CadClusteringPreSolver } from '../src/cad/clustering-solver';
import { decomposeMissionAssembly } from '../src/missions/mission-decomposer';
import { CustomImportedMissionElement } from '../src/missions/custom-imported-element';

describe('Dual Lock & Dynamic Mechanism Movement', () => {
  let world: RAPIER.World;

  beforeAll(async () => {
    await RAPIER.init();
  });

  beforeEach(() => {
    world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  });

  it('decomposes M01.io into fixed base and dynamic articulated mechanisms connected by revolute joints', async () => {
    const ioPath = path.resolve(__dirname, '../public/missions/M01.io');
    const buf = fs.readFileSync(ioPath);
    const zip = await JSZip.loadAsync(buf);
    const ldrText = await zip.file('model.ldr')!.async('text');

    const raw = LDrawImporter.parseLDrawText(ldrText, 'M01');
    const spec = CadClusteringPreSolver.solve({ name: 'M01', parts: raw.parts, links: raw.links });

    // Chassis root must be the track & tower resting on the mat
    const rootCluster = spec.clusters.find((c) => c.isRootChassis);
    expect(rootCluster).toBeDefined();
    expect(rootCluster!.clusterId).toBe('chassis_root');
    expect(rootCluster!.isFixed).toBe(true);

    // Functional revolute joints must be extracted
    const revoluteJoints = spec.joints.filter((j) => j.type === 'REVOLUTE');
    expect(revoluteJoints.length).toBeGreaterThanOrEqual(2);

    // Decompose into distinct mission pieces
    const decomposed = decomposeMissionAssembly(spec, 'M01', { x: 0.5, y: 0.002, z: 0.5 }, 0);
    expect(decomposed.length).toBeGreaterThanOrEqual(2);

    const mainObj = decomposed[0];
    expect(mainObj.isBaseFixed).toBe(true);
    expect(mainObj.spec.joints.length).toBeGreaterThanOrEqual(2);
  });

  it('proves Dual Lock anchors only the base cluster to the field while mechanism clusters rotate freely around pins', async () => {
    const ioPath = path.resolve(__dirname, '../public/missions/M01.io');
    const buf = fs.readFileSync(ioPath);
    const zip = await JSZip.loadAsync(buf);
    const ldrText = await zip.file('model.ldr')!.async('text');

    const raw = LDrawImporter.parseLDrawText(ldrText, 'M01');
    const spec = CadClusteringPreSolver.solve({ name: 'M01', parts: raw.parts, links: raw.links });
    const decomposed = decomposeMissionAssembly(spec, 'M01', { x: 0.5, y: 0.002, z: 0.5 }, 0);
    const mainObj = decomposed[0];

    const elem = new CustomImportedMissionElement(mainObj.spec, {
      id: mainObj.id,
      name: mainObj.name,
      isBaseFixed: mainObj.isBaseFixed,
    });

    elem.init(world, mainObj.initialPos, mainObj.yawDegrees);

    // @ts-ignore
    const bodies = elem['bodies'] as Map<string, RAPIER.RigidBody>;
    const baseBody = bodies.get('chassis_root')!;
    const armBody = bodies.get('cluster_4')!;

    expect(baseBody).toBeDefined();
    expect(armBody).toBeDefined();

    // 1. Dual-locked state: Base is FIXED, Arm is DYNAMIC
    expect(baseBody.bodyType()).toBe(RAPIER.RigidBodyType.Fixed);
    expect(armBody.bodyType()).toBe(RAPIER.RigidBodyType.Dynamic);

    // Verify initial rotation
    const initRot = armBody.rotation();
    expect(initRot.z).toBeCloseTo(0, 2);

    // 2. Apply torque around the pin rotation axis
    armBody.applyTorqueImpulse({ x: 0, y: 0, z: 0.01 }, true);

    for (let step = 0; step < 30; step++) {
      world.step();
      elem.update(1 / 60);
    }

    // 3. Arm must have rotated freely around the hinge pin
    const postRot = armBody.rotation();
    const rotDiff = Math.abs(postRot.z - initRot.z);
    expect(rotDiff).toBeGreaterThan(0.05);

    // 4. Base cluster must have stayed perfectly anchored to the field
    const baseTranslation = baseBody.translation();
    expect(baseTranslation.x).toBeCloseTo(mainObj.initialPos.x, 3);
    expect(baseTranslation.z).toBeCloseTo(mainObj.initialPos.z, 3);

    // 5. Toggling Dual Lock off makes the entire assembly dynamic
    elem.setDualLocked(false);
    expect(elem.getIsBaseFixed()).toBe(false);
    expect(baseBody.bodyType()).toBe(RAPIER.RigidBodyType.Dynamic);
    expect(armBody.bodyType()).toBe(RAPIER.RigidBodyType.Dynamic);

    // 6. Re-locking Dual Lock anchors only the base back to Fixed
    elem.setDualLocked(true, { x: 0.5, z: 0.5 });
    expect(elem.getIsBaseFixed()).toBe(true);
    expect(baseBody.bodyType()).toBe(RAPIER.RigidBodyType.Fixed);
    expect(armBody.bodyType()).toBe(RAPIER.RigidBodyType.Dynamic);
  });

  it('dynamically queries interactive meshes for non-fixed clusters and excludes fixed base', async () => {
    const ioPath = path.resolve(__dirname, '../public/missions/M01.io');
    const buf = fs.readFileSync(ioPath);
    const zip = await JSZip.loadAsync(buf);
    const ldrText = await zip.file('model.ldr')!.async('text');

    const raw = LDrawImporter.parseLDrawText(ldrText, 'M01');
    const spec = CadClusteringPreSolver.solve({ name: 'M01', parts: raw.parts, links: raw.links });
    const decomposed = decomposeMissionAssembly(spec, 'M01', { x: 0.5, y: 0.002, z: 0.5 }, 0);
    const mainObj = decomposed[0];

    const elem = new CustomImportedMissionElement(mainObj.spec, {
      id: mainObj.id,
      name: mainObj.name,
      isBaseFixed: mainObj.isBaseFixed,
    });

    elem.init(world, mainObj.initialPos, mainObj.yawDegrees);

    const interactiveMeshes = elem.getInteractiveMeshes();
    expect(interactiveMeshes.length).toBeGreaterThan(0);

    // Interactive meshes must only come from dynamic clusters (e.g. cluster_4, cluster_1), NOT chassis_root
    // @ts-ignore
    const baseGroup = elem['clusterMeshes'].get('chassis_root');
    for (const mesh of interactiveMeshes) {
      let isInsideBase = false;
      baseGroup?.traverse((obj: THREE.Object3D) => {
        if (obj === mesh) isInsideBase = true;
      });
      expect(isInsideBase).toBe(false);
    }
  });

  it('rotates assembly around the fastener anchor point when dual-locked on a farther cluster', async () => {
    const ioPath = path.resolve(__dirname, '../public/missions/M01.io');
    const buf = fs.readFileSync(ioPath);
    const zip = await JSZip.loadAsync(buf);
    const ldrText = await zip.file('model.ldr')!.async('text');

    const raw = LDrawImporter.parseLDrawText(ldrText, 'M01');
    const spec = CadClusteringPreSolver.solve({ name: 'M01', parts: raw.parts, links: raw.links });
    const decomposed = decomposeMissionAssembly(spec, 'M01', { x: 0.5, y: 0.002, z: 0.5 }, 0);
    const mainObj = decomposed[0];

    const elem = new CustomImportedMissionElement(mainObj.spec, {
      id: mainObj.id,
      name: mainObj.name,
      isBaseFixed: true,
    });

    elem.init(world, { x: 0.5, y: 0.002, z: 0.5 }, 0);

    // Fasten at an anchor point 15cm along X, 5cm along Z from center
    const anchorTarget = { x: 0.65, z: 0.55 };
    elem.setDualLocked(true, anchorTarget);

    const initialFastenerPos = elem.getDualLockPosition();
    expect(initialFastenerPos).not.toBeNull();
    expect(initialFastenerPos!.x).toBeCloseTo(0.65, 3);
    expect(initialFastenerPos!.z).toBeCloseTo(0.55, 3);

    // Rotate through 45, 90, 180, 270, 360 degrees
    const testAngles = [45, 90, 135, 180, 270, 360];
    for (const yaw of testAngles) {
      elem.setRotation(yaw);

      // Fastener position MUST remain pinned to exact field coordinates!
      const rotatedFastenerPos = elem.getDualLockPosition();
      expect(rotatedFastenerPos).not.toBeNull();
      expect(rotatedFastenerPos!.x).toBeCloseTo(0.65, 3);
      expect(rotatedFastenerPos!.z).toBeCloseTo(0.55, 3);

      // Meanwhile, the assembly center basePos has orbited around the fastener
      if (yaw !== 360 && yaw !== 0) {
        const curBasePos = elem.getPosition();
        const distFromCenter = Math.hypot(curBasePos.x - 0.5, curBasePos.z - 0.5);
        expect(distFromCenter).toBeGreaterThan(0.01);
      }
    }
  });

  it('supports Fastener tool mode and toggling cluster Dual-Lock anchors in CAD Model Inspector', async () => {
    const { CadModelInspector } = await import('../src/ui/cad-inspector');
    const inspector = new CadModelInspector();

    // Verify initial tool mode and switching to fastener tool
    expect(inspector.getToolMode()).toBe('grab');
    inspector.setToolMode('fastener');
    expect(inspector.getToolMode()).toBe('fastener');

    const ioPath = path.resolve(__dirname, '../public/missions/M01.io');
    const buf = fs.readFileSync(ioPath);
    const zip = await JSZip.loadAsync(buf);
    const ldrText = await zip.file('model.ldr')!.async('text');

    const raw = LDrawImporter.parseLDrawText(ldrText, 'M01');
    const spec = CadClusteringPreSolver.solve({ name: 'M01', parts: raw.parts, links: raw.links });

    inspector.inspectSpec(spec, 'M01 Coral Reef', 'M01');
    inspector.updateDualLockMarkers();

    // @ts-ignore
    const markers = inspector['dualLockMarkers'] as Map<string, any>;
    // Root cluster is fixed by default and should have a DualLockMarker
    expect(markers.has('chassis_root')).toBe(true);

    // Dynamic arm cluster should not be fixed initially
    const armCluster = spec.clusters.find((c) => c.clusterId === 'cluster_4')!;
    expect(armCluster.isFixed).toBe(false);
    expect(markers.has('cluster_4')).toBe(false);

    // Toggle anchor on cluster_4 via inspector fastener tool
    // @ts-ignore
    inspector['toggleClusterAnchor']('cluster_4');
    expect(armCluster.isFixed).toBe(true);
    expect(markers.has('cluster_4')).toBe(true);

    // Toggle back off
    // @ts-ignore
    inspector['toggleClusterAnchor']('cluster_4');
    expect(armCluster.isFixed).toBe(false);
    expect(markers.has('cluster_4')).toBe(false);
  });
});

