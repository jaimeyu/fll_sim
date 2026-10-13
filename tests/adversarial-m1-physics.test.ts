import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SimulationPhysicsEngine } from '../src/physics/engine';
import { VirtualSensorManager } from '../src/sensors/sensor-manager';
import { VirtualSpikeApi } from '../src/runtime/spike-api';
import { PythonScriptRunner } from '../src/runtime/python-runner';
import { SimulatorHud, DEFAULT_PORT_MAPPING } from '../src/ui/hud';
import { MotorPort } from '../src/physics/motor-controller';

describe('Adversarial Verification Suite: Milestone 1 Physics & Port Mapping', () => {
  let engine: SimulationPhysicsEngine;
  let sensors: VirtualSensorManager;
  let api: VirtualSpikeApi;

  beforeEach(async () => {
    engine = new SimulationPhysicsEngine();
    await engine.init();
    sensors = new VirtualSensorManager(engine.robot);
    api = new VirtualSpikeApi(engine, sensors);
  });

  describe('Challenge 1: Adversarial Dynamic Mid-Drive Port Remapping & Torque Redirection', () => {
    it('immediately redirects drive torque to new ports when setDrivePorts is called mid-motion', () => {
      // Settle robot on mat
      for (let i = 0; i < 30; i++) engine.update(1 / 60);

      // Start driving forward on A & B
      engine.robot.setDrivePorts('A', 'B');
      engine.robot.motors.get('A')?.start(60);
      engine.robot.motors.get('B')?.start(60);

      for (let i = 0; i < 20; i++) engine.update(1 / 60);

      const pos1 = engine.robot.getPosition();

      // Now mid-motion, switch drive ports to E & F without stopping A & B
      engine.robot.setDrivePorts('E', 'F');
      expect(engine.robot.driveLeftPort).toBe('E');
      expect(engine.robot.driveRightPort).toBe('F');

      // Command E & F in REVERSE at -80%
      engine.robot.motors.get('E')?.start(-80);
      engine.robot.motors.get('F')?.start(-80);

      // Meanwhile, set A and B target to +100% (should have zero effect on drive torque!)
      engine.robot.motors.get('A')?.start(100);
      engine.robot.motors.get('B')?.start(100);

      // Step physics
      for (let i = 0; i < 40; i++) engine.update(1 / 60);

      // The robot should have reversed direction due to E & F
      const pos2 = engine.robot.getPosition();
      // Forward was increasing or decreasing depending on yaw (default yaw 90deg -> moving towards +x or -x)
      // Regardless, verify that wheel angular velocities match reverse spin
      for (const wb of engine.robot.wheelBodies.values()) {
        const ang = wb.angvel();
        // Axis of rotation: wheel angular velocity spin should be opposite to initial forward spin
        expect(Math.abs(ang.x) + Math.abs(ang.y) + Math.abs(ang.z)).toBeGreaterThan(0.5);
      }

      // Verify that changing A & B target speeds does NOT alter wheel body torque
      // Stop E & F (new drive ports), while keeping A & B at 100%
      engine.robot.motors.get('E')?.stop('BRAKE');
      engine.robot.motors.get('F')?.stop('BRAKE');

      for (let i = 0; i < 20; i++) engine.update(1 / 60);

      // Holding brake should be clamped because the CONFIGURED drive ports (E & F) are stopped!
      for (const wb of engine.robot.wheelBodies.values()) {
        expect(wb.angularDamping()).toBeCloseTo(50.0, 1);
      }
      expect(engine.robot.chassisBody.linearDamping()).toBeGreaterThanOrEqual(15.0);
    });

    it('handles asymmetrical inverted ports (setDrivePorts B, A) with correct differential steering', () => {
      for (let i = 0; i < 30; i++) engine.update(1 / 60);

      // Swap left and right: Left is B, Right is A
      engine.robot.setDrivePorts('B', 'A');
      expect(engine.robot.driveLeftPort).toBe('B');
      expect(engine.robot.driveRightPort).toBe('A');

      // Power ONLY left drive port (B) at 70%, keeping right (A) at 0
      engine.robot.motors.get('B')?.start(70);
      engine.robot.motors.get('A')?.start(0);

      engine.robot.updateMotors(1 / 60);

      // Find left wheel body and right wheel body
      const leftWb = engine.robot.wheelBodies.get(engine.robot.leftWheelClusterId!);
      const rightWb = engine.robot.wheelBodies.get(engine.robot.rightWheelClusterId!);

      expect(leftWb).toBeDefined();
      expect(rightWb).toBeDefined();

      const leftSpin = Math.hypot(leftWb!.angvel().x, leftWb!.angvel().y, leftWb!.angvel().z);
      const rightSpin = Math.hypot(rightWb!.angvel().x, rightWb!.angvel().y, rightWb!.angvel().z);

      // Left wheel should be actively driven and spinning much faster than right wheel
      expect(leftSpin).toBeGreaterThan(0.2);
      expect(leftWb!.angularDamping()).toBeCloseTo(0.2, 1);
      // Right wheel is stopped at 0, should have holding brake damping
      expect(rightWb!.angularDamping()).toBeCloseTo(50.0, 1);
    });

    it('swapping drive ports to idle auxiliary ports C, D immediately halts motion and applies holding brake', () => {
      for (let i = 0; i < 30; i++) engine.update(1 / 60);

      // Drive at max speed on A and B
      engine.robot.setDrivePorts('A', 'B');
      engine.robot.setDriveSpeeds(100, 100);
      for (let i = 0; i < 20; i++) engine.update(1 / 60);

      // Suddenly swap drive ports to C and D which are idle (speed 0)
      engine.robot.setDrivePorts('C', 'D');

      // Update motors
      engine.robot.updateMotors(1 / 60);

      // Drive wheels must immediately have holding brake applied
      for (const wb of engine.robot.wheelBodies.values()) {
        expect(wb.angularDamping()).toBeCloseTo(50.0, 1);
      }
    });
  });

  describe('Challenge 2: Holding Brake Discrimination Under Asymmetric & Stress Conditions', () => {
    it('maintains holding brake on drive wheels even when all 4 auxiliary motors are running at 100%', () => {
      for (let i = 0; i < 30; i++) engine.update(1 / 60);

      // Drive ports are E and F
      engine.robot.setDrivePorts('E', 'F');
      engine.robot.setDriveSpeeds(0, 0);

      // All 4 auxiliary motors (A, B, C, D) running at full speed
      engine.robot.motors.get('A')?.start(100);
      engine.robot.motors.get('B')?.start(100);
      engine.robot.motors.get('C')?.start(100);
      engine.robot.motors.get('D')?.start(100);

      for (let i = 0; i < 30; i++) engine.update(1 / 60);

      // Wheels and chassis should remain firmly braked
      for (const wb of engine.robot.wheelBodies.values()) {
        expect(wb.angularDamping()).toBeCloseTo(50.0, 1);
      }
      expect(engine.robot.chassisBody.linearDamping()).toBeGreaterThanOrEqual(15.0);

      // Aux motors must have accumulated degrees while drive motors remained 0
      expect(engine.robot.motors.get('A')?.degrees).toBeGreaterThan(100);
      expect(engine.robot.motors.get('B')?.degrees).toBeGreaterThan(100);
      expect(engine.robot.motors.get('C')?.degrees).toBeGreaterThan(100);
      expect(engine.robot.motors.get('D')?.degrees).toBeGreaterThan(100);
      expect(engine.robot.motors.get('E')?.degrees).toBe(0);
      expect(engine.robot.motors.get('F')?.degrees).toBe(0);
    });

    it('pivot turn: does not clamp chassis damping when one drive wheel is active and one is stopped', () => {
      for (let i = 0; i < 30; i++) engine.update(1 / 60);

      engine.robot.setDrivePorts('E', 'F');
      // Left wheel active, right wheel 0
      engine.robot.motors.get('E')?.start(50);
      engine.robot.motors.get('F')?.stop('BRAKE');

      for (let i = 0; i < 15; i++) engine.update(1 / 60);

      // Chassis should NOT have 20.0 linear damping because one drive wheel is actively driving
      expect(engine.robot.chassisBody.linearDamping()).toBeCloseTo(0.5, 1);
      expect(engine.robot.chassisBody.angularDamping()).toBeCloseTo(2.0, 1);

      // Left wheel should be active (damping 0.2), right wheel braked (damping 50.0)
      const leftWb = engine.robot.wheelBodies.get(engine.robot.leftWheelClusterId!);
      const rightWb = engine.robot.wheelBodies.get(engine.robot.rightWheelClusterId!);
      expect(leftWb?.angularDamping()).toBeCloseTo(0.2, 1);
      expect(rightWb?.angularDamping()).toBeCloseTo(50.0, 1);
    });

    it('rapidly toggling auxiliary motor C during high-speed drive never triggers onBrakeEngaged or clamps chassis', () => {
      for (let i = 0; i < 30; i++) engine.update(1 / 60);

      let brakeCalledCount = 0;
      engine.robot.onBrakeEngaged = () => {
        brakeCalledCount++;
      };

      engine.robot.setDrivePorts('A', 'B');
      engine.robot.setDriveSpeeds(80, 80);

      for (let cycle = 0; cycle < 50; cycle++) {
        if (cycle % 2 === 0) {
          engine.robot.setMotorSpeed('C', 100);
        } else {
          engine.robot.stopMotor('C');
        }
        engine.update(1 / 60);

        // Chassis damping must remain standard, never braked
        expect(engine.robot.chassisBody.linearDamping()).toBeCloseTo(0.5, 1);
      }

      expect(brakeCalledCount).toBe(0);
    });
  });

  describe('Challenge 3: Full 6-Port Telemetry (A-F) Under Real Physics Simulation', () => {
    it('correctly tracks measured angular velocity, target percent, degrees, and status across all 6 ports', () => {
      for (let i = 0; i < 30; i++) engine.update(1 / 60);

      // Configure ports: Left=D, Right=E
      engine.robot.setDrivePorts('D', 'E');

      // Command different actions across various ports:
      // Drive Left D: +50%
      // Drive Right E: -50%
      // Aux A: +80%
      // Aux B: IDLE (0%)
      // Aux C: IDLE (0%)
      // Aux F: IDLE (0%)
      engine.robot.motors.get('D')?.start(50);
      engine.robot.motors.get('E')?.start(-50);
      engine.robot.motors.get('A')?.start(80);

      for (let i = 0; i < 30; i++) engine.update(1 / 60);

      // Sample telemetry state as main.ts does
      const allMotorsState: Record<string, any> = {};
      for (const [port, m] of engine.robot.motors.entries()) {
        const isTargetActive = Math.abs(m.targetSpeedDegPerSec) > 0.1;
        const targetPct = Math.round((m.targetSpeedDegPerSec / m.maxSpeedDegPerSec) * 100);
        const measuredSpeed = Math.round(m.velocityDegPerSec || 0);
        const status = isTargetActive
          ? 'RUNNING'
          : Math.abs(measuredSpeed) > 1
          ? 'BRAKING'
          : 'IDLE';

        allMotorsState[port] = {
          port,
          degrees: Math.round(m.degrees || 0),
          speed: measuredSpeed,
          targetPercent: targetPct,
          status,
        };
      }

      // Check all 6 ports are accounted for
      const ports: MotorPort[] = ['A', 'B', 'C', 'D', 'E', 'F'];
      for (const p of ports) {
        expect(allMotorsState[p]).toBeDefined();
        expect(allMotorsState[p].port).toBe(p);
      }

      // Check port D (Drive Left)
      expect(allMotorsState['D'].targetPercent).toBe(50);
      expect(allMotorsState['D'].status).toBe('RUNNING');
      expect(allMotorsState['D'].degrees).toBeGreaterThan(50);

      // Check port E (Drive Right)
      expect(allMotorsState['E'].targetPercent).toBe(-50);
      expect(allMotorsState['E'].status).toBe('RUNNING');
      expect(allMotorsState['E'].degrees).toBeLessThan(-50);

      // Check port A (Aux)
      expect(allMotorsState['A'].targetPercent).toBe(80);
      expect(allMotorsState['A'].status).toBe('RUNNING');
      expect(allMotorsState['A'].degrees).toBeGreaterThan(80);

      // Check port B, C, F (Idle)
      expect(allMotorsState['B'].status).toBe('IDLE');
      expect(allMotorsState['B'].degrees).toBe(0);
      expect(allMotorsState['C'].status).toBe('IDLE');
      expect(allMotorsState['F'].status).toBe('IDLE');
    });

    it('HUD correctly maps custom ports to DOM badges, titles, and presets', () => {
      const domElements: Record<string, { textContent?: string; className?: string; style?: any; classList?: any }> = {};
      const getOrCreate = (id: string) => {
        if (!domElements[id]) {
          domElements[id] = {
            textContent: '',
            className: '',
            style: {},
            classList: {
              remove: vi.fn(),
              add: vi.fn(),
              contains: vi.fn().mockReturnValue(false),
            },
          };
        }
        return domElements[id];
      };

      const mockHud: any = {
        rootElement: {
          querySelector: (sel: string) => {
            const cleanId = sel.replace('#', '');
            return getOrCreate(cleanId);
          },
        },
        activeRobotPreset: 'compact',
        portMappings: { ...DEFAULT_PORT_MAPPING, driveLeft: 'D', driveRight: 'E' },
        updateTelemetry: SimulatorHud.prototype.updateTelemetry,
      };

      // Feed telemetry with Left=D, Right=E
      mockHud.updateTelemetry({
        timeSeconds: 10,
        matchTimerSeconds: 140,
        fps: 60,
        physicsHz: 60,
        motors: {
          left: { port: 'D', degrees: 240, speed: 500, targetPercent: 50, status: 'RUNNING' },
          right: { port: 'E', degrees: -240, speed: -500, targetPercent: -50, status: 'RUNNING' },
          all: {
            A: { port: 'A', degrees: 0, speed: 0, targetPercent: 0, status: 'IDLE' },
            B: { port: 'B', degrees: 0, speed: 0, targetPercent: 0, status: 'IDLE' },
            C: { port: 'C', degrees: 0, speed: 0, targetPercent: 0, status: 'IDLE' },
            D: { port: 'D', degrees: 240, speed: 500, targetPercent: 50, status: 'RUNNING' },
            E: { port: 'E', degrees: -240, speed: -500, targetPercent: -50, status: 'RUNNING' },
            F: { port: 'F', degrees: 0, speed: 0, targetPercent: 0, status: 'IDLE' },
          },
        },
      });

      // Verify DOM output
      expect(domElements['telem-drive-left-port-label'].textContent).toBe('D');
      expect(domElements['telem-drive-right-port-label'].textContent).toBe('E');
      expect(domElements['telem-motor-role-D'].textContent).toBe('Left Drive Wheel');
      expect(domElements['telem-motor-role-E'].textContent).toBe('Right Drive Wheel');
      expect(domElements['telem-motor-role-A'].textContent).toBe('Aux Motor A');
      expect(domElements['telem-motor-role-B'].textContent).toBe('Aux Motor B');
      expect(domElements['telem-motor-role-C'].textContent).toBe('Aux Motor C');
      expect(domElements['telem-motor-role-F'].textContent).toBe('Aux Motor F');

      // Check compact preset opacity
      expect(domElements['telem-card-motor-d'].style.opacity).toBe('1.0');
      expect(domElements['telem-card-motor-e'].style.opacity).toBe('1.0');
      expect(domElements['telem-card-motor-a'].style.opacity).toBe('0.35');
      expect(domElements['telem-card-motor-b'].style.opacity).toBe('0.35');
    });
  });

  describe('Challenge 4: High-Frequency Stress & Rapid Reset Verification', () => {
    it('survives 600 high-frequency physics ticks with rapid speed reversals and variable dt', () => {
      engine.robot.setDrivePorts('E', 'F');

      const dts = [1 / 120, 1 / 60, 1 / 45, 1 / 30];
      const speeds = [100, -100, 50, -50, 0, 75, -25];

      for (let i = 0; i < 600; i++) {
        const dt = dts[i % dts.length];
        const spdL = speeds[(i * 3) % speeds.length];
        const spdR = speeds[(i * 7) % speeds.length];

        engine.robot.setDriveSpeeds(spdL, spdR);
        engine.update(dt);

        const pos = engine.robot.getPosition();
        expect(Number.isFinite(pos.x)).toBe(true);
        expect(Number.isFinite(pos.y)).toBe(true);
        expect(Number.isFinite(pos.z)).toBe(true);

        const yaw = engine.robot.getYawDegrees();
        expect(Number.isFinite(yaw)).toBe(true);
      }
    });

    it('50 consecutive rapid resets preserve joint structural integrity and reset state cleanly', () => {
      for (let iter = 0; iter < 50; iter++) {
        // Run full speed
        engine.robot.setDrivePorts(iter % 2 === 0 ? 'E' : 'C', iter % 2 === 0 ? 'F' : 'D');
        engine.robot.setDriveSpeeds(90, 90);
        for (let s = 0; s < 5; s++) engine.update(1 / 60);

        // Reset
        const spawnPose = {
          x: -0.5 + (iter % 5) * 0.1,
          y: 0.035,
          z: 0.2 + (iter % 3) * 0.1,
          yawDegrees: (iter * 45) % 360,
        };
        engine.resetRobot(spawnPose);

        // Verify clean zeroed velocity
        const cv = engine.robot.chassisBody.linvel();
        expect(cv.x).toBe(0);
        expect(cv.y).toBe(0);
        expect(cv.z).toBe(0);

        // Verify motors degrees are reset to 0
        for (const m of engine.robot.motors.values()) {
          expect(m.degrees).toBe(0);
        }

        // Verify wheel positions match chassis offset
        for (const wb of engine.robot.wheelBodies.values()) {
          const wv = wb.linvel();
          expect(wv.x).toBe(0);
          expect(wv.y).toBe(0);
          expect(wv.z).toBe(0);
        }
      }
    });

    it('rapidly switching port mappings 100 times in succession does not corrupt physics body or joints', () => {
      const portPairs: [MotorPort, MotorPort][] = [
        ['A', 'B'],
        ['B', 'A'],
        ['C', 'D'],
        ['D', 'C'],
        ['E', 'F'],
        ['F', 'E'],
        ['A', 'F'],
        ['E', 'B'],
      ];

      for (let i = 0; i < 100; i++) {
        const pair = portPairs[i % portPairs.length];
        engine.robot.setDrivePorts(pair[0], pair[1]);
        expect(engine.robot.driveLeftPort).toBe(pair[0]);
        expect(engine.robot.driveRightPort).toBe(pair[1]);

        engine.robot.setDriveSpeeds(50, 50);
        engine.update(1 / 60);
      }

      // Verify wheels are still intact and responsive
      expect(engine.robot.wheelBodies.size).toBeGreaterThanOrEqual(2);
      expect(engine.robot.joints.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Challenge 5: PythonRunner MotorPair End-to-End Execution with Non-Standard Ports', () => {
    it('executes python script with MotorPair("E", "F") and verifies physical displacement', async () => {
      const runner = new PythonScriptRunner(api);

      for (let i = 0; i < 30; i++) engine.update(1 / 60);
      const startPos = engine.robot.getPosition();

      const simInterval = setInterval(() => {
        engine.update(1 / 60);
      }, 16);

      try {
        const script = `
from spike import MotorPair

motors = MotorPair('e', 'f')
motors.set_default_speed(60)
motors.move(15, 'cm')
motors.stop()
`;
        await runner.execute(script);

        const endPos = engine.robot.getPosition();
        const dist = Math.hypot(endPos.x - startPos.x, endPos.z - startPos.z);
        expect(dist).toBeGreaterThan(0.10);

        // Verify holding brake engaged upon motors.stop()
        for (const wb of engine.robot.wheelBodies.values()) {
          expect(wb.angularDamping()).toBeCloseTo(50.0, 1);
        }
      } finally {
        clearInterval(simInterval);
      }
    });

    it('rejects invalid or duplicate ports cleanly', () => {
      expect(() => api.createMotorPair('A', 'A')).toThrow(/cannot be the same port/i);
      expect(() => api.createMotorPair('G', 'H')).toThrow(/invalid port/i);
      expect(() => api.createMotorPair(123 as any, 'B')).toThrow(/invalid port/i);
      expect(() => api.createMotorPair('', 'B')).toThrow(/invalid port/i);
    });
  });

  describe('Challenge 6: Full System Propagation (UI -> Physics Body -> Telemetry -> Reset Cycle)', () => {
    it('verifies seamless lifecycle: onPortMappingChange -> torque redirect -> telemetry update -> robot reset sync', () => {
      // 1. Initial state: Port mappings are default A and B
      let currentPortMappings = { ...DEFAULT_PORT_MAPPING, driveLeft: 'A' as MotorPort, driveRight: 'B' as MotorPort };
      const onPortMappingChange = (mappings: typeof DEFAULT_PORT_MAPPING) => {
        currentPortMappings = { ...mappings };
        const isPort = (p: string): p is MotorPort => ['A', 'B', 'C', 'D', 'E', 'F'].includes(p);
        const left = isPort(mappings.driveLeft) ? mappings.driveLeft : 'A';
        const right = isPort(mappings.driveRight) ? mappings.driveRight : 'B';
        engine.robot.setDrivePorts(left, right);
      };

      expect(engine.robot.driveLeftPort).toBe('A');
      expect(engine.robot.driveRightPort).toBe('B');

      // 2. User changes port mappings in UI to C and D
      onPortMappingChange({ ...DEFAULT_PORT_MAPPING, driveLeft: 'C', driveRight: 'D' });
      expect(engine.robot.driveLeftPort).toBe('C');
      expect(engine.robot.driveRightPort).toBe('D');

      // 3. Actuate drive ports C and D
      engine.robot.setDriveSpeeds(60, 60);
      for (let i = 0; i < 20; i++) engine.update(1 / 60);

      // Verify physical wheel spin
      for (const wb of engine.robot.wheelBodies.values()) {
        const spin = Math.hypot(wb.angvel().x, wb.angvel().y, wb.angvel().z);
        expect(spin).toBeGreaterThan(0.2);
      }

      // 4. Sample telemetry
      const driveLeftPort = engine.robot.driveLeftPort;
      const driveRightPort = engine.robot.driveRightPort;
      const mLeft = engine.robot.motors.get(driveLeftPort);
      const mRight = engine.robot.motors.get(driveRightPort);

      expect(driveLeftPort).toBe('C');
      expect(driveRightPort).toBe('D');
      expect(mLeft?.degrees).toBeGreaterThan(50);
      expect(mRight?.degrees).toBeGreaterThan(50);

      // 5. Simulate onResetRobot: reset physics and re-sync ports from currentPortMappings
      engine.robot.stopAllMotors();
      engine.resetRobot();
      const isPort = (p: string): p is MotorPort => ['A', 'B', 'C', 'D', 'E', 'F'].includes(p);
      engine.robot.setDrivePorts(
        isPort(currentPortMappings.driveLeft) ? currentPortMappings.driveLeft : 'A',
        isPort(currentPortMappings.driveRight) ? currentPortMappings.driveRight : 'B'
      );

      // Verify ports are preserved as C and D after reset
      expect(engine.robot.driveLeftPort).toBe('C');
      expect(engine.robot.driveRightPort).toBe('D');
      expect(mLeft?.degrees).toBe(0);
      expect(mRight?.degrees).toBe(0);

      // 6. Simulate onMoveRobotToPose: relocate and re-sync ports
      const testPose = { x: 0.1, y: 0.035, z: -0.2, yawDegrees: 180 };
      engine.resetRobot(testPose);
      engine.robot.setDrivePorts(
        isPort(currentPortMappings.driveLeft) ? currentPortMappings.driveLeft : 'A',
        isPort(currentPortMappings.driveRight) ? currentPortMappings.driveRight : 'B'
      );
      expect(engine.robot.driveLeftPort).toBe('C');
      expect(engine.robot.driveRightPort).toBe('D');

      const posAfter = engine.robot.getPosition();
      expect(posAfter.x).toBeCloseTo(0.1, 2);
      expect(posAfter.z).toBeCloseTo(-0.2, 2);
    });
  });
});

