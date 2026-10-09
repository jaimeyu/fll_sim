import { describe, it, expect } from 'vitest';
import { getFllAdvanceDrivingBaseSpec, createFllAdvanceDrivingBaseAssembly } from './models/advance-driving-base';

describe('CAD Ingestion & Pin Clustering Pre-Solver', () => {
  it('decomposes 130+ parts (including 120 pins) into <= 5 rigid bodies', () => {
    const rawAssembly = createFllAdvanceDrivingBaseAssembly();
    expect(rawAssembly.parts.length).toBeGreaterThan(125);

    const spec = getFllAdvanceDrivingBaseSpec();

    // Verify rigid body clustering
    // Should have: 1 Chassis root, 1 Left Wheel, 1 Right Wheel, 1 Caster Skid <= 4 bodies!
    expect(spec.clusters.length).toBeLessThanOrEqual(5);

    const rootChassis = spec.clusters.find((c) => c.isRootChassis);
    expect(rootChassis).toBeDefined();
    // The root chassis must contain the bulk of the parts (hub + beams + 120 pins + motors)
    expect(rootChassis!.partIds.length).toBeGreaterThan(120);

    // Verify joints: 2 drive wheel revolute joints for ports A and B
    expect(spec.joints.length).toBeGreaterThanOrEqual(2);
    const motorJoints = spec.joints.filter((j) => j.type === 'REVOLUTE');
    expect(motorJoints.length).toBeGreaterThanOrEqual(2);

    // Verify sensors extracted: 2 color sensors (ports C and D) and Gyro IMU
    expect(spec.sensors.length).toBe(3);
    const colorSensors = spec.sensors.filter((s) => s.type === 'COLOR');
    expect(colorSensors.length).toBe(2);
    expect(colorSensors.map((s) => s.port).sort()).toEqual(['C', 'D']);

    const gyro = spec.sensors.find((s) => s.type === 'GYRO');
    expect(gyro).toBeDefined();
  });

  it('clusters parts belonging to the same submodel into a single rigid cluster', async () => {
    const { CadClusteringPreSolver } = await import('./clustering-solver');
    const mockAssembly = {
      name: 'SubModel Test',
      parts: [
        {
          id: 'p1',
          partNumber: '32524',
          position: [0, 0, 0] as [number, number, number],
          rotation: [0, 0, 0, 1] as [number, number, number, number],
          role: 'STRUCTURAL_BEAM' as const,
          submodel: 'CartAssembly',
        },
        {
          id: 'p2',
          partNumber: '32524',
          position: [100, 0, 0] as [number, number, number], // 100mm away (farther than proximity limit)
          rotation: [0, 0, 0, 1] as [number, number, number, number],
          role: 'STRUCTURAL_BEAM' as const,
          submodel: 'CartAssembly',
        },
        {
          id: 'p3',
          partNumber: '2780', // Pin
          position: [50, 0, 0] as [number, number, number],
          rotation: [0, 0, 0, 1] as [number, number, number, number],
          role: 'FASTENER_PIN' as const,
          submodel: 'CartAssembly',
        },
        {
          id: 'base1',
          partNumber: '3020',
          position: [0, -50, 0] as [number, number, number],
          rotation: [0, 0, 0, 1] as [number, number, number, number],
          role: 'GENERIC_RIGID' as const,
          submodel: 'BaseFrame',
        },
      ],
      links: [],
    };

    const spec = CadClusteringPreSolver.solve(mockAssembly);
    // CartAssembly has 3 parts, BaseFrame has 1 part.
    // They should be in distinct clusters, and CartAssembly should keep all 3 parts together.
    expect(spec.clusters.length).toBe(2);
    const cartCluster = spec.clusters.find((c) => c.partIds.includes('p1'));
    expect(cartCluster).toBeDefined();
    expect(cartCluster!.partIds).toContain('p2');
    expect(cartCluster!.partIds).toContain('p3');
    // Largest cluster (3 parts) is assigned isRootChassis
    expect(cartCluster!.isRootChassis).toBe(true);
  });
});
