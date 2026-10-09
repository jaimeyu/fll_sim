import { describe, it, expect } from 'vitest';
import { PythonScriptRunner } from './python-runner';
import { SimulationPhysicsEngine } from '../physics/engine';
import { VirtualSensorManager } from '../sensors/sensor-manager';
import { VirtualSpikeApi } from './spike-api';

describe('PythonScriptRunner & Virtual SPIKE Runtime', () => {
  it('correctly transpiles standard SPIKE Python loops and calls to async JS', () => {
    const pythonCode = `
from spike import PrimeHub, MotorPair
hub = PrimeHub()
motors = MotorPair('A', 'B')

motors.move(20, 'cm')
motors.move_tank(180, 'degrees', 30, 30)

for i in range(5):
    print("Loop iteration")
    wait_for_seconds(0.1)

while hub.motion_sensor.get_yaw_angle() < 90:
    wait_for_seconds(0.05)
`;

    const js = PythonScriptRunner.transpilePythonToJs(pythonCode);

    expect(js).toContain('await motors.move(20, \'cm\')');
    expect(js).toContain('await motors.move_tank(180, \'degrees\', 30, 30)');
    expect(js).toContain('for (let i = 0; i < 5; i += 1)');
    expect(js).toContain('while (hub.motion_sensor.get_yaw_angle() < 90)');
    expect(js).toContain('await wait_for_seconds(0.1)');
  });

  it('executes a Python script driving the simulated robot', async () => {
    const engine = new SimulationPhysicsEngine();
    await engine.init();
    const sensors = new VirtualSensorManager(engine.robot);
    const api = new VirtualSpikeApi(engine, sensors);
    const runner = new PythonScriptRunner(api);

    // Keep physics updating in background
    const timer = setInterval(() => {
      engine.update(1 / 60);
    }, 16);

    try {
      const script = `
motors = MotorPair('A', 'B')
motors.start_tank(50, 50)
wait_for_seconds(0.1)
motors.stop()
`;
      await runner.execute(script);

      const pos = engine.robot.getPosition();
      expect(pos).toBeDefined();
    } finally {
      clearInterval(timer);
    }
  });
});
