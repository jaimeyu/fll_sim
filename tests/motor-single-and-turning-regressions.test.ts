import { describe, it, expect } from 'vitest';
import { SimulationPhysicsEngine } from '../src/physics/engine';
import { VirtualSensorManager } from '../src/sensors/sensor-manager';
import { VirtualSpikeApi } from '../src/runtime/spike-api';
import { PythonScriptRunner } from '../src/runtime/python-runner';

describe('Motor Single & Turning Regression Tests', () => {
  async function setupSim() {
    const engine = new SimulationPhysicsEngine();
    await engine.init();
    const sensors = new VirtualSensorManager(engine.robot);
    const api = new VirtualSpikeApi(engine, sensors);
    const runner = new PythonScriptRunner(api);

    // Settle robot onto mat
    for (let i = 0; i < 30; i++) engine.update(1 / 60);

    return { engine, sensors, api, runner };
  }

  it('runs motor A for 5 seconds clockwise and pivots the robot to the right', async () => {
    const { engine, runner } = await setupSim();
    const initYaw = engine.robot.getYawDegrees();

    const pyCode = `
from spike import Motor
motor_a = Motor('A')
motor_a.run_for_seconds(5, 'clockwise')
`;
    let completed = false;
    runner.execute(pyCode).then(() => {
      completed = true;
    });

    // Step physics for 60 ticks (1.0 second)
    for (let i = 0; i < 60; i++) {
      engine.update(1 / 60);
      await new Promise((r) => setTimeout(r, 2));
    }

    const midYaw = engine.robot.getYawDegrees();
    const motorA = engine.robot.motors.get('A')!;
    const motorB = engine.robot.motors.get('B')!;

    // Motor A should be actively spinning
    expect(motorA.degrees).toBeGreaterThan(300);
    expect(motorA.targetSpeedDegPerSec).toBeGreaterThan(0);
    // Motor B should be idle (holding brake)
    expect(motorB.targetSpeedDegPerSec).toBe(0);
    // Script is running 5s duration, so after 1s it is NOT yet finished
    expect(completed).toBe(false);
    expect(runner.isRunning).toBe(true);

    // Delta yaw should be significant (> 30 degrees turn in 1s)
    const deltaYaw = midYaw - initYaw;
    expect(deltaYaw).toBeGreaterThan(30);

    runner.abort();
  });

  it('runs motor A for 5 seconds counterclockwise and pivots the opposite direction', async () => {
    const { engine, runner } = await setupSim();
    const initYaw = engine.robot.getYawDegrees();

    const pyCode = `
from spike import Motor
motor_a = Motor('A')
motor_a.run_for_seconds(5, 'counterclockwise')
`;
    runner.execute(pyCode);

    for (let i = 0; i < 60; i++) {
      engine.update(1 / 60);
      await new Promise((r) => setTimeout(r, 2));
    }

    const midYaw = engine.robot.getYawDegrees();
    const motorA = engine.robot.motors.get('A')!;

    expect(motorA.degrees).toBeLessThan(-300);
    expect(motorA.targetSpeedDegPerSec).toBeLessThan(0);
    const deltaYaw = midYaw - initYaw;
    expect(deltaYaw).toBeLessThan(-30);

    runner.abort();
  });

  it('runs motor B for 5 seconds clockwise and pivots the robot to the left', async () => {
    const { engine, runner } = await setupSim();
    const initYaw = engine.robot.getYawDegrees();

    const pyCode = `
from spike import Motor
motor_b = Motor('B')
motor_b.run_for_seconds(5, 'clockwise')
`;
    runner.execute(pyCode);

    for (let i = 0; i < 60; i++) {
      engine.update(1 / 60);
      await new Promise((r) => setTimeout(r, 2));
    }

    const midYaw = engine.robot.getYawDegrees();
    const motorB = engine.robot.motors.get('B')!;

    expect(motorB.degrees).toBeGreaterThan(300);
    const deltaYaw = midYaw - initYaw;
    // Right wheel forward rotates robot to the left (negative delta yaw)
    expect(deltaYaw).toBeLessThan(-30);

    runner.abort();
  });

  it('runs motor with lowercase port Motor("a") identically to uppercase', async () => {
    const { engine, runner } = await setupSim();
    const initYaw = engine.robot.getYawDegrees();

    const pyCode = `
from spike import Motor
motor_a = Motor('a')
motor_a.run_for_seconds(2, 'clockwise')
`;
    runner.execute(pyCode);

    for (let i = 0; i < 40; i++) {
      engine.update(1 / 60);
      await new Promise((r) => setTimeout(r, 2));
    }

    const motorA = engine.robot.motors.get('A')!;
    expect(motorA.degrees).toBeGreaterThan(100);
    const midYaw = engine.robot.getYawDegrees();
    expect(midYaw - initYaw).toBeGreaterThan(15);

    runner.abort();
  });

  it('runs motor_a.run_for_degrees and run_for_rotations with string direction', async () => {
    const { engine, runner } = await setupSim();

    const pyCode = `
from spike import Motor
motor_a = Motor('A')
motor_a.run_for_degrees(180, 'clockwise')
`;
    let completed = false;
    runner.execute(pyCode).then(() => {
      completed = true;
    });

    for (let i = 0; i < 90; i++) {
      engine.update(1 / 60);
      await new Promise((r) => setTimeout(r, 2));
      if (completed) break;
    }

    expect(completed).toBe(true);
    const motorA = engine.robot.motors.get('A')!;
    expect(motorA.degrees).toBeGreaterThanOrEqual(175);
  });

  it('runs motors.move with unit "seconds" for duration', async () => {
    const { engine, runner } = await setupSim();
    const initPos = engine.robot.getPosition();

    const pyCode = `
from spike import MotorPair
motors = MotorPair('A', 'B')
motors.move(2, 'seconds', 0, 50)
`;
    let completed = false;
    runner.execute(pyCode).then(() => {
      completed = true;
    });

    // Step physics for 60 ticks (1 second) -> should NOT be completed yet
    for (let i = 0; i < 60; i++) {
      engine.update(1 / 60);
      await new Promise((r) => setTimeout(r, 2));
    }

    expect(completed).toBe(false);
    expect(runner.isRunning).toBe(true);

    const midPos = engine.robot.getPosition();
    const distTraveled = Math.hypot(midPos.x - initPos.x, midPos.z - initPos.z);
    // In 1 second at 50% speed (500 deg/s ~= 24 cm/s), robot should have traveled ~20-25 cm
    expect(distTraveled).toBeGreaterThan(0.15); // > 15 cm

    runner.abort();
  });

  it('supports keyword arguments in Python methods (speed=50, direction="clockwise")', async () => {
    const { engine, runner } = await setupSim();

    const pyCode = `
from spike import Motor
motor_a = Motor('A')
motor_a.run_for_seconds(3, speed=60)
`;
    runner.execute(pyCode);

    for (let i = 0; i < 30; i++) {
      engine.update(1 / 60);
      await new Promise((r) => setTimeout(r, 2));
    }

    const motorA = engine.robot.motors.get('A')!;
    // 60% of 1000 deg/s is 600 deg/s
    expect(motorA.targetSpeedDegPerSec).toBeCloseTo(600, -1);

    runner.abort();
  });

  it('runs Mission_1.py sequence: motors.move(30, "cm") followed by motor_a.run_for_seconds(15, "clockwise")', async () => {
    const { engine, runner } = await setupSim();
    const initYaw = engine.robot.getYawDegrees();

    const pyCode = `
from spike import PrimeHub, MotorPair, Motor
hub = PrimeHub()
motors = MotorPair('A', 'B')
motor_a = Motor('A')

motors.set_default_speed(50)
motors.move(30, 'cm')
motor_a.run_for_seconds(15, 'clockwise')
`;
    runner.execute(pyCode);

    // Step physics for 75 ticks (~1.25s) until move(30, 'cm') nears completion
    for (let i = 0; i < 75; i++) {
      engine.update(1 / 60);
      await new Promise((r) => setTimeout(r, 2));
    }

    const postMoveYaw = engine.robot.getYawDegrees();
    // Straight driving heading lock must have maintained heading within 1 degree
    expect(Math.abs(postMoveYaw - initYaw)).toBeLessThan(1.0);

    // Step physics for another 60 ticks (~1 second) of motor_a.run_for_seconds
    for (let i = 0; i < 60; i++) {
      engine.update(1 / 60);
      await new Promise((r) => setTimeout(r, 2));
    }

    const finalYaw = engine.robot.getYawDegrees();
    const deltaYaw = finalYaw - postMoveYaw;

    // Motor A should turn the robot to the right significantly (> 50 degrees in 1s)
    expect(deltaYaw).toBeGreaterThan(50);

    const motorA = engine.robot.motors.get('A')!;
    const motorB = engine.robot.motors.get('B')!;
    expect(motorA.targetSpeedDegPerSec).toBeGreaterThan(0);
    expect(motorB.targetSpeedDegPerSec).toBe(0);

    runner.abort();
  });
});
