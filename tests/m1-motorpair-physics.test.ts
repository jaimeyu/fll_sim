import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SimulationPhysicsEngine } from '../src/physics/engine';
import { VirtualSensorManager } from '../src/sensors/sensor-manager';
import { VirtualSpikeApi } from '../src/runtime/spike-api';
import { PythonScriptRunner } from '../src/runtime/python-runner';
import { SimulatorHud, RobotPortMapping, DEFAULT_PORT_MAPPING } from '../src/ui/hud';
import { MotorPort } from '../src/physics/motor-controller';

describe('Milestone 1: Physics MotorPair & Telemetry (Features F1 - F5)', () => {
  describe('F1: MotorPair Arbitrary Ports Communication', () => {
    it('communicates arbitrary ports (E, F) to RobotPhysicsBody', async () => {
      const engine = new SimulationPhysicsEngine();
      await engine.init();
      const sensors = new VirtualSensorManager(engine.robot);
      const api = new VirtualSpikeApi(engine, sensors);

      api.createMotorPair('E', 'F');
      expect(engine.robot.driveLeftPort).toBe('E');
      expect(engine.robot.driveRightPort).toBe('F');
    });

    it('communicates arbitrary ports (C, D) to RobotPhysicsBody', async () => {
      const engine = new SimulationPhysicsEngine();
      await engine.init();
      const sensors = new VirtualSensorManager(engine.robot);
      const api = new VirtualSpikeApi(engine, sensors);

      api.createMotorPair('C', 'D');
      expect(engine.robot.driveLeftPort).toBe('C');
      expect(engine.robot.driveRightPort).toBe('D');
    });

    it('normalizes lowercase port strings (e.g., "e", "f") to uppercase', async () => {
      const engine = new SimulationPhysicsEngine();
      await engine.init();
      const sensors = new VirtualSensorManager(engine.robot);
      const api = new VirtualSpikeApi(engine, sensors);

      api.createMotorPair('e', 'f');
      expect(engine.robot.driveLeftPort).toBe('E');
      expect(engine.robot.driveRightPort).toBe('F');
    });

    it('MotorPair() with no arguments defaults to robot configured drive ports', async () => {
      const engine = new SimulationPhysicsEngine();
      await engine.init();
      engine.robot.setDrivePorts('E', 'F');
      const sensors = new VirtualSensorManager(engine.robot);
      const api = new VirtualSpikeApi(engine, sensors);

      api.createMotorPair();
      expect(engine.robot.driveLeftPort).toBe('E');
      expect(engine.robot.driveRightPort).toBe('F');
    });

    it('safely falls back to current drive ports when passed undefined or null', async () => {
      const engine = new SimulationPhysicsEngine();
      await engine.init();
      engine.robot.setDrivePorts('C', 'D');
      const sensors = new VirtualSensorManager(engine.robot);
      const api = new VirtualSpikeApi(engine, sensors);

      api.createMotorPair(undefined, null);
      expect(engine.robot.driveLeftPort).toBe('C');
      expect(engine.robot.driveRightPort).toBe('D');
    });

    it('throws descriptive error on invalid port arguments', async () => {
      const engine = new SimulationPhysicsEngine();
      await engine.init();
      const sensors = new VirtualSensorManager(engine.robot);
      const api = new VirtualSpikeApi(engine, sensors);

      expect(() => {
        api.createMotorPair('INVALID', 'B');
      }).toThrow(/invalid port/i);
    });
  });

  describe('F2: Physics Wheel Torque & Actuation', () => {
    it('drives robot chassis across mat using MotorPair(E, F)', async () => {
      const engine = new SimulationPhysicsEngine();
      await engine.init();
      const sensors = new VirtualSensorManager(engine.robot);
      const api = new VirtualSpikeApi(engine, sensors);
      const runner = new PythonScriptRunner(api);

      // Settle robot
      for (let i = 0; i < 30; i++) engine.update(1 / 60);
      const startPos = engine.robot.getPosition();

      const interval = setInterval(() => {
        engine.update(1 / 60);
      }, 16);

      try {
        const pyCode = `
from spike import MotorPair
motors = MotorPair('E', 'F')
motors.move(20, 'cm')
motors.stop()
`;
        await runner.execute(pyCode);

        expect(engine.robot.driveLeftPort).toBe('E');
        expect(engine.robot.driveRightPort).toBe('F');

        const endPos = engine.robot.getPosition();
        const distanceMoved = Math.hypot(endPos.x - startPos.x, endPos.z - startPos.z);
        expect(distanceMoved).toBeGreaterThan(0.15);

        // Verify encoders on E & F accumulated degrees
        const motorE = engine.robot.motors.get('E');
        const motorF = engine.robot.motors.get('F');
        expect(motorE?.degrees).toBeGreaterThan(300);
        expect(motorF?.degrees).toBeGreaterThan(300);

        // Verify inactive ports A and B remained at 0 degrees
        const motorA = engine.robot.motors.get('A');
        const motorB = engine.robot.motors.get('B');
        expect(motorA?.degrees).toBe(0);
        expect(motorB?.degrees).toBe(0);
      } finally {
        clearInterval(interval);
      }
    });

    it('drives robot chassis across mat using MotorPair(C, D)', async () => {
      const engine = new SimulationPhysicsEngine();
      await engine.init();
      const sensors = new VirtualSensorManager(engine.robot);
      const api = new VirtualSpikeApi(engine, sensors);
      const runner = new PythonScriptRunner(api);

      for (let i = 0; i < 30; i++) engine.update(1 / 60);
      const startPos = engine.robot.getPosition();

      const interval = setInterval(() => {
        engine.update(1 / 60);
      }, 16);

      try {
        const pyCode = `
from spike import MotorPair
motors = MotorPair('C', 'D')
motors.move(10, 'cm')
motors.stop()
`;
        await runner.execute(pyCode);

        expect(engine.robot.driveLeftPort).toBe('C');
        expect(engine.robot.driveRightPort).toBe('D');

        const endPos = engine.robot.getPosition();
        const distanceMoved = Math.hypot(endPos.x - startPos.x, endPos.z - startPos.z);
        expect(distanceMoved).toBeGreaterThan(0.07);
      } finally {
        clearInterval(interval);
      }
    });

    it('applies torque and angular acceleration to wheel bodies on arbitrary ports', async () => {
      const engine = new SimulationPhysicsEngine();
      await engine.init();
      engine.robot.setDrivePorts('E', 'F');

      engine.robot.motors.get('E')?.start(50);
      engine.robot.motors.get('F')?.start(50);

      engine.robot.updateMotors(1 / 60);

      for (const wb of engine.robot.wheelBodies.values()) {
        const ang = wb.angvel();
        const spin = Math.sqrt(ang.x * ang.x + ang.y * ang.y + ang.z * ang.z);
        expect(spin).toBeGreaterThan(0.1);
      }
    });
  });

  describe('F3: Holding Brake Discrimination', () => {
    it('does not clamp wheel damping or engage holding brake when aux motor C is idle while driving on A and B', async () => {
      const engine = new SimulationPhysicsEngine();
      await engine.init();

      for (let i = 0; i < 30; i++) engine.update(1 / 60);

      expect(engine.robot.motors.get('C')?.targetSpeedDegPerSec).toBe(0);
      engine.robot.setDriveSpeeds(50, 50);

      for (let i = 0; i < 10; i++) {
        engine.update(1 / 60);
        for (const wb of engine.robot.wheelBodies.values()) {
          expect(wb.angularDamping()).toBeCloseTo(0.2, 1);
        }
      }
    });

    it('does not engage holding brake when stopping auxiliary motor C during active driving', async () => {
      const engine = new SimulationPhysicsEngine();
      await engine.init();

      for (let i = 0; i < 30; i++) engine.update(1 / 60);

      engine.robot.setDriveSpeeds(60, 60);
      for (let i = 0; i < 20; i++) engine.update(1 / 60);

      let brakeTriggered = false;
      engine.robot.onBrakeEngaged = () => {
        brakeTriggered = true;
      };

      engine.robot.setMotorSpeed('C', 80);
      engine.update(1 / 60);
      engine.robot.stopMotor('C');
      engine.update(1 / 60);

      expect(brakeTriggered).toBe(false);
      for (const wb of engine.robot.wheelBodies.values()) {
        expect(wb.angularDamping()).toBeCloseTo(0.2, 1);
      }
    });

    it('does not clamp wheels when non-drive ports A and B are idle while driving on E and F', async () => {
      const engine = new SimulationPhysicsEngine();
      await engine.init();

      for (let i = 0; i < 30; i++) engine.update(1 / 60);

      engine.robot.setDrivePorts('E', 'F');
      expect(engine.robot.motors.get('A')?.targetSpeedDegPerSec).toBe(0);
      expect(engine.robot.motors.get('B')?.targetSpeedDegPerSec).toBe(0);

      engine.robot.setDriveSpeeds(50, 50);

      for (let i = 0; i < 20; i++) {
        engine.update(1 / 60);
      }

      for (const wb of engine.robot.wheelBodies.values()) {
        expect(wb.angularDamping()).toBeCloseTo(0.2, 1);
      }
    });

    it('engages holding brake when drive motors are commanded to stop', async () => {
      const engine = new SimulationPhysicsEngine();
      await engine.init();

      for (let i = 0; i < 30; i++) engine.update(1 / 60);

      engine.robot.setDriveSpeeds(50, 50);
      for (let i = 0; i < 20; i++) engine.update(1 / 60);

      engine.robot.setDriveSpeeds(0, 0);
      for (let i = 0; i < 10; i++) engine.update(1 / 60);

      for (const wb of engine.robot.wheelBodies.values()) {
        expect(wb.angularDamping()).toBeCloseTo(50.0, 1);
      }
      expect(engine.robot.chassisBody.linearDamping()).toBeGreaterThanOrEqual(15.0);
    });

    it('treats drive motor speed below 0.1% as idle and engages holding brake', async () => {
      const engine = new SimulationPhysicsEngine();
      await engine.init();

      engine.robot.motors.get('A')?.start(0.05);
      engine.robot.motors.get('B')?.start(0.05);
      engine.robot.updateMotors(1 / 60);

      expect(engine.robot.chassisBody.linearDamping()).toBeGreaterThanOrEqual(15.0);
    });
  });

  describe('F4: Robot Design Modal Port Mapping Synchronization', () => {
    let mockLocalStorage: Record<string, string>;

    beforeEach(() => {
      mockLocalStorage = {};
      vi.stubGlobal('localStorage', {
        getItem: (k: string) => mockLocalStorage[k] || null,
        setItem: (k: string, v: string) => {
          mockLocalStorage[k] = v;
        },
        removeItem: (k: string) => {
          delete mockLocalStorage[k];
        },
        clear: () => {
          mockLocalStorage = {};
        },
      });
    });

    it('triggers onPortMappingChange and persists when savePortMappings is called', () => {
      const onPortMappingChange = vi.fn();
      const mockHud: any = {
        rootElement: { querySelector: () => ({ textContent: '' }) },
        portMappings: { ...DEFAULT_PORT_MAPPING, driveLeft: 'E', driveRight: 'F' },
        PORT_STORAGE_KEY: 'fll_robot_port_mappings',
        callbacks: { onPortMappingChange },
        logConsole: vi.fn(),
        updatePortStatusBadges: vi.fn(),
        savePortMappings: SimulatorHud.prototype.savePortMappings,
        getPortMappings: SimulatorHud.prototype.getPortMappings,
      };

      mockHud.savePortMappings();
      expect(onPortMappingChange).toHaveBeenCalledWith(
        expect.objectContaining({ driveLeft: 'E', driveRight: 'F' })
      );
      const saved = JSON.parse(mockLocalStorage['fll_robot_port_mappings']);
      expect(saved.driveLeft).toBe('E');
      expect(saved.driveRight).toBe('F');
    });

    it('synchronizes engine robot drive ports via onPortMappingChange handler', async () => {
      const engine = new SimulationPhysicsEngine();
      await engine.init();

      const onPortMappingChange = (mappings: RobotPortMapping) => {
        engine.robot.setDrivePorts(mappings.driveLeft, mappings.driveRight);
      };

      onPortMappingChange({ ...DEFAULT_PORT_MAPPING, driveLeft: 'C', driveRight: 'D' });
      expect(engine.robot.driveLeftPort).toBe('C');
      expect(engine.robot.driveRightPort).toBe('D');
    });
  });

  describe('F5: Telemetry Dynamic Mapping & HUD Labels Across All Ports', () => {
    it('dynamically updates telemetry drivebase port labels and live speeds for arbitrary ports', () => {
      const mockLabelL = { textContent: '' };
      const mockLabelR = { textContent: '' };
      const mockSpdA = { textContent: '' };
      const mockSpdB = { textContent: '' };
      const mockCardE = { style: { opacity: '0' } };
      const mockCardF = { style: { opacity: '0' } };
      const mockCardA = { style: { opacity: '0' } };
      const mockRoleE = { textContent: '' };
      const mockRoleF = { textContent: '' };
      const mockRoleA = { textContent: '' };

      const mockHud: any = {
        rootElement: {
          querySelector: (sel: string) => {
            if (sel === '#telem-drive-left-port-label') return mockLabelL;
            if (sel === '#telem-drive-right-port-label') return mockLabelR;
            if (sel === '#telem-live-spd-a') return mockSpdA;
            if (sel === '#telem-live-spd-b') return mockSpdB;
            if (sel === '#telem-motor-role-E') return mockRoleE;
            if (sel === '#telem-motor-role-F') return mockRoleF;
            if (sel === '#telem-motor-role-A') return mockRoleA;
            if (sel === '#telem-card-motor-e') return mockCardE;
            if (sel === '#telem-card-motor-f') return mockCardF;
            if (sel === '#telem-card-motor-a') return mockCardA;
            return null;
          },
        },
        activeRobotPreset: 'compact',
        portMappings: { ...DEFAULT_PORT_MAPPING, driveLeft: 'E', driveRight: 'F' },
        updateTelemetry: SimulatorHud.prototype.updateTelemetry,
      };

      mockHud.updateTelemetry({
        timeSeconds: 1,
        matchTimerSeconds: 150,
        fps: 60,
        physicsHz: 60,
        motors: {
          left: { port: 'E', degrees: 120, speed: 200, targetPercent: 50, status: 'RUNNING' },
          right: { port: 'F', degrees: 120, speed: 200, targetPercent: 50, status: 'RUNNING' },
          all: {
            E: { port: 'E', degrees: 120, speed: 200, targetPercent: 50, status: 'RUNNING' },
            F: { port: 'F', degrees: 120, speed: 200, targetPercent: 50, status: 'RUNNING' },
            A: { port: 'A', degrees: 0, speed: 0, targetPercent: 0, status: 'IDLE' },
          },
        },
      });

      expect(mockLabelL.textContent).toBe('E');
      expect(mockLabelR.textContent).toBe('F');
      expect(mockSpdA.textContent).toBe('+50%');
      expect(mockSpdB.textContent).toBe('+50%');
      expect(mockRoleE.textContent).toBe('Left Drive Wheel');
      expect(mockRoleF.textContent).toBe('Right Drive Wheel');
      expect(mockRoleA.textContent).toBe('Aux Motor A');
      expect(mockCardE.style.opacity).toBe('1.0');
      expect(mockCardF.style.opacity).toBe('1.0');
      expect(mockCardA.style.opacity).toBe('0.35');
    });
  });
});
