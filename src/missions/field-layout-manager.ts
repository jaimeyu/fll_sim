import { MissionElement } from './types';
import { MissionManager } from './mission-manager';
import { CustomImportedMissionElement } from './custom-imported-element';

export interface MissionElementLayoutEntry {
  elementId: string;
  parentMissionId?: string;
  name: string;
  position: { x: number; y: number; z: number };
  yawDegrees: number;
  isDualLocked: boolean;
  dualLockPosition?: { x: number; z: number } | null;
  anchoredClusterId?: string | null;
}

export interface FieldLayoutData {
  version: number;
  name: string;
  timestamp: number;
  elements: MissionElementLayoutEntry[];
}

const STORAGE_KEY = 'fll_field_custom_layout_v1';

export class FieldLayoutManager {
  /**
   * Saves the current positions and Dual Lock states of all elements to LocalStorage
   */
  public static saveCurrentLayout(elements: MissionElement[]): FieldLayoutData {
    const layoutEntries: MissionElementLayoutEntry[] = elements.map((elem) => {
      const pos = elem.getPosition();
      const yaw = elem.getYawDegrees ? elem.getYawDegrees() : 0;
      const isLocked = elem.isDualLocked ?? (elem instanceof CustomImportedMissionElement ? elem.getIsBaseFixed() : true);
      const lockPos = elem.getDualLockPosition ? elem.getDualLockPosition() : (isLocked ? { x: pos.x, z: pos.z } : null);
      const clusterId = (elem as any).getAnchoredClusterId ? (elem as any).getAnchoredClusterId() : null;

      return {
        elementId: elem.id,
        parentMissionId: elem.parentMissionId,
        name: elem.name,
        position: { x: pos.x, y: pos.y, z: pos.z },
        yawDegrees: yaw,
        isDualLocked: isLocked,
        dualLockPosition: lockPos,
        anchoredClusterId: clusterId,
      };
    });

    const layoutData: FieldLayoutData = {
      version: 1,
      name: `Custom FLL Layout (${new Date().toLocaleTimeString()})`,
      timestamp: Date.now(),
      elements: layoutEntries,
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layoutData));
    } catch (e) {
      console.warn('[FieldLayoutManager] Failed to save to localStorage:', e);
    }

    return layoutData;
  }

  /**
   * Loads saved layout from LocalStorage
   */
  public static loadSavedLayout(): FieldLayoutData | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as FieldLayoutData;
    } catch {
      return null;
    }
  }

  /**
   * Returns true if a layout is saved in LocalStorage
   */
  public static hasSavedLayout(): boolean {
    return localStorage.getItem(STORAGE_KEY) !== null;
  }

  /**
   * Exports a layout as a downloadable JSON file
   */
  public static exportLayoutToFile(layout: FieldLayoutData, filename = 'fll-competition-layout.json'): void {
    const blob = new Blob([JSON.stringify(layout, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Reads and parses a layout JSON file from local disk
   */
  public static async importLayoutFromFile(file: File): Promise<FieldLayoutData> {
    const text = await file.text();
    const data = JSON.parse(text) as FieldLayoutData;
    if (!data.elements || !Array.isArray(data.elements)) {
      throw new Error('Invalid layout file format: missing elements array.');
    }
    return data;
  }

  /**
   * Applies layout coordinates and Dual Lock anchor states across MissionManager elements
   */
  public static async applyLayout(
    layout: FieldLayoutData,
    missionManager: MissionManager
  ): Promise<{ restoredCount: number; dualLockedCount: number }> {
    let restoredCount = 0;
    let dualLockedCount = 0;

    for (const entry of layout.elements) {
      let elem = missionManager.getElement(entry.elementId);

      // If the parent mission is not currently loaded, attempt to load it
      if (!elem && entry.parentMissionId && entry.parentMissionId === entry.elementId) {
        await missionManager.toggleSeasonMission(entry.elementId, true);
        elem = missionManager.getElement(entry.elementId);
      }

      if (elem) {
        // Set transform
        elem.setPosition(entry.position, entry.yawDegrees);

        // Apply Dual Lock status
        if (elem.setDualLocked) {
          elem.setDualLocked(entry.isDualLocked, entry.dualLockPosition || undefined, entry.anchoredClusterId || undefined);
        } else if (elem instanceof CustomImportedMissionElement) {
          elem.setDualLocked(entry.isDualLocked, entry.dualLockPosition || undefined, entry.anchoredClusterId || undefined);
        }

        if (entry.isDualLocked) {
          dualLockedCount++;
        }
        restoredCount++;
      }
    }

    missionManager.onMissionListChanged?.();
    return { restoredCount, dualLockedCount };
  }
}
