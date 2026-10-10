import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { MissionElement } from './types';
import { AxleRiserMission } from './axle-riser';
import { GearDialMission } from './gear-dial';
import { CascadeGearDialMission } from './gear-cascade';

import { CustomImportedMissionElement } from './custom-imported-element';
import { LDrawImporter } from '../cad/ldraw-importer';
import { RobotAssemblySpec } from '../cad/types';
import { decomposeMissionAssembly } from './mission-decomposer';
import {
  SEASON_MISSIONS_CONFIG,
  SeasonMissionSpec,
  isMissionConfigEnabled,
  saveStoredSeasonMissionOverride,
  getMissionArenaPosition,
} from './season-config';

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
  private loadingMissions: Set<string> = new Set();
  public onMissionListChanged?: () => void;

  // Standard Competition Field Mat Coordinates
  public static readonly ARENA_RISER_POS = { x: -0.35, y: 0.002, z: 0.18 };
  public static readonly ARENA_DIAL_POS = { x: 0.40, y: 0.002, z: -0.15 };
  public static readonly ARENA_CASCADE_POS = { x: 0.52, y: 0.002, z: -0.42 };
  public static readonly SANDBOX_CENTER_POS = { x: 0.0, y: 0.002, z: 0.0 };

  constructor() {
    this.rootGroup = new THREE.Group();
  }

  public init(
    world: RAPIER.World,
    parentScene: THREE.Scene,
    options: { loadSampleMechanisms?: boolean; autoLoadSeasonMissions?: boolean } = {}
  ): void {
    this.world = world;
    parentScene.add(this.rootGroup);

    // If loadSampleMechanisms is true (or default true in test suites)
    const shouldLoadSample = options.loadSampleMechanisms !== undefined ? options.loadSampleMechanisms : true;
    if (shouldLoadSample) {
      this.loadSampleMechanisms();
    }

    // Asynchronously load default starter season models (configured via season-config.ts)
    if (options.autoLoadSeasonMissions !== false && typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      this.loadDefaultSeasonMissions().catch((err) => {
        console.warn('[MissionManager] Default season missions autoload deferred:', err);
      });
    }
  }

  public loadSampleMechanisms(): void {
    if (!this.elements.has('axle-riser')) {
      const riser = new AxleRiserMission();
      riser.init(this.world, MissionManager.ARENA_RISER_POS);
      this.elements.set(riser.id, riser);
      this.rootGroup.add(riser.rootGroup);
    }
    if (!this.elements.has('gear-dial')) {
      const dial = new GearDialMission();
      dial.init(this.world, MissionManager.ARENA_DIAL_POS);
      this.elements.set(dial.id, dial);
      this.rootGroup.add(dial.rootGroup);
    }
    if (!this.elements.has('gear-cascade')) {
      const cascade = new CascadeGearDialMission();
      cascade.init(this.world, MissionManager.ARENA_CASCADE_POS);
      this.elements.set(cascade.id, cascade);
      this.rootGroup.add(cascade.rootGroup);
    }
  }

  public clearAllElements(): void {
    const ids = Array.from(this.elements.keys());
    for (const id of ids) {
      this.removeElement(id);
    }
    for (const spec of SEASON_MISSIONS_CONFIG) {
      saveStoredSeasonMissionOverride(spec.id, false);
    }
    this.onMissionListChanged?.();
  }

  /**
   * Asynchronously loads a specific season mission .io model
   */
  public async loadSeasonMission(spec: SeasonMissionSpec, customSpec?: RobotAssemblySpec): Promise<CustomImportedMissionElement | null> {
    if (this.elements.has(spec.id)) {
      if (!customSpec) {
        const existing = this.elements.get(spec.id) as CustomImportedMissionElement;
        existing.isPlacedOnField = true;
        existing.rootGroup.visible = true;
        return existing;
      }
      this.removeElement(spec.id);
    }
    if (this.loadingMissions.has(spec.id)) return null;

    this.loadingMissions.add(spec.id);
    this.onMissionListChanged?.();

    try {
      let parsedSpec = customSpec;
      if (!parsedSpec) {
        if (typeof window === 'undefined' || typeof fetch === 'undefined') {
          this.loadingMissions.delete(spec.id);
          return null;
        }
        const baseUrl = (import.meta.env?.BASE_URL || './').replace(/\/$/, '') + '/';
        const fileUrl = `${baseUrl}${spec.ioFile.replace(/^\//, '')}`;
        const res = await fetch(fileUrl);
        if (!res.ok) {
          console.warn(`[MissionManager] Failed to fetch ${fileUrl}: HTTP ${res.status}`);
          this.loadingMissions.delete(spec.id);
          this.onMissionListChanged?.();
          return null;
        }
        const buffer = await res.arrayBuffer();
        parsedSpec = await LDrawImporter.parseStudioIo(buffer);
      }

      // Restore custom cluster fixed/dynamic overrides from localStorage
      try {
        const storedClusters = localStorage.getItem(`fll_mission_${spec.id}_clusters_override`);
        if (storedClusters) {
          const overrides = JSON.parse(storedClusters);
          for (const c of parsedSpec.clusters) {
            if (overrides[c.clusterId]?.isFixed !== undefined) {
              c.isFixed = overrides[c.clusterId].isFixed;
            }
          }
        }
      } catch {
        // ignore
      }

      const pose = getMissionArenaPosition(spec);
      const decomposedObjects = decomposeMissionAssembly(parsedSpec, spec.id, pose, pose.yawDegrees);

      let mainElem: CustomImportedMissionElement | null = null;
      for (const obj of decomposedObjects) {
        const customElem = new CustomImportedMissionElement(obj.spec, {
          id: obj.id,
          name: obj.name,
          description: `${spec.description} (${obj.name})`,
          sourceFile: spec.ioFile,
          isBaseFixed: obj.isBaseFixed,
          parentMissionId: spec.id,
        });

        customElem.init(this.world, obj.initialPos, obj.yawDegrees);
        this.registerCustomElement(customElem);
        if (obj.id === spec.id) mainElem = customElem;
      }

      this.loadingMissions.delete(spec.id);
      this.onMissionListChanged?.();
      return mainElem || (this.elements.get(spec.id) as CustomImportedMissionElement) || null;
    } catch (err) {
      console.error(`[MissionManager] Failed to load season mission ${spec.id}:`, err);
      this.loadingMissions.delete(spec.id);
      this.onMissionListChanged?.();
      return null;
    }
  }

  /**
   * Loads all season missions configured with enabledByDefault: true
   */
  public async loadDefaultSeasonMissions(): Promise<void> {
    for (const spec of SEASON_MISSIONS_CONFIG) {
      if (isMissionConfigEnabled(spec)) {
        await this.loadSeasonMission(spec);
      }
    }
  }

  /**
   * Toggles a season mission model on or off, updating persistent storage
   */
  public async toggleSeasonMission(id: string, enable: boolean, customSpec?: RobotAssemblySpec): Promise<boolean> {
    saveStoredSeasonMissionOverride(id, enable);
    if (!enable) {
      this.removeElement(id);
      this.onMissionListChanged?.();
      return false;
    } else {
      const config = SEASON_MISSIONS_CONFIG.find((m) => m.id === id);
      if (config) {
        await this.loadSeasonMission(config, customSpec);
        return true;
      } else if (customSpec) {
        if (this.elements.has(id)) {
          this.removeElement(id);
        }
        const pose = { x: 0, y: 0.002, z: 0, yawDegrees: 0 };
        const decomposedObjects = decomposeMissionAssembly(customSpec, id, pose, 0);
        for (const obj of decomposedObjects) {
          const customElem = new CustomImportedMissionElement(obj.spec, {
            id: obj.id,
            name: obj.name,
            description: 'User uploaded custom model',
            isBaseFixed: obj.isBaseFixed,
            parentMissionId: id,
          });
          customElem.init(this.world, obj.initialPos, obj.yawDegrees);
          this.registerCustomElement(customElem);
        }
        this.onMissionListChanged?.();
        return true;
      }
      return false;
    }
  }

  /**
   * Applies a mission subset preset, loading desired missions and stowing others.
   * Special presets:
   *  - 'starter': Loads Missions 1, 2, and 3
   *  - 'm1_only': Loads Mission 1
   *  - 'm2_only': Loads Mission 2
   *  - 'm3_only': Loads Mission 3
   *  - 'north': Loads Missions 1, 2, 3, 4
   *  - 'all': Loads all 13 official missions
   *  - 'clear': Unloads/stows all official missions
   */
  public async applyMissionPreset(presetKey: string): Promise<string[]> {
    let targetIds: string[] = [];

    switch (presetKey) {
      case 'starter':
        targetIds = ['M01', 'M02', 'M03'];
        break;
      case 'm1_only':
        targetIds = ['M01'];
        break;
      case 'm2_only':
        targetIds = ['M02'];
        break;
      case 'm3_only':
        targetIds = ['M03'];
        break;
      case 'north':
        targetIds = ['M01', 'M02', 'M03', 'M04'];
        break;
      case 'all':
        targetIds = SEASON_MISSIONS_CONFIG.map((s) => s.id);
        break;
      case 'clear':
        targetIds = [];
        break;
      default:
        targetIds = ['M01', 'M02', 'M03'];
        break;
    }

    const targetSet = new Set(targetIds);

    // 1. Unload/clear ALL elements currently on the field first
    const existingIds = Array.from(this.elements.keys());
    for (const id of existingIds) {
      this.removeElement(id);
    }
    for (const spec of SEASON_MISSIONS_CONFIG) {
      saveStoredSeasonMissionOverride(spec.id, false);
    }

    // 2. Load missions in targetSet
    for (const spec of SEASON_MISSIONS_CONFIG) {
      if (targetSet.has(spec.id)) {
        saveStoredSeasonMissionOverride(spec.id, true);
        await this.loadSeasonMission(spec);
      }
    }

    this.onMissionListChanged?.();
    return targetIds;
  }

  /**
   * Returns current status of all 13 official season missions
   */
  public getSeasonMissionsStatus(): Array<{
    spec: SeasonMissionSpec;
    isLoaded: boolean;
    isLoading: boolean;
  }> {
    return SEASON_MISSIONS_CONFIG.map((spec) => ({
      spec,
      isLoaded: this.elements.has(spec.id),
      isLoading: this.loadingMissions.has(spec.id),
    }));
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
    const toRemove: string[] = [];
    for (const [key, elem] of this.elements.entries()) {
      if (key === id || elem.parentMissionId === id) {
        toRemove.push(key);
      }
    }

    for (const removeId of toRemove) {
      const elem = this.elements.get(removeId);
      if (elem) {
        this.rootGroup.remove(elem.rootGroup);
        elem.destroy();
        this.elements.delete(removeId);
      }
    }
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
      if (!this.elements.has('axle-riser')) {
        const newRiser = new AxleRiserMission();
        newRiser.init(this.world, MissionManager.SANDBOX_CENTER_POS);
        this.elements.set(newRiser.id, newRiser);
        this.rootGroup.add(newRiser.rootGroup);
      }
      for (const elem of this.elements.values()) {
        elem.rootGroup.visible = elem.id === 'axle-riser';
        if (elem.id !== 'axle-riser') {
          elem.setPosition({ x: 0, y: -50, z: 0 });
        }
      }
      this.elements.get('axle-riser')?.setPosition(MissionManager.SANDBOX_CENTER_POS, 0);
    } else if (mode === 'SANDBOX_DIAL') {
      if (!this.elements.has('gear-dial')) {
        const newDial = new GearDialMission();
        newDial.init(this.world, MissionManager.SANDBOX_CENTER_POS);
        this.elements.set(newDial.id, newDial);
        this.rootGroup.add(newDial.rootGroup);
      }
      for (const elem of this.elements.values()) {
        elem.rootGroup.visible = elem.id === 'gear-dial';
        if (elem.id !== 'gear-dial') {
          elem.setPosition({ x: 0, y: -50, z: 0 });
        }
      }
      this.elements.get('gear-dial')?.setPosition(MissionManager.SANDBOX_CENTER_POS, 0);
    } else if (mode === 'SANDBOX_CASCADE') {
      if (!this.elements.has('gear-cascade')) {
        const newCascade = new CascadeGearDialMission();
        newCascade.init(this.world, MissionManager.SANDBOX_CENTER_POS);
        this.elements.set(newCascade.id, newCascade);
        this.rootGroup.add(newCascade.rootGroup);
      }
      for (const elem of this.elements.values()) {
        elem.rootGroup.visible = elem.id === 'gear-cascade';
        if (elem.id !== 'gear-cascade') {
          elem.setPosition({ x: 0, y: -50, z: 0 });
        }
      }
      this.elements.get('gear-cascade')?.setPosition(MissionManager.SANDBOX_CENTER_POS, 0);
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
