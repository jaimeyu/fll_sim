import { describe, it, expect } from 'vitest';
import { SimulationPhysicsEngine } from '../src/physics/engine';
import { VirtualSensorManager } from '../src/sensors/sensor-manager';

describe('Manual Driver Mode & Motor Controls', () => {
  it('initializes all standard SPIKE Prime motor ports (A-F) on RobotPhysicsBody', async () => {
    const engine = new SimulationPhysicsEngine();
    await engine.init();

    const robot = engine.robot;
    expect(robot).toBeDefined();

    const ports = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
    for (const p of ports) {
      expect(robot.motors.has(p)).toBe(true);
      expect(robot.motors.get(p)).toBeDefined();
    }
  });

  it('controls drivebase via setDriveSpeeds and auxiliary motors via setMotorSpeed', async () => {
    const engine = new SimulationPhysicsEngine();
    await engine.init();

    const robot = engine.robot;

    // 1. Drive base forward (WASD W)
    robot.setDriveSpeeds(60, 60);
    expect(robot.motors.get('A')?.targetSpeedDegPerSec).toBeGreaterThan(0);
    expect(robot.motors.get('B')?.targetSpeedDegPerSec).toBeGreaterThan(0);

    // Step physics and check encoder degree accumulation
    robot.updateMotors(0.1);
    expect(robot.motors.get('A')?.degrees).toBeGreaterThan(0);
    expect(robot.motors.get('B')?.degrees).toBeGreaterThan(0);

    // 2. Drive base turn (WASD A)
    robot.setDriveSpeeds(-50, 50);
    expect(robot.motors.get('A')?.targetSpeedDegPerSec).toBeLessThan(0);
    expect(robot.motors.get('B')?.targetSpeedDegPerSec).toBeGreaterThan(0);

    // 3. Stop drive base (WASD Space / release)
    robot.setDriveSpeeds(0, 0);
    expect(robot.motors.get('A')?.targetSpeedDegPerSec).toBe(0);
    expect(robot.motors.get('B')?.targetSpeedDegPerSec).toBe(0);

    // 4. Auxiliary motor controls (Keys UIOP / JKL;)
    // Port C forward (Key O)
    robot.setMotorSpeed('C', 75);
    expect(robot.motors.get('C')?.targetSpeedDegPerSec).toBeGreaterThan(0);
    robot.updateMotors(0.1);
    expect(robot.motors.get('C')?.degrees).toBeGreaterThan(0);

    // Port C reverse (Key L)
    robot.setMotorSpeed('C', -75);
    expect(robot.motors.get('C')?.targetSpeedDegPerSec).toBeLessThan(0);

    // Stop motor C
    robot.stopMotor('C');
    expect(robot.motors.get('C')?.targetSpeedDegPerSec).toBe(0);

    // Port D forward (Key P) & Port D reverse (Key ;)
    robot.setMotorSpeed('D', 80);
    expect(robot.motors.get('D')?.targetSpeedDegPerSec).toBeGreaterThan(0);
    robot.stopMotor('D');
    expect(robot.motors.get('D')?.targetSpeedDegPerSec).toBe(0);
  });

  it('samples sensors and resets gyro heading for live dashboard telemetry', async () => {
    const engine = new SimulationPhysicsEngine();
    await engine.init();

    const sensors = new VirtualSensorManager(engine.robot);

    // Reset Gyro heading to calibrate/zero
    sensors.resetYaw();
    expect(sensors.getYaw()).toBe(0);

    // Test color sensor sampling (C and D)
    const readingC = sensors.sampleColorSensor('C');
    expect(readingC.port).toBe('C');
    expect(readingC.reflectedLight).toBeGreaterThanOrEqual(0);
    expect(readingC.reflectedLight).toBeLessThanOrEqual(100);
    expect(readingC.rgb).toHaveLength(3);

    const readingD = sensors.sampleColorSensor('D');
    expect(readingD.port).toBe('D');
    expect(readingD.reflectedLight).toBeGreaterThanOrEqual(0);
    expect(readingD.reflectedLight).toBeLessThanOrEqual(100);

    // Distance sensor
    const distCm = sensors.sampleDistanceSensor();
    expect(distCm).toBeGreaterThan(0);

    // Reset gyro yaw
    sensors.resetYaw();
    expect(sensors.getYaw()).toBe(0);
  });

  it('reliably returns all motors to zero speed when stopped without torque oscillation', async () => {
    const engine = new SimulationPhysicsEngine();
    await engine.init();

    const robot = engine.robot;

    // Run forward for a few ticks
    robot.setDriveSpeeds(80, 80);
    for (let i = 0; i < 5; i++) {
      engine.update(1 / 60);
    }
    expect(robot.motors.get('A')?.velocityDegPerSec).toBeGreaterThan(0);
    expect(robot.motors.get('B')?.velocityDegPerSec).toBeGreaterThan(0);

    // Stop drivebase
    robot.setDriveSpeeds(0, 0);
    expect(robot.motors.get('A')?.targetSpeedDegPerSec).toBe(0);
    expect(robot.motors.get('B')?.targetSpeedDegPerSec).toBe(0);
    expect(robot.motors.get('A')?.velocityDegPerSec).toBe(0);
    expect(robot.motors.get('B')?.velocityDegPerSec).toBe(0);

    // Step physics when idle and ensure motors remain at 0 speed and stable
    for (let i = 0; i < 10; i++) {
      engine.update(1 / 60);
      expect(robot.motors.get('A')?.targetSpeedDegPerSec).toBe(0);
      expect(robot.motors.get('B')?.targetSpeedDegPerSec).toBe(0);
      expect(robot.motors.get('A')?.velocityDegPerSec).toBe(0);
      expect(robot.motors.get('B')?.velocityDegPerSec).toBe(0);
    }

    // Verify stopAllMotors
    robot.setMotorSpeed('C', 60);
    robot.setMotorSpeed('D', -40);
    robot.stopAllMotors();
    expect(robot.motors.get('C')?.targetSpeedDegPerSec).toBe(0);
    expect(robot.motors.get('D')?.targetSpeedDegPerSec).toBe(0);
    expect(robot.motors.get('C')?.velocityDegPerSec).toBe(0);
    expect(robot.motors.get('D')?.velocityDegPerSec).toBe(0);
  });
});
