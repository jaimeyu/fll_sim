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

  it('marks root chassis as isFixed=true while other clusters remain dynamic for simulation', async () => {
    const { CadClusteringPreSolver } = await import('./clustering-solver');
    const stationaryAssembly = {
      name: 'Stationary Goal Frame',
      parts: [
        {
          id: 'base_1',
          partNumber: '3020',
          position: [0, 0, 0] as [number, number, number],
          rotation: [0, 0, 0, 1] as [number, number, number, number],
          role: 'GENERIC_RIGID' as const,
          submodel: 'Base',
        },
        {
          id: 'post_1',
          partNumber: '32524',
          position: [0, 50, 0] as [number, number, number],
          rotation: [0, 0, 0, 1] as [number, number, number, number],
          role: 'STRUCTURAL_BEAM' as const,
          submodel: 'Post',
        },
      ],
      links: [], // No joints
    };

    const spec = CadClusteringPreSolver.solve(stationaryAssembly);
    expect(spec.joints.length).toBe(0);
    expect(spec.clusters.length).toBe(2);
    // Root chassis is anchored to the field mat (isFixed: true), secondary clusters are dynamic (isFixed: false)
    const rootCluster = spec.clusters.find((c) => c.isRootChassis);
    expect(rootCluster).toBeDefined();
    expect(rootCluster!.isFixed).toBe(true);

    const dynamicClusters = spec.clusters.filter((c) => !c.isRootChassis);
    for (const cluster of dynamicClusters) {
      expect(cluster.isFixed).toBe(false);
    }
  });

  it('preserves revolute joint anchorParent and anchorChild alignment for articulated mechanisms', async () => {
    const { CadClusteringPreSolver } = await import('./clustering-solver');
    const mechanismAssembly = {
      name: 'Articulated Lever',
      parts: [
        {
          id: 'stand',
          partNumber: '32524',
          position: [0, 0, 0] as [number, number, number],
          rotation: [0, 0, 0, 1] as [number, number, number, number],
          role: 'STRUCTURAL_BEAM' as const,
          submodel: 'Stand',
        },
        {
          id: 'arm',
          partNumber: '32524',
          position: [50, 20, 0] as [number, number, number],
          rotation: [0, 0, 0, 1] as [number, number, number, number],
          role: 'STRUCTURAL_BEAM' as const,
          submodel: 'Arm',
        },
      ],
      links: [
        {
          fromPartId: 'stand',
          toPartId: 'arm',
          connectionType: 'REVOLUTE_AXLE' as const,
          jointAxis: [0, 0, 1] as [number, number, number],
          anchor: [0.05, 0.02, 0] as [number, number, number],
        },
      ],
    };

    const spec = CadClusteringPreSolver.solve(mechanismAssembly);
    expect(spec.joints.length).toBe(1);
    const joint = spec.joints[0];
    expect(joint.anchorParent).toEqual([0.05, 0.02, 0]);
    // anchorChild must match anchorParent to avoid violent coordinate snap displacement
    expect(joint.anchorChild).toEqual([0.05, 0.02, 0]);

    // Parent cluster should be fixed, child articulated cluster can be dynamic
    const parentCluster = spec.clusters.find((c) => c.clusterId === joint.parentClusterId);
    const childCluster = spec.clusters.find((c) => c.clusterId === joint.childClusterId);
    expect(parentCluster?.isFixed).toBe(true);
    expect(childCluster?.isFixed).toBe(false);
  });
});
