import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { MissionElement } from './types';
import { AxleRiserMission } from './axle-riser';
import { GearDialMission } from './gear-dial';

export type SimulatorAppMode = 'ARENA' | 'SANDBOX_RISER' | 'SANDBOX_DIAL';

/**
 * Manages active season mission models, coordinates physics bodies,
 * and handles positioning transitions between Competition Arena and Sandbox views.
 */
export class MissionManager {
  public rootGroup: THREE.Group;
  public elements: Map<string, MissionElement> = new Map();
  public currentMode: SimulatorAppMode = 'ARENA';

  private world!: RAPIER.World;

  // Standard Competition Field Mat Coordinates
  public static readonly ARENA_RISER_POS = { x: -0.35, y: 0.002, z: 0.18 };
  public static readonly ARENA_DIAL_POS = { x: 0.40, y: 0.002, z: -0.15 };
  public static readonly SANDBOX_CENTER_POS = { x: 0.0, y: 0.002, z: 0.0 };

  constructor() {
    this.rootGroup = new THREE.Group();
  }

  public init(world: RAPIER.World, parentScene: THREE.Scene): void {
    this.world = world;
    parentScene.add(this.rootGroup);

    // 1. Initialize 4-Axle Toggle Riser
    const riser = new AxleRiserMission();
    riser.init(this.world, MissionManager.ARENA_RISER_POS);
    this.elements.set(riser.id, riser);
    this.rootGroup.add(riser.rootGroup);

    // 2. Initialize Rotary Gear Dial
    const dial = new GearDialMission();
    dial.init(this.world, MissionManager.ARENA_DIAL_POS);
    this.elements.set(dial.id, dial);
    this.rootGroup.add(dial.rootGroup);
  }

  public setMode(mode: SimulatorAppMode): void {
    this.currentMode = mode;
    const riser = this.elements.get('axle-riser');
    const dial = this.elements.get('gear-dial');

    if (mode === 'ARENA') {
      if (riser) {
        riser.rootGroup.visible = true;
        riser.setPosition(MissionManager.ARENA_RISER_POS);
      }
      if (dial) {
        dial.rootGroup.visible = true;
        dial.setPosition(MissionManager.ARENA_DIAL_POS);
      }
    } else if (mode === 'SANDBOX_RISER') {
      if (riser) {
        riser.rootGroup.visible = true;
        riser.setPosition(MissionManager.SANDBOX_CENTER_POS);
      }
      if (dial) {
        dial.rootGroup.visible = false;
        dial.setPosition({ x: 0, y: -50, z: 0 }); // Move off-stage
      }
    } else if (mode === 'SANDBOX_DIAL') {
      if (dial) {
        dial.rootGroup.visible = true;
        dial.setPosition(MissionManager.SANDBOX_CENTER_POS);
      }
      if (riser) {
        riser.rootGroup.visible = false;
        riser.setPosition({ x: 0, y: -50, z: 0 }); // Move off-stage
      }
    }
  }

  public getActiveElement(): MissionElement | null {
    if (this.currentMode === 'SANDBOX_RISER') {
      return this.elements.get('axle-riser') || null;
    }
    if (this.currentMode === 'SANDBOX_DIAL') {
      return this.elements.get('gear-dial') || null;
    }
    return null;
  }

  public update(dt: number): void {
    for (const elem of this.elements.values()) {
      if (elem.rootGroup.visible) {
        elem.update(dt);
        elem.syncVisuals();
      }
    }
  }

  public resetAll(): void {
    for (const elem of this.elements.values()) {
      elem.reset();
    }
  }

  public resetCurrent(): void {
    const active = this.getActiveElement();
    if (active) {
      active.reset();
    } else {
      this.resetAll();
    }
  }
}
