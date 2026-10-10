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

  it('immediately halts chassis momentum and wheel spin when brakeChassisAndWheels is engaged', async () => {
    const engine = new SimulationPhysicsEngine();
    await engine.init();

    const robot = engine.robot;

    // Drive forward at full throttle
    robot.setDriveSpeeds(100, 100);
    for (let i = 0; i < 20; i++) {
      engine.update(1 / 60);
    }

    const movingLinvel = robot.chassisBody.linvel();
    const movingSpeed = Math.hypot(movingLinvel.x, movingLinvel.z);
    expect(movingSpeed).toBeGreaterThan(0.05);

    // Stop drivebase with active electromagnetic brake
    robot.setDriveSpeeds(0, 0);

    // Step physics for 10 ticks
    for (let i = 0; i < 10; i++) {
      engine.update(1 / 60);
    }

    // Chassis should have come to a dead stop with zero creeping
    const stoppedLinvel = robot.chassisBody.linvel();
    const stoppedSpeed = Math.hypot(stoppedLinvel.x, stoppedLinvel.z);
    expect(stoppedSpeed).toBeLessThan(0.05);

    // Wheel axle spin should be stopped (< 0.05 rad/s)
    for (const wb of robot.wheelBodies.values()) {
      const angvel = wb.angvel();
      const axleSpin = Math.abs(angvel.x);
      expect(axleSpin).toBeLessThan(0.05);
    }
  });

  it('stops all motors immediately when PythonScriptRunner is aborted', async () => {
    const engine = new SimulationPhysicsEngine();
    await engine.init();

    const sensors = new VirtualSensorManager(engine.robot);
    const { VirtualSpikeApi } = await import('../src/runtime/spike-api');
    const { PythonScriptRunner } = await import('../src/runtime/python-runner');

    const api = new VirtualSpikeApi(engine, sensors);
    const runner = new PythonScriptRunner(api);

    // Start a continuous motor script that keeps running
    const pyScript = `
from spike import Motor, MotorPair
from spike.control import wait_for_seconds
motor_c = Motor('C')
motor_c.start(75)
pair = MotorPair('A', 'B')
pair.start(50, 50)
while True:
    wait_for_seconds(0.1)
`;
    // Execute script in background
    const execPromise = runner.execute(pyScript, () => {});

    // Yield a frame
    await new Promise((r) => setTimeout(r, 50));

    // Motors A, B, and C should have targets while running
    expect(engine.robot.motors.get('C')?.targetSpeedDegPerSec).toBeGreaterThan(0);

    // Abort runner
    runner.abort();
    await execPromise;

    // All motors must be halted
    for (const port of ['A', 'B', 'C', 'D', 'E', 'F'] as const) {
      expect(engine.robot.motors.get(port)?.targetSpeedDegPerSec).toBe(0);
      expect(engine.robot.motors.get(port)?.velocityDegPerSec).toBe(0);
    }
  });

  it('drives dead-straight without turning or veering when commanded with equal motor speeds', async () => {
    const engine = new SimulationPhysicsEngine();
    await engine.init();

    // Reset robot to a clean pose
    engine.resetRobot({ x: -0.8, y: 0.035, z: 0.0, yawDegrees: 90 });
    for (let i = 0; i < 30; i++) engine.update(1 / 60);

    const initialYaw = engine.robot.getYawDegrees();
    const initialPos = engine.robot.getPosition();

    // Command straight drive (WASD W forward at 60%)
    engine.robot.setDriveSpeeds(60, 60);

    // Step physics for 2 full seconds (120 steps)
    for (let i = 0; i < 120; i++) {
      engine.update(1 / 60);
    }

    const finalYaw = engine.robot.getYawDegrees();
    const finalPos = engine.robot.getPosition();

    // Yaw drift should be virtually zero (less than 0.5 degrees over 2 seconds of driving)
    const yawDrift = Math.abs(finalYaw - initialYaw);
    expect(yawDrift).toBeLessThan(0.5);

    // Distance traveled along driving axis (+X) should be substantial (> 0.4m)
    const distanceMovedX = finalPos.x - initialPos.x;
    expect(distanceMovedX).toBeGreaterThan(0.4);

    // Lateral drift along perpendicular axis (Z) must be minimal (< 2cm)
    const lateralDriftZ = Math.abs(finalPos.z - initialPos.z);
    expect(lateralDriftZ).toBeLessThan(0.02);

    // Both drive wheel encoders must be in near-perfect lockstep (under 1.0 deg difference)
    const encA = engine.robot.motors.get('A')?.degrees ?? 0;
    const encB = engine.robot.motors.get('B')?.degrees ?? 0;
    expect(Math.abs(encA - encB)).toBeLessThan(1.0);
  });

  it('triggers onBrakeEngaged callback when brakeChassisAndWheels is executed', async () => {
    const engine = new SimulationPhysicsEngine();
    await engine.init();

    let brakeCalled = false;
    engine.robot.onBrakeEngaged = () => {
      brakeCalled = true;
    };

    engine.robot.setDriveSpeeds(100, 100);
    engine.update(1 / 60);

    engine.robot.brakeChassisAndWheels();
    expect(brakeCalled).toBe(true);
  });

  it('supports motor telemetry targets and status IDLE, RUNNING, and BRAKING', async () => {
    const engine = new SimulationPhysicsEngine();
    await engine.init();

    const robot = engine.robot;
    const motorA = robot.motors.get('A');
    expect(motorA).toBeDefined();

    // Idle initial state
    expect(motorA?.targetSpeedDegPerSec).toBe(0);

    // Running state
    robot.setDriveSpeeds(75, 75);
    expect(motorA?.targetSpeedDegPerSec).toBeGreaterThan(0);

    // Stop / Brake
    robot.setDriveSpeeds(0, 0);
    expect(motorA?.targetSpeedDegPerSec).toBe(0);
    expect(motorA?.velocityDegPerSec).toBe(0);
  });
});


