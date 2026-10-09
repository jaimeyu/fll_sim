import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { MissionElement } from './types';
import { AxleRiserMission } from './axle-riser';
import { GearDialMission } from './gear-dial';
import { CascadeGearDialMission } from './gear-cascade';

export type SimulatorAppMode = 'ARENA' | 'SANDBOX_RISER' | 'SANDBOX_DIAL' | 'SANDBOX_CASCADE';

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
  public static readonly ARENA_CASCADE_POS = { x: 0.52, y: 0.002, z: -0.42 };
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

    // 3. Initialize Multi-Gear Cascading Dial
    const cascade = new CascadeGearDialMission();
    cascade.init(this.world, MissionManager.ARENA_CASCADE_POS);
    this.elements.set(cascade.id, cascade);
    this.rootGroup.add(cascade.rootGroup);
  }

  public getWorld(): RAPIER.World {
    return this.world;
  }

  public registerCustomElement(element: MissionElement): void {
    if (this.elements.has(element.id)) {
      this.removeElement(element.id);
    }
    this.elements.set(element.id, element);
    this.rootGroup.add(element.rootGroup);
    element.isPlacedOnField = true;
    element.rootGroup.visible = true;
  }

  public removeElement(id: string): void {
    const elem = this.elements.get(id);
    if (!elem) return;
    this.rootGroup.remove(elem.rootGroup);
    elem.destroy();
    this.elements.delete(id);
  }

  public setElementTransform(id: string, pos: { x: number; y: number; z: number }, yawDegrees?: number): void {
    const elem = this.elements.get(id);
    if (!elem) return;
    elem.setPosition(pos, yawDegrees);
  }

  public setElementRotation(id: string, yawDegrees: number): void {
    const elem = this.elements.get(id);
    if (!elem) return;
    if (elem.setRotation) {
      elem.setRotation(yawDegrees);
    } else {
      elem.setPosition(elem.getPosition(), yawDegrees);
    }
  }

  public setElementPlaced(id: string, placed: boolean): void {
    const elem = this.elements.get(id);
    if (!elem) return;
    elem.isPlacedOnField = placed;
    elem.rootGroup.visible = placed && (this.currentMode === 'ARENA');
    if (!placed) {
      elem.setPosition({ x: 0, y: -50, z: 0 }); // park offstage
    } else {
      const pos = elem.getPosition();
      if (pos.y < -10) {
        elem.setPosition({ x: 0, y: 0.002, z: 0 });
      } else {
        elem.reset();
      }
    }
  }

  public getElement(id: string): MissionElement | undefined {
    return this.elements.get(id);
  }

  public getAllElements(): MissionElement[] {
    return Array.from(this.elements.values());
  }

  public setMode(mode: SimulatorAppMode): void {
    this.currentMode = mode;
    const riser = this.elements.get('axle-riser');
    const dial = this.elements.get('gear-dial');
    const cascade = this.elements.get('gear-cascade');

    if (mode === 'ARENA') {
      for (const elem of this.elements.values()) {
        const isPlaced = elem.isPlacedOnField !== false;
        elem.rootGroup.visible = isPlaced;
      }
      if (riser && riser.isPlacedOnField !== false) {
        riser.setPosition(MissionManager.ARENA_RISER_POS, 0);
      }
      if (dial && dial.isPlacedOnField !== false) {
        dial.setPosition(MissionManager.ARENA_DIAL_POS, 0);
      }
      if (cascade && cascade.isPlacedOnField !== false) {
        cascade.setPosition(MissionManager.ARENA_CASCADE_POS, 0);
      }
    } else if (mode === 'SANDBOX_RISER') {
      for (const elem of this.elements.values()) {
        elem.rootGroup.visible = (elem.id === 'axle-riser');
        if (elem.id !== 'axle-riser') {
          elem.setPosition({ x: 0, y: -50, z: 0 });
        }
      }
      if (riser) {
        riser.setPosition(MissionManager.SANDBOX_CENTER_POS, 0);
      }
    } else if (mode === 'SANDBOX_DIAL') {
      for (const elem of this.elements.values()) {
        elem.rootGroup.visible = (elem.id === 'gear-dial');
        if (elem.id !== 'gear-dial') {
          elem.setPosition({ x: 0, y: -50, z: 0 });
        }
      }
      if (dial) {
        dial.setPosition(MissionManager.SANDBOX_CENTER_POS, 0);
      }
    } else if (mode === 'SANDBOX_CASCADE') {
      for (const elem of this.elements.values()) {
        elem.rootGroup.visible = (elem.id === 'gear-cascade');
        if (elem.id !== 'gear-cascade') {
          elem.setPosition({ x: 0, y: -50, z: 0 });
        }
      }
      if (cascade) {
        cascade.setPosition(MissionManager.SANDBOX_CENTER_POS, 0);
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
    if (this.currentMode === 'SANDBOX_CASCADE') {
      return this.elements.get('gear-cascade') || null;
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
