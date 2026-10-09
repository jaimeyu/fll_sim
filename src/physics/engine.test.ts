import { describe, it, expect } from 'vitest';
import { SimulationPhysicsEngine } from './engine';

describe('SimulationPhysicsEngine Integration', () => {
  it('initializes arena and robot, drops and settles stably on the mat', async () => {
    const engine = new SimulationPhysicsEngine();
    await engine.init();

    // Step physics for 1 second (60 steps)
    for (let i = 0; i < 60; i++) {
      engine.update(1 / 60);
    }

    const pos = engine.robot.getPosition();
    // Robot should be stably resting on mat (Y around 0.035m)
    expect(pos.y).toBeGreaterThan(0.02);
    expect(pos.y).toBeLessThan(0.06);
  });

  it('drives robot forward when motors are activated', async () => {
    const engine = new SimulationPhysicsEngine();
    await engine.init();

    // Settle first
    for (let i = 0; i < 30; i++) engine.update(1 / 60);

    const initialPos = engine.robot.getPosition();

    // Activate motors A and B forward at 50% speed
    const motorA = engine.robot.motors.get('A');
    const motorB = engine.robot.motors.get('B');
    expect(motorA).toBeDefined();
    expect(motorB).toBeDefined();

    motorA?.start(50);
    motorB?.start(50);

    // Step physics for 1 second (60 steps)
    for (let i = 0; i < 60; i++) {
      engine.update(1 / 60);
    }
    const newPos = engine.robot.getPosition();
    const distanceMoved = Math.hypot(newPos.x - initialPos.x, newPos.z - initialPos.z);
    expect(distanceMoved).toBeGreaterThan(0.02); // Moved at least 2cm
  });

  it('remains perfectly still without bouncing during idle', async () => {
    const engine = new SimulationPhysicsEngine();
    await engine.init();

    // Allow robot to settle on the mat for 40 steps (~0.67s)
    for (let i = 0; i < 40; i++) {
      engine.update(1 / 60);
    }

    const initialY = engine.robot.getPosition().y;

    // Run 60 steps (1 full second) of idle simulation
    for (let i = 0; i < 60; i++) {
      engine.update(1 / 60);
      const vy = Math.abs(engine.robot.chassisBody.linvel().y);
      const angvel = engine.robot.chassisBody.angvel();
      const angSpeed = Math.hypot(angvel.x, angvel.y, angvel.z);

      // Must have practically zero vertical bouncing velocity
      expect(vy).toBeLessThan(0.005);
      // Must have zero angular jitter/wobble
      expect(angSpeed).toBeLessThan(0.05);
    }

    const finalY = engine.robot.getPosition().y;
    // Total vertical drift over 1 second of idle must be less than 0.5 mm
    expect(Math.abs(finalY - initialY)).toBeLessThan(0.0005);
  });

  it('resets robot pose and velocities cleanly with all wheels synchronized', async () => {
    const engine = new SimulationPhysicsEngine();
    await engine.init();

    // Settle and drive forward
    for (let i = 0; i < 30; i++) engine.update(1 / 60);
    engine.robot.motors.get('A')?.start(50);
    engine.robot.motors.get('B')?.start(50);
    for (let i = 0; i < 30; i++) engine.update(1 / 60);

    // Reset robot back to start pose
    engine.resetRobot({ x: -0.5, y: 0.035, z: 0.2, yawDegrees: 0 });

    const pos = engine.robot.getPosition();
    expect(pos.x).toBeCloseTo(-0.5, 3);
    expect(pos.y).toBeCloseTo(0.035, 3);
    expect(pos.z).toBeCloseTo(0.2, 3);

    // Chassis and wheels should have zero velocity
    const linvel = engine.robot.chassisBody.linvel();
    expect(Math.hypot(linvel.x, linvel.y, linvel.z)).toBe(0);

    for (const wheelBody of engine.robot.wheelBodies.values()) {
      const wLinvel = wheelBody.linvel();
      expect(Math.hypot(wLinvel.x, wLinvel.y, wLinvel.z)).toBe(0);
    }
  });
});
