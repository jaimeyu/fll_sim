import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { LDrawImporter } from '../src/cad/ldraw-importer';
import { isFastenerPart, isPivotFastener } from '../src/cad/part-catalog';

describe('Model Structural Integrity & Fastener Connectivity', () => {
  it('correctly classifies Technic pins, axles, bushes and pivot parts', () => {
    // Friction pins should be fasteners, but NOT free pivot fasteners
    expect(isFastenerPart('2780')).toBe(true);
    expect(isPivotFastener('2780')).toBe(false);
    expect(isFastenerPart('6558')).toBe(true);
    expect(isPivotFastener('6558')).toBe(false);
    expect(isFastenerPart('32054')).toBe(true);
    expect(isPivotFastener('32054')).toBe(false);

    // Frictionless pivot pins and axles SHOULD be pivot fasteners
    expect(isFastenerPart('3673')).toBe(true);
    expect(isPivotFastener('3673')).toBe(true);
    expect(isFastenerPart('3749')).toBe(true);
    expect(isPivotFastener('3749')).toBe(true);
    expect(isFastenerPart('3705')).toBe(true);
    expect(isPivotFastener('3705')).toBe(true);
    expect(isFastenerPart('50450')).toBe(true);
    expect(isPivotFastener('50450')).toBe(true);

    // Standard bricks should not be fasteners
    expect(isFastenerPart('3001')).toBe(false);
    expect(isFastenerPart('3020')).toBe(false);
  });

  it('keeps official season models solidly intact without breaking into fragmented shards', async () => {
    const modelsToTest = ['M01.io', 'M02.io', 'M04.io', 'M06.io'];

    for (const name of modelsToTest) {
      const filePath = path.resolve(__dirname, '../public/missions', name);
      if (!fs.existsSync(filePath)) continue;

      const buf = fs.readFileSync(filePath);
      const spec = await LDrawImporter.parseStudioIo(
        buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
      );

      // Root base must exist and be fixed
      const rootCluster = spec.clusters.find((c) => c.isRootChassis);
      expect(rootCluster).toBeDefined();
      expect(rootCluster?.isFixed).toBe(true);

      // Root cluster should hold a substantial proportion of the stationary station parts
      expect(rootCluster!.partIds.length).toBeGreaterThanOrEqual(40);

      // The model should NOT break into excessive loose clusters (e.g. <= 5 clusters for standard models)
      expect(spec.clusters.length).toBeLessThanOrEqual(5);

      // No cluster should have empty colliders
      for (const c of spec.clusters) {
        expect(c.colliders.length).toBeGreaterThan(0);
      }
    }
  });
});
