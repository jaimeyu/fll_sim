import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { LDrawImporter } from './ldraw-importer';
import {
  SEASON_MISSIONS_CONFIG,
  isMissionConfigEnabled,
  saveStoredSeasonMissionOverride,
  getStoredSeasonMissionOverrides,
} from '../missions/season-config';

describe('LDrawImporter & MPD Submodel Recursion', () => {
  it('parses flat LDraw format without submodels', () => {
    const flatLdr = `
0 Simple Flat Model
1 16 0 -10 20 1 0 0 0 1 0 0 0 1 3001.dat
1 16 40 -10 20 1 0 0 0 1 0 0 0 1 3001.dat
`;
    const parsed = LDrawImporter.parseLDrawText(flatLdr, 'Flat Test');
    expect(parsed.parts.length).toBe(2);
    expect(parsed.parts[0].partNumber).toBe('3001');
    expect(parsed.parts[0].position[0]).toBe(0);
    expect(parsed.parts[0].position[1]).toBe(4); // -(-10) * 0.4 = 4mm
    expect(parsed.parts[1].position[0]).toBe(16); // 40 * 0.4 = 16mm
  });

  it('recursively unpacks multi-part document (MPD) submodels with matrix accumulation', () => {
    const mpdLdr = `
0 FILE main_assembly.ldr
0 Main Assembly
1 16 100 0 0 1 0 0 0 1 0 0 0 1 submodel_lever
1 16 200 0 0 1 0 0 0 1 0 0 0 1 32013.dat

0 FILE submodel_lever.ldr
0 Lever submodel
1 16 0 50 0 1 0 0 0 1 0 0 0 1 4274.dat
1 16 0 0 50 1 0 0 0 1 0 0 0 1 submodel_pin

0 FILE submodel_pin.ldr
0 Pin leaf submodel
1 16 10 10 10 1 0 0 0 1 0 0 0 1 6558.dat
`;

    const parsed = LDrawImporter.parseLDrawText(mpdLdr, 'main_assembly');

    // Should resolve all 3 terminal parts:
    // 1. 32013 from main
    // 2. 4274 from submodel_lever
    // 3. 6558 from submodel_pin (nested 2 levels deep!)
    expect(parsed.parts.length).toBe(3);

    const partTypes = parsed.parts.map((p) => p.partNumber);
    expect(partTypes).toContain('32013');
    expect(partTypes).toContain('4274');
    expect(partTypes).toContain('6558');

    // Check nested position accumulation for 6558:
    // main offset = (100, 0, 0)
    // lever offset = (0, 0, 50)
    // pin offset = (10, 10, 10)
    // total = (110, 10, 60) in LDU -> mm: (110*0.4, -10*0.4, -60*0.4) = (44, -4, -24)
    const pinPart = parsed.parts.find((p) => p.partNumber === '6558')!;
    expect(pinPart.position[0]).toBeCloseTo(44, 2);
    expect(pinPart.position[1]).toBeCloseTo(-4, 2);
    expect(pinPart.position[2]).toBeCloseTo(-24, 2);
  });

  it('safely breaks cycles in malformed circular submodel definitions', () => {
    const circularLdr = `
0 FILE loop_a.ldr
1 16 10 0 0 1 0 0 0 1 0 0 0 1 loop_b.ldr
1 16 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat

0 FILE loop_b.ldr
1 16 20 0 0 1 0 0 0 1 0 0 0 1 loop_a.ldr
1 16 0 0 0 1 0 0 0 1 0 0 0 1 3002.dat
`;

    // Should not throw or stack overflow
    const parsed = LDrawImporter.parseLDrawText(circularLdr, 'loop_a');
    expect(parsed.parts.length).toBeGreaterThanOrEqual(2);
  });

  it('unpacks and clusters official season model M01.io directly from binary', async () => {
    const filePath = path.resolve(__dirname, '../../public/missions/M01.io');
    if (!fs.existsSync(filePath)) {
      console.warn('M01.io not found in public/missions, skipping binary test');
      return;
    }

    const buffer = fs.readFileSync(filePath);
    const arrayBuf = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const spec = await LDrawImporter.parseStudioIo(arrayBuf);

    console.log('SPEC CLUSTERS COUNT:', spec.clusters.length);
    spec.clusters.forEach((c) => {
      console.log(`Cluster ${c.clusterId} (${c.name}): isRoot=${c.isRootChassis}, parts=${c.partIds.length}, colliders=${c.colliders.length}, mass=${c.totalMassKg}kg`);
    });

    expect(spec.name).toBe('Studio Model');
    // M01 contains over 100 parts clustered into rigid bodies
    expect(spec.clusters.length).toBeGreaterThan(0);
    const totalParts = spec.clusters.reduce((sum, c) => sum + c.partIds.length, 0);
    expect(totalParts).toBeGreaterThan(100);

    // Bounding boxes should be computed
    for (const cluster of spec.clusters) {
      expect(cluster.colliders.length).toBeGreaterThan(0);
      for (const col of cluster.colliders) {
        if (col.shape === 'box' && col.halfExtents) {
          expect(col.halfExtents[0]).toBeGreaterThan(0);
          expect(col.halfExtents[1]).toBeGreaterThan(0);
          expect(col.halfExtents[2]).toBeGreaterThan(0);
        }
      }
    }
  });

  it('extracts and validates complete parts BOM and decomposed colliders from M01.io', async () => {
    const filePath = path.resolve(__dirname, '../../public/missions/M01.io');
    const buffer = fs.readFileSync(filePath);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

    const spec = await LDrawImporter.parseStudioIo(arrayBuffer);

    // 1. BOM should be attached and non-empty
    expect(spec.bom).toBeDefined();
    expect(spec.bom!.length).toBeGreaterThan(30);

    // 2. Validate key parts in M01
    const part50450 = spec.bom!.find((b) => b.partNumber === '50450');
    expect(part50450).toBeDefined();
    expect(part50450!.count).toBe(4);
    expect(part50450!.name).toContain('Axle 32L');
    expect(part50450!.hasAccurateMesh).toBe(true);

    const part32013 = spec.bom!.find((b) => b.partNumber === '32013');
    expect(part32013).toBeDefined();
    expect(part32013!.hasAccurateMesh).toBe(true);

    const part32555 = spec.bom!.find((b) => b.partNumber === '32555');
    expect(part32555).toBeDefined();
    expect(part32555!.hasAccurateMesh).toBe(true);

    const part3020 = spec.bom!.find((b) => b.partNumber === '3020');
    expect(part3020).toBeDefined();
    expect(part3020!.hasAccurateMesh).toBe(true);

    // 3. Verify decomposed colliders (no giant >300mm single block covering empty air)
    const chassisRoot = spec.clusters.find((c) => c.isRootChassis)!;
    expect(chassisRoot).toBeDefined();
    // Chassis root has 10 decomposed submodel colliders
    expect(chassisRoot.colliders.length).toBeGreaterThan(1);
    for (const col of chassisRoot.colliders) {
      if (col.shape === 'box' && col.halfExtents) {
        const fullSpanX = col.halfExtents[0] * 2;
        // No single collider should span > 300mm (0.30m)
        expect(fullSpanX).toBeLessThan(0.30);
      }
    }
  });
});

describe('Season Missions Configuration', () => {
  it('defines all 13 official BIOGLOW missions', () => {
    expect(SEASON_MISSIONS_CONFIG.length).toBe(13);

    const ids = SEASON_MISSIONS_CONFIG.map((m) => m.id);
    expect(ids).toEqual([
      'M01', 'M02', 'M03', 'M04', 'M05',
      'M06', 'M07', 'M08', 'M09', 'M10',
      'M11', 'M12', 'M13',
    ]);
  });

  it('starts with a clean field so not all 13 models load simultaneously', () => {
    const defaultEnabled = SEASON_MISSIONS_CONFIG.filter((m) => m.enabledByDefault);
    // Field starts clean by default (0 models enabled initially)
    expect(defaultEnabled.length).toBe(0);

    const defaultDisabled = SEASON_MISSIONS_CONFIG.filter((m) => !m.enabledByDefault);
    expect(defaultDisabled.length).toBe(SEASON_MISSIONS_CONFIG.length);
  });

  it('persists and retrieves user selective loading preferences', () => {
    saveStoredSeasonMissionOverride('M05', true);
    const overrides = getStoredSeasonMissionOverrides();
    expect(overrides['M05']).toBe(true);

    const m5Config = SEASON_MISSIONS_CONFIG.find((m) => m.id === 'M05')!;
    expect(isMissionConfigEnabled(m5Config)).toBe(true);

    // Clean up
    saveStoredSeasonMissionOverride('M05', false);
    expect(isMissionConfigEnabled(m5Config)).toBe(false);
  });
});
