import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { LDrawImporter } from '../src/cad/ldraw-importer';
import { isChainPart } from '../src/cad/part-catalog';
import { CadModelInspector } from '../src/ui/cad-inspector';

describe('Dynamic Chains & Inspector Tool Modes', () => {
  it('correctly identifies LEGO chain and flexible linkage parts', () => {
    expect(isChainPart('30104')).toBe(true);
    expect(isChainPart('209')).toBe(true);
    expect(isChainPart('208')).toBe(true);
    expect(isChainPart('3711')).toBe(true);
    expect(isChainPart('60447')).toBe(true);
    expect(isChainPart('57518')).toBe(true);
    expect(isChainPart('3001')).toBe(false); // standard 2x4 brick
    expect(isChainPart('32524')).toBe(false); // technic beam 7L
  });

  it('unpacks M10.io and ensures chain cluster is dynamic (isFixed=false) with spherical joints', async () => {
    const filePath = path.resolve(__dirname, '../public/missions/M10.io');
    if (!fs.existsSync(filePath)) {
      console.warn('M10.io not found at path, skipping binary inspection');
      return;
    }
    const buf = fs.readFileSync(filePath);
    const spec = await LDrawImporter.parseStudioIo(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    );

    // Root chassis must be fixed to ground
    const rootCluster = spec.clusters.find((c) => c.isRootChassis);
    expect(rootCluster).toBeDefined();
    expect(rootCluster?.isFixed).toBe(true);

    // Chain cluster must exist and must be dynamic (isFixed = false)
    const chainCluster = spec.clusters.find((c) =>
      c.name.toLowerCase().includes('chain') ||
      c.parts?.some((p) => isChainPart(p.partNumber, p.submodel))
    );
    expect(chainCluster).toBeDefined();
    expect(chainCluster?.isFixed).toBe(false);

    // Spherical joints should connect the chain
    const sphericalJoints = spec.joints.filter((j) => j.type === 'SPHERICAL');
    expect(sphericalJoints.length).toBeGreaterThan(0);
  });

  it('provides multi-mode interaction tool switching in CadModelInspector', () => {
    const inspector = new CadModelInspector();
    expect(inspector.getToolMode()).toBe('grab');

    // Switch to Technic Bar mode
    inspector.setToolMode('technic_bar');
    expect(inspector.getToolMode()).toBe('technic_bar');

    // Switch back to Grab mode
    inspector.setToolMode('grab');
    expect(inspector.getToolMode()).toBe('grab');
  });
});
