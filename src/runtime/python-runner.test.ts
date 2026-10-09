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

  it('transpiles and syntax-validates all SAMPLE_MISSIONS without syntax errors', async () => {
    const { SAMPLE_MISSIONS } = await import('../ui/hud');
    for (const [key, mission] of Object.entries(SAMPLE_MISSIONS)) {
      const js = PythonScriptRunner.transpilePythonToJs(mission.code);
      try {
        new Function(
          'PrimeHub',
          'Motor',
          'MotorPair',
          'ColorSensor',
          'DistanceSensor',
          'wait_for_seconds',
          'time',
          '__yield',
          'console',
          `return (async () => {\n${js}\n})();`
        );
      } catch (e) {
        console.error(`Failed mission: ${key}\nTranspiled JS:\n${js}\nError:`, e);
        throw e;
      }
    }
  });

  it('correctly transpiles Python ternary expressions', () => {
    const py = `spd = 15 if light > 30 else 0`;
    const js = PythonScriptRunner.transpilePythonToJs(py);
    expect(js).toContain('spd = (light > 30) ? (15) : (0);');
  });

  it('executes Gyro 90-degree turn mission accurately', async () => {
    const engine = new SimulationPhysicsEngine();
    await engine.init();
    const sensors = new VirtualSensorManager(engine.robot);
    const api = new VirtualSpikeApi(engine, sensors);
    const runner = new PythonScriptRunner(api);

    const timer = setInterval(() => {
      engine.update(1 / 60);
    }, 16);

    try {
      const { SAMPLE_MISSIONS } = await import('../ui/hud');
      await runner.execute(SAMPLE_MISSIONS.gyro_turn.code);
      const finalYaw = sensors.getYaw();
      expect(finalYaw).toBeGreaterThanOrEqual(85);
      expect(finalYaw).toBeLessThanOrEqual(105);
    } finally {
      clearInterval(timer);
    }
  }, 10000);

  it('supports from spike.control import Timer and keyword argument start()', async () => {
    const engine = new SimulationPhysicsEngine();
    await engine.init();
    const sensors = new VirtualSensorManager(engine.robot);
    const api = new VirtualSpikeApi(engine, sensors);
    const runner = new PythonScriptRunner(api);

    const userScript = `
from spike import MotorPair, ColorSensor
from spike.control import Timer

# 1. Initialize hardware (Adjust ports to match your robot)
# Left motor on E, Right motor on F
drive_base = MotorPair('E', 'F') 
# Left color sensor on C, Right color sensor on D
sensor_left = ColorSensor('C')   
sensor_right = ColorSensor('D')  

# 2. Configuration Parameters
BASE_SPEED = 30
KP = 0.6

# 3. Execution Timer
timer = Timer()
timer.reset()

# Short 0.05 second loop for test
while timer.get_time_sec() < 0.05:
    left_light = sensor_left.get_reflected_light()
    right_light = sensor_right.get_reflected_light()
    error = left_light - right_light
    steering = error * KP
    drive_base.start(steering=int(steering), speed=BASE_SPEED)

drive_base.stop()
`;

    // Should execute cleanly without throwing ReferenceError or syntax errors
    await runner.execute(userScript);
    expect(true).toBe(true);
  });
});
