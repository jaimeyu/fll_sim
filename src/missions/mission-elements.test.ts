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
        riser.update(1 / 60);
      }

      // Middle riser should be elevated
      const elevatedY = riserBody.translation().y;
      expect(elevatedY).toBeGreaterThan(0.065);
      expect(riser.isSolved()).toBe(true);
      expect(riser.getScore()).toBeGreaterThan(70);

      // Remove pushing force and step for 60 more frames (1 full second under gravity)
      for (let i = 0; i < 60; i++) {
        world.step();
        riser.update(1 / 60);
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
        riser.update(1 / 60);
      }

      // Reset
      riser.reset();

      // @ts-ignore
      const riserBody = riser['riserBody'] as RAPIER.RigidBody;
      expect(riserBody.translation().y).toBeCloseTo(0.04, 2);
      expect(riser.isSolved()).toBe(false);
    });

    it('supports arbitrary position and yaw rotation', () => {
      const riser = new AxleRiserMission();
      riser.init(world, { x: 0.25, y: 0.002, z: -0.15 }, 45);

      expect(riser.getYawDegrees()).toBe(45);
      expect(riser.getPosition().x).toBeCloseTo(0.25, 2);

      riser.setRotation(90);
      expect(riser.getYawDegrees()).toBe(90);

      riser.setPosition({ x: -0.30, y: 0.002, z: 0.10 }, 180);
      expect(riser.getYawDegrees()).toBe(180);
      expect(riser.getPosition().x).toBeCloseTo(-0.30, 2);
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
        dial.update(1 / 60);
      }

      expect(dial.isSolved()).toBe(true);
      expect(dial.getScore()).toBeGreaterThanOrEqual(90);

      // Reset restores angle
      dial.reset();
      expect(dial.isSolved()).toBe(false);
    });

    it('supports rotation and keeps rigid axle pin constraints without wobble', () => {
      const dial = new GearDialMission();
      dial.init(world, { x: 0.40, y: 0.002, z: -0.15 });

      dial.setRotation(45);
      expect(dial.getYawDegrees()).toBe(45);

      // @ts-ignore
      const rotor = dial['rotorBody'] as RAPIER.RigidBody;
      // Apply off-axis pitch and roll torque impulses to test rigid pin fit
      rotor.applyTorqueImpulse({ x: 5.0, y: 0, z: 5.0 }, true);
      for (let i = 0; i < 10; i++) world.step();

      const angvel = rotor.angvel();
      // Pitch (X) and roll (Z) must stay 0 because rotations are locked rigid to pin!
      expect(angvel.x).toBe(0);
      expect(angvel.z).toBe(0);
    });
  });

  describe('CustomImportedMissionElement', () => {
    it('instantiates custom CAD assemblies with physics and rotation', async () => {
      const { CustomImportedMissionElement } = await import('./custom-imported-element');
      const mockSpec = {
        name: 'Custom Flag Mechanism',
        clusters: [
          {
            clusterId: 'base_frame',
            name: 'Base Frame',
            isRootChassis: true,
            partIds: ['p1'],
            totalMassKg: 0.2,
            colliders: [
              {
                shape: 'box' as const,
                halfExtents: [0.05, 0.01, 0.05] as [number, number, number],
                offset: [0, 0, 0] as [number, number, number],
                rotation: [0, 0, 0, 1] as [number, number, number, number],
                friction: 0.8,
                restitution: 0.0,
              },
            ],
          },
          {
            clusterId: 'lever_arm',
            name: 'Lever Arm',
            isRootChassis: false,
            partIds: ['p2'],
            totalMassKg: 0.05,
            colliders: [
              {
                shape: 'box' as const,
                halfExtents: [0.01, 0.04, 0.01] as [number, number, number],
                offset: [0, 0.04, 0] as [number, number, number],
                rotation: [0, 0, 0, 1] as [number, number, number, number],
                friction: 0.6,
                restitution: 0.0,
              },
            ],
          },
        ],
        joints: [
          {
            jointId: 'j1',
            name: 'Pivot Joint',
            type: 'REVOLUTE' as const,
            parentClusterId: 'base_frame',
            childClusterId: 'lever_arm',
            anchorParent: [0, 0.01, 0] as [number, number, number],
            anchorChild: [0, 0, 0] as [number, number, number],
            axis: [1, 0, 0] as [number, number, number],
            maxTorqueNm: 0.5,
            maxVelocityDegPerSec: 360,
          },
        ],
        sensors: [],
      };

      const customElem = new CustomImportedMissionElement(mockSpec, {
        id: 'flag_test',
        name: 'Flag Mechanism',
        sourceFile: 'flag.io',
      });

      customElem.init(world, { x: 0.1, y: 0.002, z: 0.2 }, 30);
      expect(customElem.getYawDegrees()).toBe(30);
      expect(customElem.getPosition().x).toBeCloseTo(0.1, 2);

      customElem.setRotation(90);
      expect(customElem.getYawDegrees()).toBe(90);
      customElem.destroy();
    });
  });

  describe('MissionManager Asset Library Management', () => {
    it('coordinates elements and switches between Arena and Sandbox modes', () => {
      const scene = new THREE.Scene();
      const manager = new MissionManager();
      manager.init(world, scene);

      expect(manager.elements.size).toBe(3);

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

      // Switch to Multi-Gear Cascade sandbox
      manager.setMode('SANDBOX_CASCADE');
      expect(manager.currentMode).toBe('SANDBOX_CASCADE');
      const cascade = manager.elements.get('gear-cascade')!;
      expect(cascade.getPosition().x).toBe(0.0);
      expect(manager.getActiveElement()).toBe(cascade);
    });
  });

  describe('CascadeGearDialMission (Multi-Gear Cascading Dial)', () => {
    it('rotates across 4 cascading gears with accurate counter-rotation ratios and marks solved', async () => {
      const { CascadeGearDialMission } = await import('./gear-cascade');
      const cascade = new CascadeGearDialMission();
      cascade.init(world, { x: 0.52, y: 0.002, z: -0.42 });

      for (let i = 0; i < 20; i++) world.step();
      expect(cascade.isSolved()).toBe(false);

      // Apply torque around Y axis to driver rotor
      // @ts-ignore
      const rotor = cascade['rotorBody'] as RAPIER.RigidBody;
      for (let i = 0; i < 40; i++) {
        rotor.applyTorqueImpulse({ x: 0, y: 0.08, z: 0 }, true);
        world.step();
        cascade.update(1 / 60);
      }

      cascade.syncVisuals();
      expect(cascade.isSolved()).toBe(true);
      expect(cascade.getScore()).toBeGreaterThanOrEqual(70);

      // Verify cascading gear meshes rotation angles
      // @ts-ignore
      const g1 = cascade['gear1Mesh'] as THREE.Group;
      // @ts-ignore
      const g2 = cascade['gear2Mesh'] as THREE.Group;
      // @ts-ignore
      const g4 = cascade['gear4Mesh'] as THREE.Group;
      // Gear 4 counter-rotates and spins at 2x gear ratio
      expect(Math.abs(g4.rotation.y)).toBeGreaterThan(Math.abs(g1.rotation.y));
      // Gear 2 counter-rotates relative to Gear 1
      expect(Math.sign(g2.rotation.y - Math.PI / 16)).not.toBe(Math.sign(g1.rotation.y));

      // Reset restores initial state
      cascade.reset();
      expect(cascade.isSolved()).toBe(false);
    });

    it('supports arbitrary position, rotation, and keeps rigid pin constraints', async () => {
      const { CascadeGearDialMission } = await import('./gear-cascade');
      const cascade = new CascadeGearDialMission();
      cascade.init(world, { x: 0.52, y: 0.002, z: -0.42 });

      cascade.setRotation(60);
      expect(cascade.getYawDegrees()).toBe(60);

      // Apply off-axis pitch and roll torque impulses to test rigid pin fit
      // @ts-ignore
      const rotor = cascade['rotorBody'] as RAPIER.RigidBody;
      rotor.applyTorqueImpulse({ x: 5.0, y: 0, z: 5.0 }, true);
      for (let i = 0; i < 10; i++) world.step();

      const angvel = rotor.angvel();
      expect(angvel.x).toBe(0);
      expect(angvel.z).toBe(0);

      cascade.setPosition({ x: -0.1, y: 0.002, z: 0.2 }, 120);
      expect(cascade.getPosition().x).toBeCloseTo(-0.1, 2);
      expect(cascade.getYawDegrees()).toBe(120);
    });
  });

  describe('MissionManager Asset Library Management', () => {
    it('manages 3 default season mission elements (riser, dial, cascade)', () => {
      const scene = new THREE.Scene();
      const manager = new MissionManager();
      manager.init(world, scene);

      const elements = manager.getAllElements();
      expect(elements.length).toBe(3);
      expect(manager.getElement('axle-riser')).toBeDefined();
      expect(manager.getElement('gear-dial')).toBeDefined();
      expect(manager.getElement('gear-cascade')).toBeDefined();
    });

    it('supports registering, repositioning, and removing custom mission elements', async () => {
      const { CustomImportedMissionElement } = await import('./custom-imported-element');
      const scene = new THREE.Scene();
      const manager = new MissionManager();
      manager.init(world, scene);

      const mockSpec = {
        name: 'Test Gate',
        clusters: [
          {
            clusterId: 'gate_root',
            name: 'Gate Frame',
            isRootChassis: true,
            partIds: ['p1'],
            totalMassKg: 0.2,
            colliders: [],
          },
        ],
        joints: [],
        sensors: [],
      };

      const customElem = new CustomImportedMissionElement(mockSpec, {
        id: 'test_gate',
        name: 'Gate',
      });
      customElem.init(world, { x: 0.2, y: 0.002, z: 0.3 });

      manager.registerCustomElement(customElem);
      expect(manager.getAllElements().length).toBe(4);
      expect(manager.getElement('test_gate')).toBe(customElem);

      manager.setElementTransform('test_gate', { x: -0.15, y: 0.002, z: 0.4 }, 60);
      expect(customElem.getPosition().x).toBeCloseTo(-0.15, 2);
      expect(customElem.getYawDegrees()).toBe(60);

      manager.setElementPlaced('test_gate', false);
      expect(customElem.isPlacedOnField).toBe(false);

      manager.removeElement('test_gate');
      expect(manager.getAllElements().length).toBe(3);
      expect(manager.getElement('test_gate')).toBeUndefined();
    });
  });
});
