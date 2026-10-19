import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { LDrawImporter } from '../src/cad/ldraw-importer';
import { FllPhysicsSpec, isValidPhysicsSpec } from '../src/cad/physics-spec';

describe('Studio .io & Sidecar Physics Spec Loader', () => {
  const samplePhysicsSpec: FllPhysicsSpec = {
    schemaVersion: '1.1.0',
    modelId: 'm01_coral_reef',
    name: 'M01 Coral Reef & Scuba Station',
    author: 'FLL Sim Spec Specialist',
    dualLockAnchors: [
      {
        id: 'anchor_base_main',
        clusterId: 'chassis_root',
        localStudCoordinates: [0, 0, 0],
        dimensionsMm: [25.4, 25.4],
      },
    ],
    joints: [
      {
        id: 'joint_survey_arm',
        name: 'Survey Arm Pivot',
        type: 'revolute',
        parentClusterId: 'chassis_root',
        childClusterId: 'cluster_4',
        anchor: [0.05, 0.08, 0.02],
        axis: [0, 0, 1],
        limits: {
          minDegrees: 0,
          maxDegrees: 85,
          restitution: 0.05,
        },
        dynamics: {
          preset: 'tight_friction_pin',
          holdingTorqueNm: 0.065,
          viscousDamping: 0.6,
        },
      },
    ],
    states: {
      initialPose: {
        description: 'Arm resting down against hard stop',
        jointPositions: {
          joint_survey_arm: 0,
        },
      },
      scoredPoses: [
        {
          id: 'reef_raised_full',
          label: 'Survey Arm Fully Raised (20 pts)',
          points: 20,
          evaluator: {
            type: 'joint_threshold',
            jointId: 'joint_survey_arm',
            targetAngleMin: 75,
            targetAngleMax: 85,
          },
        },
      ],
    },
  };

  it('validates a well-formed FllPhysicsSpec', () => {
    expect(isValidPhysicsSpec(samplePhysicsSpec)).toBe(true);
    expect(isValidPhysicsSpec(null)).toBe(false);
    expect(isValidPhysicsSpec({})).toBe(false);
    expect(isValidPhysicsSpec({ modelId: 123, name: 'bad' })).toBe(false);
  });

  it('parses stock Studio .io without fll_physics.json and leaves spec.physicsSpec undefined', async () => {
    const ioPath = path.resolve(__dirname, '../public/missions/M01.io');
    const buf = fs.readFileSync(ioPath);
    const spec = await LDrawImporter.parseStudioIo(buf);

    expect(spec.name).toBeDefined();
    expect(spec.clusters.length).toBeGreaterThan(0);
    expect(spec.physicsSpec).toBeUndefined();
  });

  it('embeds fll_physics.json into a Studio .io zip archive via exportStudioIoWithPhysics', async () => {
    const ioPath = path.resolve(__dirname, '../public/missions/M01.io');
    const originalBuf = fs.readFileSync(ioPath);
    const originalArrayBuffer = originalBuf.buffer.slice(
      originalBuf.byteOffset,
      originalBuf.byteOffset + originalBuf.byteLength
    );

    const exportedBlob = await LDrawImporter.exportStudioIoWithPhysics(
      originalArrayBuffer,
      samplePhysicsSpec
    );

    expect(exportedBlob).toBeDefined();
    expect(exportedBlob.size).toBeGreaterThan(0);

    // Read back zip contents directly with JSZip
    const exportedArrayBuffer = await exportedBlob.arrayBuffer();
    const zip = await JSZip.loadAsync(exportedArrayBuffer);

    expect(zip.file('model.ldr')).not.toBeNull();
    const physicsFile = zip.file('fll_physics.json');
    expect(physicsFile).not.toBeNull();

    const rawJsonText = await physicsFile!.async('text');
    const parsedJson = JSON.parse(rawJsonText);
    expect(parsedJson.modelId).toBe('m01_coral_reef');
    expect(parsedJson.schemaVersion).toBe('1.1.0');
    expect(parsedJson.joints.length).toBe(1);
    expect(parsedJson.joints[0].dynamics.holdingTorqueNm).toBe(0.065);
  });

  it('round-trips cleanly: parsing exported .io attaches physicsSpec to RobotAssemblySpec', async () => {
    const ioPath = path.resolve(__dirname, '../public/missions/M01.io');
    const originalBuf = fs.readFileSync(ioPath);
    const originalArrayBuffer = originalBuf.buffer.slice(
      originalBuf.byteOffset,
      originalBuf.byteOffset + originalBuf.byteLength
    );

    const exportedBlob = await LDrawImporter.exportStudioIoWithPhysics(
      originalArrayBuffer,
      samplePhysicsSpec
    );
    const exportedArrayBuffer = await exportedBlob.arrayBuffer();

    const spec = await LDrawImporter.parseStudioIo(exportedArrayBuffer);

    expect(spec.physicsSpec).toBeDefined();
    expect(spec.physicsSpec!.modelId).toBe('m01_coral_reef');
    expect(spec.physicsSpec!.schemaVersion).toBe('1.1.0');
    expect(spec.physicsSpec!.dualLockAnchors).toHaveLength(1);
    expect(spec.physicsSpec!.dualLockAnchors![0].clusterId).toBe('chassis_root');
    expect(spec.physicsSpec!.joints).toHaveLength(1);
    expect(spec.physicsSpec!.joints![0].id).toBe('joint_survey_arm');
    expect(spec.physicsSpec!.states?.scoredPoses).toHaveLength(1);
  });

  it('safely handles corrupted or invalid fll_physics.json without crashing', async () => {
    const ioPath = path.resolve(__dirname, '../public/missions/M01.io');
    const originalBuf = fs.readFileSync(ioPath);

    // Create a zip with invalid fll_physics.json content
    const zip = await JSZip.loadAsync(originalBuf);
    zip.file('fll_physics.json', '{ invalid json [(');
    const corruptedBlob = await zip.generateAsync({ type: 'blob' });
    const corruptedBuf = await corruptedBlob.arrayBuffer();

    const spec = await LDrawImporter.parseStudioIo(corruptedBuf);
    expect(spec.name).toBeDefined();
    expect(spec.physicsSpec).toBeUndefined();
  });
});
