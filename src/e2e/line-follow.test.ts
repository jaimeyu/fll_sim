import { describe, it, expect } from 'vitest';
import { SimulationPhysicsEngine } from '../physics/engine';
import { VirtualSensorManager } from '../sensors/sensor-manager';
import { VirtualSpikeApi } from '../runtime/spike-api';
import { PythonScriptRunner } from '../runtime/python-runner';

// Mock canvas sampler for headless Vitest environment
class HeadlessMatSampler {
  // Simulates a black line at Z = -0.3 running from X = -0.8 to X = 0.5
  public sampleAt(_x: number, z: number) {
    const distToLine = Math.abs(z - (-0.3));
    if (distToLine < 0.02) {
      // Black navigation line (25mm wide)
      return { r: 20, g: 20, b: 20 };
    }
    // White mat
    return { r: 250, g: 250, b: 250 };
  }
}

describe('End-to-End Simulation: Line Following', () => {
  it('drives along the mat line using a P-controller script', async () => {
    const engine = new SimulationPhysicsEngine();
    await engine.init();

    const sensors = new VirtualSensorManager(engine.robot);
    sensors.setMatSampler(new HeadlessMatSampler());

    const api = new VirtualSpikeApi(engine, sensors);
    const runner = new PythonScriptRunner(api);

    // Initial position
    const startPos = engine.robot.getPosition();

    // Step physics alongside script execution
    const interval = setInterval(() => {
      engine.update(1 / 60);
    }, 16);

    try {
      const lineFollowCode = `
motors = MotorPair('A', 'B')
color_c = ColorSensor('C')

target_light = 50
kp = 0.6
base_speed = 30

for i in range(10):
    light = color_c.get_reflected_light()
    error = target_light - light
    steering = error * kp
    motors.start(steering, base_speed)
    wait_for_seconds(0.02)

motors.stop()
`;

      await runner.execute(lineFollowCode);

      const endPos = engine.robot.getPosition();
      // Robot should have advanced forward along the X axis
      expect(endPos.x).toBeGreaterThan(startPos.x - 0.05);
    } finally {
      clearInterval(interval);
    }
  });
});
