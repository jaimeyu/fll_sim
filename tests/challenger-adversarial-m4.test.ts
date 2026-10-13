import { describe, it, expect } from 'vitest';
import { SimulationPhysicsEngine } from '../src/physics/engine';
import { VirtualSensorManager } from '../src/sensors/sensor-manager';
import { VirtualSpikeApi } from '../src/runtime/spike-api';
import { PythonScriptRunner } from '../src/runtime/python-runner';

describe('Adversarial Challenger Suite: Milestone 4 Sensor Calibration & Gyro Dynamics', () => {
  // Helper to create physics simulation instance
  async function createSim(initialYaw = 90) {
    const engine = new SimulationPhysicsEngine();
    await engine.init();
    if (initialYaw !== 90) {
      engine.robot.reset({ x: 0, y: 0.05, z: 0, yawDegrees: initialYaw });
    }
    // Settle physics briefly
    for (let i = 0; i < 15; i++) engine.update(1 / 60);
    const sensors = new VirtualSensorManager(engine.robot);
    const api = new VirtualSpikeApi(engine, sensors);
    const runner = new PythonScriptRunner(api);
    return { engine, sensors, api, runner };
  }

  describe('Challenge 1: Sensor Yaw Baseline Calibration', () => {
    it('returns exactly 0 immediately after new VirtualSensorManager at default spawn (90 deg)', async () => {
      const { engine, sensors } = await createSim(90);
      // Robot spawns nominally facing East (~90 deg)
      expect(Math.abs(engine.robot.getYawDegrees() - 90)).toBeLessThan(1.0);
      // VirtualSensorManager calibrated relative yaw must be strictly 0
      expect(sensors.getYaw()).toBe(0);
    });

    it('returns exactly 0 immediately after new VirtualSensorManager at arbitrary spawn orientations', async () => {
      const testOrientations = [0, 30, 45, 90, 135, 180, -45, -90, -135, -180, -179.9, 179.9];
      for (const orient of testOrientations) {
        const { engine, sensors } = await createSim(orient);
        const actualWorldYaw = engine.robot.getYawDegrees();
        const expected = orient === -180 ? 180 : orient;
        expect(Math.abs(actualWorldYaw - expected)).toBeLessThan(1.0);
        // Sensor must calibrate to 0 regardless of initial world angle
        expect(sensors.getYaw()).toBe(0);
      }
    });

    it('defensively handles constructor when robot reference is undefined/null without crashing', () => {
      expect(() => new VirtualSensorManager(undefined as any)).not.toThrow();
      expect(() => new VirtualSensorManager(null as any)).not.toThrow();
    });
  });

  describe('Challenge 2: Relative Rotation Deltas & Wrap-around Dynamics', () => {
    it('properly reflects rotation deltas when robot rotates clockwise (+30 deg, +90 deg)', async () => {
      const { engine, sensors } = await createSim(90);
      const baseYaw = engine.robot.getYawDegrees();
      expect(sensors.getYaw()).toBe(0);

      // Rotate +30 deg relative to baseline
      engine.robot.reset({ x: 0, y: 0.05, z: 0, yawDegrees: baseYaw + 30 });
      expect(sensors.getYaw()).toBe(30);

      // Rotate +90 deg relative to baseline
      engine.robot.reset({ x: 0, y: 0.05, z: 0, yawDegrees: baseYaw + 90 });
      expect(sensors.getYaw()).toBe(90);
    });

    it('properly reflects rotation deltas when robot rotates counter-clockwise (-30 deg, -90 deg)', async () => {
      const { engine, sensors } = await createSim(90);
      const baseYaw = engine.robot.getYawDegrees();
      expect(sensors.getYaw()).toBe(0);

      // Rotate -30 deg relative to baseline
      engine.robot.reset({ x: 0, y: 0.05, z: 0, yawDegrees: baseYaw - 30 });
      expect(sensors.getYaw()).toBe(-30);

      // Rotate -90 deg relative to baseline
      engine.robot.reset({ x: 0, y: 0.05, z: 0, yawDegrees: baseYaw - 90 });
      expect(sensors.getYaw()).toBe(-90);
    });

    it('seamlessly handles clockwise 180-degree boundary wrap-around', async () => {
      // Robot starts at 150 deg, relative 0
      const { engine, sensors } = await createSim(150);
      const baseYaw = engine.robot.getYawDegrees();
      expect(sensors.getYaw()).toBe(0);

      // Rotate +60 deg relative: world angle reaches 210 deg, which wraps in Rapier to -150 deg
      // baseYaw is ~150 deg; baseYaw + 60 wraps to baseYaw - 300
      engine.robot.reset({ x: 0, y: 0.05, z: 0, yawDegrees: baseYaw - 300 });
      expect(sensors.getYaw()).toBe(60);

      // Rotate +90 deg relative: wraps to baseYaw - 270
      engine.robot.reset({ x: 0, y: 0.05, z: 0, yawDegrees: baseYaw - 270 });
      expect(sensors.getYaw()).toBe(90);
    });

    it('seamlessly handles counter-clockwise 180-degree boundary wrap-around', async () => {
      // Robot starts at -150 deg, relative 0
      const { engine, sensors } = await createSim(-150);
      const baseYaw = engine.robot.getYawDegrees();
      expect(sensors.getYaw()).toBe(0);

      // Rotate -60 deg relative: world angle reaches -210 deg, which wraps in Rapier to +150 deg
      // baseYaw is ~ -150 deg; baseYaw - 60 wraps to baseYaw + 300
      engine.robot.reset({ x: 0, y: 0.05, z: 0, yawDegrees: baseYaw + 300 });
      expect(sensors.getYaw()).toBe(-60);

      // Rotate -90 deg relative: wraps to baseYaw + 270
      engine.robot.reset({ x: 0, y: 0.05, z: 0, yawDegrees: baseYaw + 270 });
      expect(sensors.getYaw()).toBe(-90);
    });

    it('dynamically tracks gyro yaw during active physical point-turn in physics engine', async () => {
      const { engine, sensors, runner } = await createSim(90);
      expect(sensors.getYaw()).toBe(0);

      // Run physical turn using MotorPair('E', 'F')
      const interval = setInterval(() => engine.update(1 / 60), 16);
      try {
        const script = `
from spike import MotorPair
motors = MotorPair('E', 'F')
# Point turn: left motor forward, right motor backward
motors.move_tank(180, 'degrees', 40, -40)
motors.stop()
`;
        await runner.execute(script);

        // Yaw should have changed significantly from 0
        const finalYaw = sensors.getYaw();
        console.log(`[CHALLENGE M4 PHYSICAL TURN] finalYaw=${finalYaw}°`);
        expect(Math.abs(finalYaw)).toBeGreaterThan(20);
      } finally {
        clearInterval(interval);
      }
    });
  });

  describe('Challenge 3: resetYaw() Dynamic Recalibration at Arbitrary Orientations', () => {
    it('correctly zeroes yaw at arbitrary intermediate orientations during a mission', async () => {
      const { engine, sensors } = await createSim(90);
      const baseYaw = engine.robot.getYawDegrees();
      expect(sensors.getYaw()).toBe(0);

      // Phase 1: Turn +45 deg
      engine.robot.reset({ x: 0, y: 0.05, z: 0, yawDegrees: baseYaw + 45 });
      expect(sensors.getYaw()).toBe(45);

      // Phase 2: Recalibrate yaw to 0 at this new orientation
      sensors.resetYaw();
      expect(sensors.getYaw()).toBe(0);

      // Phase 3: Further turn +25 deg from recalibrated baseline (baseYaw + 70)
      engine.robot.reset({ x: 0, y: 0.05, z: 0, yawDegrees: baseYaw + 70 });
      expect(sensors.getYaw()).toBe(25);

      // Phase 4: Turn opposite direction -50 deg (baseYaw + 20)
      engine.robot.reset({ x: 0, y: 0.05, z: 0, yawDegrees: baseYaw + 20 });
      expect(sensors.getYaw()).toBe(-25);

      // Phase 5: Recalibrate again
      sensors.resetYaw();
      expect(sensors.getYaw()).toBe(0);
    });

    it('recalibrates accurately near wrap-around boundaries (-180 / +180)', async () => {
      const { engine, sensors } = await createSim(179);
      expect(sensors.getYaw()).toBe(0);

      // Cross boundary to -179
      engine.robot.reset({ x: 0, y: 0.05, z: 0, yawDegrees: -179 });
      expect(sensors.getYaw()).toBeCloseTo(2, 0);

      // Reset baseline at -179
      sensors.resetYaw();
      expect(sensors.getYaw()).toBe(0);

      // Turn +10 deg to -169
      engine.robot.reset({ x: 0, y: 0.05, z: 0, yawDegrees: -169 });
      expect(sensors.getYaw()).toBe(10);
    });
  });

  describe('Challenge 4: Python Runtime MotionSensor Integration', () => {
    it('exposes calibrated yaw angle 0 to Python scripts via hub.motion_sensor', async () => {
      const { runner, sensors } = await createSim(90);

      const script = `
from spike import PrimeHub
hub = PrimeHub()
initial_yaw = hub.motion_sensor.get_yaw_angle()
`;
      await runner.execute(script);
      expect(sensors.getYaw()).toBe(0);
    });

    it('allows Python scripts to reset yaw angle dynamically', async () => {
      const { engine, runner, sensors } = await createSim(90);
      const baseYaw = engine.robot.getYawDegrees();

      // Rotate robot +55 deg
      engine.robot.reset({ x: 0, y: 0.05, z: 0, yawDegrees: baseYaw + 55 });
      expect(sensors.getYaw()).toBe(55);

      const script = `
from spike import PrimeHub
hub = PrimeHub()
hub.motion_sensor.reset_yaw_angle()
`;
      await runner.execute(script);
      expect(sensors.getYaw()).toBe(0);

      // Further rotation reflects new baseline (+25 deg beyond +55)
      engine.robot.reset({ x: 0, y: 0.05, z: 0, yawDegrees: baseYaw + 80 });
      expect(sensors.getYaw()).toBe(25);
    });
  });

  describe('Challenge 5: Telemetry Distinction (World Yaw vs Gyro Calibrated Yaw)', () => {
    it('verifies world heading and gyro heading are cleanly differentiated', async () => {
      const { engine, sensors } = await createSim(90);

      // World yaw is ~90 degrees (East)
      const worldYaw = engine.robot.getYawDegrees();
      // Calibrated gyro yaw is 0 degrees (relative forward)
      const gyroYaw = sensors.getYaw();

      expect(Math.abs(worldYaw - 90)).toBeLessThan(1.0);
      expect(gyroYaw).toBe(0);
      expect(worldYaw).not.toBe(gyroYaw);

      // After a turn of +45 deg:
      const baseYaw = worldYaw;
      engine.robot.reset({ x: 0, y: 0.05, z: 0, yawDegrees: baseYaw + 45 });
      expect(Math.abs(engine.robot.getYawDegrees() - (baseYaw + 45))).toBeLessThan(0.1);
      expect(sensors.getYaw()).toBe(45);
    });
  });
});
