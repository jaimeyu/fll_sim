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
});
