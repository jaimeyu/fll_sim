import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { AxleRiserMission } from './axle-riser';
import { GearDialMission } from './gear-dial';
import { MissionManager } from './mission-manager';

describe('FLL Mission Elements Physics Integration', () => {
  let world: RAPIER.World;

  beforeEach(async () => {
    await RAPIER.init();
    world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    // Floor collider
    world.createCollider(RAPIER.ColliderDesc.cuboid(5, 0.01, 5).setTranslation(0, 0, 0));
  });

  describe('AxleRiserMission (4-Axle Toggle Riser)', () => {
    it('initializes and settles stably on floor', () => {
      const riser = new AxleRiserMission();
      riser.init(world, { x: 0, y: 0.002, z: 0 });

      // Step physics for 30 ticks
      for (let i = 0; i < 30; i++) world.step();

      expect(riser.isSolved()).toBe(false);
      expect(riser.getScore()).toBeLessThan(20);
    });

    it('elevates middle scoring block and holds aloft via friction when pushed', () => {
      const riser = new AxleRiserMission();
      riser.init(world, { x: 0, y: 0.002, z: 0 });

      // Settle until rest
      for (let i = 0; i < 40; i++) world.step();

      // Access slider body and push toward fixed base in -X
      // @ts-ignore
      const slider = riser['sliderBody'] as RAPIER.RigidBody;
      // @ts-ignore
      const riserBody = riser['riserBody'] as RAPIER.RigidBody;

      // Apply forward pushing force on slider plate
      for (let i = 0; i < 60; i++) {
        slider.applyImpulse({ x: -0.06, y: 0, z: 0 }, true);
        world.step();
      }

      // Middle riser should be elevated
      const elevatedY = riserBody.translation().y;
      expect(elevatedY).toBeGreaterThan(0.065);
      expect(riser.isSolved()).toBe(true);
      expect(riser.getScore()).toBeGreaterThan(70);

      // Remove pushing force and step for 60 more frames (1 full second under gravity)
      for (let i = 0; i < 60; i++) {
        world.step();
      }

      // Joint friction must hold the riser aloft!
      const postGravityY = riserBody.translation().y;
      expect(postGravityY).toBeGreaterThan(0.060);
      expect(riser.isSolved()).toBe(true);
    });

    it('resets cleanly back to initial rest position', () => {
      const riser = new AxleRiserMission();
      riser.init(world, { x: 0, y: 0.002, z: 0 });

      // Push it
      // @ts-ignore
      const slider = riser['sliderBody'] as RAPIER.RigidBody;
      for (let i = 0; i < 30; i++) {
        slider.applyImpulse({ x: -0.08, y: 0, z: 0 }, true);
        world.step();
      }

      // Reset
      riser.reset();

      // @ts-ignore
      const riserBody = riser['riserBody'] as RAPIER.RigidBody;
      expect(riserBody.translation().y).toBeCloseTo(0.04, 2);
      expect(riser.isSolved()).toBe(false);
    });
  });

  describe('GearDialMission (Rotary Gear Turnstile)', () => {
    it('rotates when paddle is pushed and marks solved at 90 degrees', () => {
      const dial = new GearDialMission();
      dial.init(world, { x: 0, y: 0.002, z: 0 });

      for (let i = 0; i < 20; i++) world.step();
      expect(dial.isSolved()).toBe(false);

      // Apply torque around Y axis to rotor
      // @ts-ignore
      const rotor = dial['rotorBody'] as RAPIER.RigidBody;
      for (let i = 0; i < 40; i++) {
        rotor.applyTorqueImpulse({ x: 0, y: 0.08, z: 0 }, true);
        world.step();
      }

      expect(dial.isSolved()).toBe(true);
      expect(dial.getScore()).toBeGreaterThanOrEqual(90);

      // Reset restores angle
      dial.reset();
      expect(dial.isSolved()).toBe(false);
    });
  });

  describe('MissionManager', () => {
    it('coordinates elements and switches between Arena and Sandbox modes', () => {
      const scene = new THREE.Scene();
      const manager = new MissionManager();
      manager.init(world, scene);

      expect(manager.elements.size).toBe(2);

      // Default Arena mode
      expect(manager.currentMode).toBe('ARENA');
      const riser = manager.elements.get('axle-riser')!;
      expect(riser.getPosition().x).toBe(MissionManager.ARENA_RISER_POS.x);

      // Switch to Sandbox mode
      manager.setMode('SANDBOX_RISER');
      expect(manager.currentMode).toBe('SANDBOX_RISER');
      expect(riser.getPosition().x).toBe(0.0);
      expect(manager.getActiveElement()).toBe(riser);

      // Switch to Rotary Dial sandbox
      manager.setMode('SANDBOX_DIAL');
      expect(manager.currentMode).toBe('SANDBOX_DIAL');
      const dial = manager.elements.get('gear-dial')!;
      expect(dial.getPosition().x).toBe(0.0);
    });
  });
});
