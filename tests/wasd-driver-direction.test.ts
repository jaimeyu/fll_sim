import { describe, it, expect, vi } from 'vitest';
import { SimulationPhysicsEngine } from '../src/physics/engine';
import { SimulatorHud } from '../src/ui/hud';

describe('WASD Driver Direction & Steering Orientation', () => {
  describe('HUD updateDriverKeyOutputs() computation', () => {
    function createMockHud(spd = 50) {
      const callbacks = {
        onManualDriveBase: vi.fn(),
        onManualDriveBaseStop: vi.fn(),
        onManualMotorSpeed: vi.fn(),
        onManualMotorStop: vi.fn(),
      };
      const mockHud: any = {
        isDriverArmed: true,
        heldDriverKeys: new Set<string>(),
        driveBaseSpeedPercent: spd,
        motorSpeeds: new Map(),
        callbacks,
        updateDriverKeyOutputs: SimulatorHud.prototype['updateDriverKeyOutputs'],
      };
      return { mockHud, callbacks };
    }

    it('Key A (Spin Left) commands positive left speed and negative right speed', () => {
      const { mockHud, callbacks } = createMockHud(60);
      mockHud.heldDriverKeys.add('a');
      mockHud.updateDriverKeyOutputs();

      expect(callbacks.onManualDriveBase).toHaveBeenCalledWith(60, -60);
    });

    it('Key D (Spin Right) commands negative left speed and positive right speed', () => {
      const { mockHud, callbacks } = createMockHud(60);
      mockHud.heldDriverKeys.add('d');
      mockHud.updateDriverKeyOutputs();

      expect(callbacks.onManualDriveBase).toHaveBeenCalledWith(-60, 60);
    });

    it('Key W + A (Forward-Left arc) commands left speed greater than right speed', () => {
      const { mockHud, callbacks } = createMockHud(50);
      mockHud.heldDriverKeys.add('w');
      mockHud.heldDriverKeys.add('a');
      mockHud.updateDriverKeyOutputs();

      expect(callbacks.onManualDriveBase).toHaveBeenCalledWith(50, 20);
    });

    it('Key W + D (Forward-Right arc) commands right speed greater than left speed', () => {
      const { mockHud, callbacks } = createMockHud(50);
      mockHud.heldDriverKeys.add('w');
      mockHud.heldDriverKeys.add('d');
      mockHud.updateDriverKeyOutputs();

      expect(callbacks.onManualDriveBase).toHaveBeenCalledWith(20, 50);
    });

    it('Key S + A (Reverse-Left arc) commands left reverse magnitude greater than right reverse magnitude', () => {
      const { mockHud, callbacks } = createMockHud(50);
      mockHud.heldDriverKeys.add('s');
      mockHud.heldDriverKeys.add('a');
      mockHud.updateDriverKeyOutputs();

      expect(callbacks.onManualDriveBase).toHaveBeenCalledWith(-50, -20);
    });

    it('Key S + D (Reverse-Right arc) commands right reverse magnitude greater than left reverse magnitude', () => {
      const { mockHud, callbacks } = createMockHud(50);
      mockHud.heldDriverKeys.add('s');
      mockHud.heldDriverKeys.add('d');
      mockHud.updateDriverKeyOutputs();

      expect(callbacks.onManualDriveBase).toHaveBeenCalledWith(-20, -50);
    });

    it('Key Space triggers emergency stop with zero speeds', () => {
      const { mockHud, callbacks } = createMockHud(60);
      mockHud.heldDriverKeys.add('w');
      mockHud.heldDriverKeys.add(' ');
      mockHud.updateDriverKeyOutputs();

      expect(callbacks.onManualDriveBaseStop).toHaveBeenCalled();
    });
  });

  describe('Physics Engine Steering Verification', () => {
    it('pressing A (left=50, right=-50) turns the robot to the left (yaw increases / counter-clockwise)', async () => {
      const engine = new SimulationPhysicsEngine();
      await engine.init();
      engine.resetRobot({ x: 0, y: 0.035, z: 0, yawDegrees: 0 });
      for (let i = 0; i < 20; i++) engine.update(1 / 60);

      const startYaw = engine.robot.getYawDegrees();

      // Outputs commanded for 'A' (Spin Left)
      engine.robot.setDriveSpeeds(50, -50);
      for (let i = 0; i < 20; i++) engine.update(1 / 60);

      const endYaw = engine.robot.getYawDegrees();
      const deltaYaw = endYaw - startYaw;

      // Yaw increases in the counter-clockwise / left direction
      expect(deltaYaw).toBeGreaterThan(10);
    });

    it('pressing D (left=-50, right=50) turns the robot to the right (yaw decreases / clockwise)', async () => {
      const engine = new SimulationPhysicsEngine();
      await engine.init();
      engine.resetRobot({ x: 0, y: 0.035, z: 0, yawDegrees: 0 });
      for (let i = 0; i < 20; i++) engine.update(1 / 60);

      const startYaw = engine.robot.getYawDegrees();

      // Outputs commanded for 'D' (Spin Right)
      engine.robot.setDriveSpeeds(-50, 50);
      for (let i = 0; i < 20; i++) engine.update(1 / 60);

      const endYaw = engine.robot.getYawDegrees();
      const deltaYaw = endYaw - startYaw;

      // Yaw decreases in the clockwise / right direction
      expect(deltaYaw).toBeLessThan(-10);
    });

    it('forward-left (W+A: left=50, right=20) curves left, increasing yaw', async () => {
      const engine = new SimulationPhysicsEngine();
      await engine.init();
      engine.resetRobot({ x: 0, y: 0.035, z: 0, yawDegrees: 0 });
      for (let i = 0; i < 20; i++) engine.update(1 / 60);

      const startYaw = engine.robot.getYawDegrees();
      engine.robot.setDriveSpeeds(50, 20);
      for (let i = 0; i < 30; i++) engine.update(1 / 60);

      const endYaw = engine.robot.getYawDegrees();
      expect(endYaw - startYaw).toBeGreaterThan(5);
    });

    it('forward-right (W+D: left=20, right=50) curves right, decreasing yaw', async () => {
      const engine = new SimulationPhysicsEngine();
      await engine.init();
      engine.resetRobot({ x: 0, y: 0.035, z: 0, yawDegrees: 0 });
      for (let i = 0; i < 20; i++) engine.update(1 / 60);

      const startYaw = engine.robot.getYawDegrees();
      engine.robot.setDriveSpeeds(20, 50);
      for (let i = 0; i < 30; i++) engine.update(1 / 60);

      const endYaw = engine.robot.getYawDegrees();
      expect(endYaw - startYaw).toBeLessThan(-5);
    });
  });
});
