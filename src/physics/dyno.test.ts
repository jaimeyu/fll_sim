import { describe, it, expect } from 'vitest';
import { SimulationPhysicsEngine } from './engine';

describe('Robot Stationary / Attachment Dyno Jig Mode', () => {
  it('pins chassis in place while motors and wheels freely actuate', async () => {
    const engine = new SimulationPhysicsEngine();
    await engine.init();

    // Settle robot
    for (let i = 0; i < 30; i++) engine.update(1 / 60);

    const initialPos = engine.robot.getPosition();

    // Enable Stationary Dyno Mode
    engine.setRobotStationary(true);
    expect(engine.getIsRobotStationary()).toBe(true);

    // Spin drive motors
    const motorA = engine.robot.motors.get('A');
    const motorB = engine.robot.motors.get('B');
    motorA?.start(50);
    motorB?.start(50);

    // Step physics for 60 steps (1 full second)
    for (let i = 0; i < 60; i++) {
      engine.update(1 / 60);
    }

    const dynoPos = engine.robot.getPosition();

    // Chassis must NOT move at all
    expect(Math.abs(dynoPos.x - initialPos.x)).toBeLessThan(0.001);
    expect(Math.abs(dynoPos.z - initialPos.z)).toBeLessThan(0.001);

    // Motors must have advanced in rotation
    expect(motorA?.degrees).toBeGreaterThan(100);
    expect(motorB?.degrees).toBeGreaterThan(100);

    // Wheels must have non-zero rotational velocity
    for (const wheel of engine.robot.wheelBodies.values()) {
      const angvel = wheel.angvel();
      const angSpeed = Math.hypot(angvel.x, angvel.y, angvel.z);
      expect(angSpeed).toBeGreaterThan(1.0);
    }

    // Now disable Dyno Mode
    engine.setRobotStationary(false);
    expect(engine.getIsRobotStationary()).toBe(false);

    // Step physics: now the robot should drive across the floor!
    for (let i = 0; i < 60; i++) {
      engine.update(1 / 60);
    }

    const releasedPos = engine.robot.getPosition();
    const distanceTraveled = Math.hypot(releasedPos.x - dynoPos.x, releasedPos.z - dynoPos.z);
    expect(distanceTraveled).toBeGreaterThan(0.05); // Traveled at least 5cm
  });
});
