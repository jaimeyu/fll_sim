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

    // Step physics for 1 second
    for (let i = 0; i < 60; i++) {
      engine.update(1 / 60);
    }

    const newPos = engine.robot.getPosition();
    const distanceMoved = Math.hypot(newPos.x - initialPos.x, newPos.z - initialPos.z);
    expect(distanceMoved).toBeGreaterThan(0.02); // Moved at least 2cm
  });
});
