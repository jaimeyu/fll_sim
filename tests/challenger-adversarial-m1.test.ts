import { describe, it, expect } from 'vitest';
import { SimulationPhysicsEngine } from '../src/physics/engine';
import { VirtualSensorManager } from '../src/sensors/sensor-manager';
import { VirtualSpikeApi } from '../src/runtime/spike-api';
import { PythonScriptRunner } from '../src/runtime/python-runner';

describe('Adversarial Challenger Suite: Milestone 1 Physics MotorPair', () => {
  // Helper to create and initialize a clean physics engine and API
  async function createSim() {
    const engine = new SimulationPhysicsEngine();
    await engine.init();
    // Settle physics
    for (let i = 0; i < 30; i++) engine.update(1 / 60);
    const sensors = new VirtualSensorManager(engine.robot);
    const api = new VirtualSpikeApi(engine, sensors);
    const runner = new PythonScriptRunner(api);
    return { engine, sensors, api, runner };
  }

  describe('Challenge 1: Physical Driving Verification Across Mat with Arbitrary Ports', () => {
    it('accurately drives forward across mat with MotorPair(E, F) measuring displacement and encoders', async () => {
      const { engine, runner } = await createSim();
      const startPos = engine.robot.getPosition();

      const interval = setInterval(() => engine.update(1 / 60), 16);
      try {
        const script = `
from spike import MotorPair
motors = MotorPair('E', 'F')
motors.move(25, 'cm')
motors.stop()
`;
        await runner.execute(script);

        const endPos = engine.robot.getPosition();
        const dx = endPos.x - startPos.x;
        const dz = endPos.z - startPos.z;
        const displacement = Math.hypot(dx, dz);

        const motorE = engine.robot.motors.get('E')!;
        const motorF = engine.robot.motors.get('F')!;
        const motorA = engine.robot.motors.get('A')!;
        const motorB = engine.robot.motors.get('B')!;

        console.log(`[CHALLENGE 1 E+F] displacement=${displacement.toFixed(4)}m, dX=${dx.toFixed(4)}m, dZ=${dz.toFixed(4)}m, degE=${motorE.degrees.toFixed(1)}, degF=${motorF.degrees.toFixed(1)}`);

        // 25 cm movement should yield approximately 0.20 - 0.27m displacement
        expect(displacement).toBeGreaterThan(0.20);
        // Default spawn yaw is 90 deg (facing East, +X)
        expect(dx).toBeGreaterThan(0.20);
        expect(Math.abs(dz)).toBeLessThan(0.04);

        // Encoders: 25cm / (pi * 5.6cm) * 360 deg ≈ 511.5 deg
        expect(motorE.degrees).toBeGreaterThan(450);
        expect(motorF.degrees).toBeGreaterThan(450);

        // Inactive ports remain strictly 0
        expect(motorA.degrees).toBe(0);
        expect(motorB.degrees).toBe(0);
      } finally {
        clearInterval(interval);
      }
    });

    it('drives forward across mat with MotorPair(C, D)', async () => {
      const { engine, runner } = await createSim();
      const startPos = engine.robot.getPosition();

      const interval = setInterval(() => engine.update(1 / 60), 16);
      try {
        const script = `
from spike import MotorPair
motors = MotorPair('C', 'D')
motors.move(15, 'cm')
motors.stop()
`;
        await runner.execute(script);

        const endPos = engine.robot.getPosition();
        const displacement = Math.hypot(endPos.x - startPos.x, endPos.z - startPos.z);
        const motorC = engine.robot.motors.get('C')!;
        const motorD = engine.robot.motors.get('D')!;

        console.log(`[CHALLENGE 1 C+D] displacement=${displacement.toFixed(4)}m, degC=${motorC.degrees.toFixed(1)}, degD=${motorD.degrees.toFixed(1)}`);

        expect(displacement).toBeGreaterThan(0.12);
        expect(motorC.degrees).toBeGreaterThan(250);
        expect(motorD.degrees).toBeGreaterThan(250);
      } finally {
        clearInterval(interval);
      }
    });

    it('drives forward with asymmetric port pair MotorPair(A, D)', async () => {
      const { engine, runner } = await createSim();
      const startPos = engine.robot.getPosition();

      const interval = setInterval(() => engine.update(1 / 60), 16);
      try {
        const script = `
from spike import MotorPair
motors = MotorPair('A', 'D')
motors.move(10, 'cm')
motors.stop()
`;
        await runner.execute(script);

        const endPos = engine.robot.getPosition();
        const displacement = Math.hypot(endPos.x - startPos.x, endPos.z - startPos.z);
        const motorA = engine.robot.motors.get('A')!;
        const motorD = engine.robot.motors.get('D')!;

        console.log(`[CHALLENGE 1 A+D] displacement=${displacement.toFixed(4)}m, degA=${motorA.degrees.toFixed(1)}, degD=${motorD.degrees.toFixed(1)}`);

        expect(displacement).toBeGreaterThan(0.08);
        expect(motorA.degrees).toBeGreaterThan(180);
        expect(motorD.degrees).toBeGreaterThan(180);
      } finally {
        clearInterval(interval);
      }
    });

    it('drives with inverted port pair MotorPair(F, E) (F=left, E=right)', async () => {
      const { engine, runner } = await createSim();
      const startPos = engine.robot.getPosition();

      const interval = setInterval(() => engine.update(1 / 60), 16);
      try {
        const script = `
from spike import MotorPair
motors = MotorPair('F', 'E')
motors.move(10, 'cm')
motors.stop()
`;
        await runner.execute(script);

        expect(engine.robot.driveLeftPort).toBe('F');
        expect(engine.robot.driveRightPort).toBe('E');

        const endPos = engine.robot.getPosition();
        const displacement = Math.hypot(endPos.x - startPos.x, endPos.z - startPos.z);
        console.log(`[CHALLENGE 1 F+E] displacement=${displacement.toFixed(4)}m`);
        expect(displacement).toBeGreaterThan(0.08);
      } finally {
        clearInterval(interval);
      }
    });
  });

  describe('Challenge 2: Adversarial Holding Brake Stress-Testing & Auxiliary Motor Concurrency', () => {
    it('maintains active wheel drive torque and low damping when auxiliary motors A, B, C, D are violently toggled', async () => {
      const { engine, api } = await createSim();

      const motors = api.createMotorPair('E', 'F');
      motors.start(0, 60); // Steering 0, speed 60

      let maxObservedWheelDamping = 0;
      let minObservedChassisSpeed = Infinity;

      // Run 60 simulation steps while aggressively disturbing auxiliary motors
      for (let step = 0; step < 60; step++) {
        // Step physics
        engine.update(1 / 60);

        // Agitate auxiliary ports A, B, C, D
        if (step % 5 === 0) {
          engine.robot.setMotorSpeed('A', 100);
          engine.robot.setMotorSpeed('B', -100);
          engine.robot.setMotorSpeed('C', 50);
          engine.robot.setMotorSpeed('D', -50);
        } else if (step % 5 === 2) {
          engine.robot.stopMotor('A');
          engine.robot.stopMotor('C');
        } else if (step % 5 === 4) {
          engine.robot.stopMotor('B');
          engine.robot.stopMotor('D');
        }

        // Measure wheel damping
        for (const wb of engine.robot.wheelBodies.values()) {
          const damping = wb.angularDamping();
          if (damping > maxObservedWheelDamping) maxObservedWheelDamping = damping;
        }

        // After initial ramp (first 10 steps), measure linear speed
        if (step > 10) {
          const lv = engine.robot.chassisBody.linvel();
          const spd = Math.sqrt(lv.x * lv.x + lv.z * lv.z);
          if (spd < minObservedChassisSpeed) minObservedChassisSpeed = spd;
        }
      }

      console.log(`[CHALLENGE 2 CONCURRENCY] maxObservedWheelDamping=${maxObservedWheelDamping}, minObservedChassisSpeed=${minObservedChassisSpeed.toFixed(4)}m/s`);

      // Angular damping must remain around 0.2 (never clamped to 50.0)
      expect(maxObservedWheelDamping).toBeLessThan(1.0);
      // Robot chassis should remain continuously moving without stuttering to dead halt
      expect(minObservedChassisSpeed).toBeGreaterThan(0.05);

      // Now command MotorPair to STOP
      motors.stop();
      for (let step = 0; step < 15; step++) {
        engine.update(1 / 60);
      }

      // Check that holding brake engaged
      for (const wb of engine.robot.wheelBodies.values()) {
        expect(wb.angularDamping()).toBeCloseTo(50.0, 1);
      }
      expect(engine.robot.chassisBody.linearDamping()).toBeGreaterThanOrEqual(15.0);

      const stoppedLinvel = engine.robot.chassisBody.linvel();
      const stoppedSpeed = Math.sqrt(stoppedLinvel.x * stoppedLinvel.x + stoppedLinvel.z * stoppedLinvel.z);
      console.log(`[CHALLENGE 2 STOPPED] stoppedSpeed=${stoppedSpeed.toFixed(6)}m/s`);
      expect(stoppedSpeed).toBeLessThan(0.005);
    });

    it('running high-speed auxiliary motors does not unclamp parked robot wheels', async () => {
      const { engine, api } = await createSim();

      const motors = api.createMotorPair('E', 'F');
      // Robot is stopped
      motors.stop();
      for (let i = 0; i < 10; i++) engine.update(1 / 60);

      const posBefore = engine.robot.getPosition();

      // Spin all auxiliary motors at 100% speed for 40 steps
      engine.robot.setMotorSpeed('A', 100);
      engine.robot.setMotorSpeed('B', 100);
      engine.robot.setMotorSpeed('C', 100);
      engine.robot.setMotorSpeed('D', 100);

      for (let i = 0; i < 40; i++) {
        engine.update(1 / 60);
        // Wheel damping must remain locked at 50.0
        for (const wb of engine.robot.wheelBodies.values()) {
          expect(wb.angularDamping()).toBeCloseTo(50.0, 1);
        }
      }

      const posAfter = engine.robot.getPosition();
      const creepDist = Math.hypot(posAfter.x - posBefore.x, posAfter.z - posBefore.z);
      console.log(`[CHALLENGE 2 PARKED CREEP] creepDist=${creepDist.toFixed(6)}m`);
      expect(creepDist).toBeLessThan(0.001); // Less than 1mm creep
    });
  });

  describe('Challenge 3: Reverse Driving, Negative Speeds, Zero Distance, and move_tank Edge Cases', () => {
    it('drives backward across mat with negative distance move(-20, "cm")', async () => {
      const { engine, runner } = await createSim();
      const startPos = engine.robot.getPosition();

      const interval = setInterval(() => engine.update(1 / 60), 16);
      try {
        const script = `
from spike import MotorPair
motors = MotorPair('E', 'F')
motors.move(-20, 'cm')
motors.stop()
`;
        await runner.execute(script);

        const endPos = engine.robot.getPosition();
        const dx = endPos.x - startPos.x;
        const motorE = engine.robot.motors.get('E')!;
        const motorF = engine.robot.motors.get('F')!;

        console.log(`[CHALLENGE 3 REVERSE] dX=${dx.toFixed(4)}m, degE=${motorE.degrees.toFixed(1)}, degF=${motorF.degrees.toFixed(1)}`);

        // Backward displacement along facing direction (East, +X) means negative dX
        expect(dx).toBeLessThan(-0.15);
        // Encoder accumulation is negative
        expect(motorE.degrees).toBeLessThan(-300);
        expect(motorF.degrees).toBeLessThan(-300);
      } finally {
        clearInterval(interval);
      }
    });

    it('handles zero distance move(0, "cm") gracefully without hanging or drifting', async () => {
      const { engine, runner } = await createSim();
      const startPos = engine.robot.getPosition();

      const interval = setInterval(() => engine.update(1 / 60), 16);
      try {
        const script = `
from spike import MotorPair
motors = MotorPair('E', 'F')
motors.move(0, 'cm')
motors.stop()
`;
        const startTime = Date.now();
        await runner.execute(script);
        const duration = Date.now() - startTime;

        const endPos = engine.robot.getPosition();
        const dist = Math.hypot(endPos.x - startPos.x, endPos.z - startPos.z);

        console.log(`[CHALLENGE 3 ZERO-DIST] duration=${duration}ms, drift=${dist.toFixed(6)}m`);
        expect(duration).toBeLessThan(1500);
        expect(dist).toBeLessThan(0.01);
      } finally {
        clearInterval(interval);
      }
    });

    it('DEFECT REPRO: steering=100 in move(20, "cm", 100) executes a spin turn reversing right wheel', async () => {
      const { engine, runner } = await createSim();
      const startYaw = engine.robot.getYawDegrees();

      const interval = setInterval(() => engine.update(1 / 60), 16);
      try {
        const script = `
from spike import MotorPair
motors = MotorPair('E', 'F')
motors.move(20, 'cm', 100)
motors.stop()
`;
        await runner.execute(script);

        const endYaw = engine.robot.getYawDegrees();
        const motorE = engine.robot.motors.get('E')!;
        const motorF = engine.robot.motors.get('F')!;

        console.log(`[CHALLENGE 3 STEERING 100] startYaw=${startYaw.toFixed(1)}, endYaw=${endYaw.toFixed(1)}, degE=${motorE.degrees.toFixed(1)}, degF=${motorF.degrees.toFixed(1)}`);

        // Steering 100 means leftSpeed = +spd, rightSpeed = -spd
        // BUG: VirtualMotor.runForDegrees strips negative speed sign, causing right wheel to run forward (+416.7 deg)
        expect(motorF.degrees).toBeLessThan(0);
        expect(Math.abs(endYaw - startYaw)).toBeGreaterThan(20);
      } finally {
        clearInterval(interval);
      }
    });

    it('executes move_tank point turn (left=50, right=-50) measuring rotation', async () => {
      const { engine, runner } = await createSim();
      const startYaw = engine.robot.getYawDegrees();

      const interval = setInterval(() => engine.update(1 / 60), 16);
      try {
        const script = `
from spike import MotorPair
motors = MotorPair('E', 'F')
motors.move_tank(360, 'degrees', 50, -50)
motors.stop()
`;
        await runner.execute(script);

        const endYaw = engine.robot.getYawDegrees();
        const motorE = engine.robot.motors.get('E')!;
        const motorF = engine.robot.motors.get('F')!;

        console.log(`[CHALLENGE 3 POINT TURN] startYaw=${startYaw.toFixed(1)}, endYaw=${endYaw.toFixed(1)}, degE=${motorE.degrees.toFixed(1)}, degF=${motorF.degrees.toFixed(1)}`);
      } finally {
        clearInterval(interval);
      }
    });

    it('tests negative speed in move(20, "cm", 0, -50) to evaluate direction of travel', async () => {
      const { engine, runner } = await createSim();
      const startPos = engine.robot.getPosition();

      const interval = setInterval(() => engine.update(1 / 60), 16);
      try {
        const script = `
from spike import MotorPair
motors = MotorPair('E', 'F')
motors.move(20, 'cm', 0, -50)
motors.stop()
`;
        await runner.execute(script);

        const endPos = engine.robot.getPosition();
        const dx = endPos.x - startPos.x;
        const motorE = engine.robot.motors.get('E')!;
        const motorF = engine.robot.motors.get('F')!;

        console.log(`[CHALLENGE 3 NEG SPEED MOVE] dX=${dx.toFixed(4)}m, degE=${motorE.degrees.toFixed(1)}, degF=${motorF.degrees.toFixed(1)}`);
      } finally {
        clearInterval(interval);
      }
    });

    it('DEFECT REPRO: move_tank(360, "degrees", 50, -50) executes a point turn rotating yaw and reversing right wheel', async () => {
      const { engine, runner } = await createSim();
      const startYaw = engine.robot.getYawDegrees();

      const interval = setInterval(() => engine.update(1 / 60), 16);
      try {
        const script = `
from spike import MotorPair
motors = MotorPair('E', 'F')
motors.move_tank(360, 'degrees', 50, -50)
motors.stop()
`;
        await runner.execute(script);

        const endYaw = engine.robot.getYawDegrees();
        const motorE = engine.robot.motors.get('E')!;
        const motorF = engine.robot.motors.get('F')!;

        // Right wheel speed was -50%, so motor F MUST rotate in reverse (negative degrees)
        // BUG: VirtualMotor.runForDegrees strips negative speed sign, causing motor F to turn forward (+366.7 deg)
        expect(motorF.degrees).toBeLessThan(0);
        // And yaw MUST change by more than 20 degrees
        const yawDiff = Math.abs(endYaw - startYaw);
        expect(yawDiff).toBeGreaterThan(20);
      } finally {
        clearInterval(interval);
      }
    });

    it('executes start_tank with opposite speeds (left=50, right=-50)', async () => {
      const { engine, api } = await createSim();
      const startYaw = engine.robot.getYawDegrees();

      const motors = api.createMotorPair('E', 'F');
      motors.start_tank(50, -50);

      for (let i = 0; i < 30; i++) {
        engine.update(1 / 60);
      }

      const motorE = engine.robot.motors.get('E')!;
      const motorF = engine.robot.motors.get('F')!;
      const endYaw = engine.robot.getYawDegrees();

      console.log(`[CHALLENGE 3 START_TANK] startYaw=${startYaw.toFixed(1)}, endYaw=${endYaw.toFixed(1)}, degE=${motorE.degrees.toFixed(1)}, degF=${motorF.degrees.toFixed(1)}`);

      expect(motorE.degrees).toBeGreaterThan(50);
      expect(motorF.degrees).toBeLessThan(-50);
    });
  });

  describe('Challenge 4: Rapid Dynamic Port Switching & Stability', () => {
    it('switches drive ports rapidly between A/B, E/F, C/D without corrupting physics state or crashing', async () => {
      const { engine, api } = await createSim();

      const portsList: [string, string][] = [
        ['A', 'B'],
        ['E', 'F'],
        ['C', 'D'],
        ['F', 'E'],
        ['D', 'C'],
        ['B', 'A'],
      ];

      for (const [pL, pR] of portsList) {
        const pair = api.createMotorPair(pL, pR);
        expect(engine.robot.driveLeftPort).toBe(pL);
        expect(engine.robot.driveRightPort).toBe(pR);

        pair.start(0, 40);
        for (let i = 0; i < 10; i++) {
          engine.update(1 / 60);
          const pos = engine.robot.getPosition();
          // Check that position coordinates remain valid finite numbers
          expect(Number.isFinite(pos.x)).toBe(true);
          expect(Number.isFinite(pos.y)).toBe(true);
          expect(Number.isFinite(pos.z)).toBe(true);
        }
      }
    });
  });
});
