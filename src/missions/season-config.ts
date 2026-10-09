/**
 * FLL Challenge 2026-2027 Season Mission Model Configuration
 * 
 * Controls default loaded state, mat positions, and metadata for all official
 * season mission models. Allows selective loading to maintain fast boot times
 * and low GPU/physics overhead.
 */

export interface SeasonMissionSpec {
  id: string;
  missionNumber: number;
  name: string;
  book: string;
  ioFile: string;
  enabledByDefault: boolean;
  isFixedBase: boolean;
  arenaPosition: { x: number; y: number; z: number };
  yawDegrees: number;
  description: string;
}

export const SEASON_MISSIONS_CONFIG: SeasonMissionSpec[] = [
  {
    id: 'M01',
    missionNumber: 1,
    name: 'Mission 01: Drone Survey',
    book: 'Book 01',
    ioFile: '/missions/M01.io',
    enabledByDefault: true, // Enabled as default starter model
    isFixedBase: true,
    arenaPosition: { x: -0.75, y: 0.002, z: -0.32 },
    yawDegrees: 0,
    description: 'Drone survey track mechanism with sliding cart and sensor target.',
  },
  {
    id: 'M02',
    missionNumber: 2,
    name: 'Mission 02: Exploding Seeds',
    book: 'Book 02',
    ioFile: '/missions/M02.io',
    enabledByDefault: false,
    isFixedBase: true,
    arenaPosition: { x: -0.42, y: 0.002, z: -0.36 },
    yawDegrees: 0,
    description: 'Spring-release seed pods mechanism triggered by pushing latch.',
  },
  {
    id: 'M03',
    missionNumber: 3,
    name: 'Mission 03: Flip the Rock',
    book: 'Book 03',
    ioFile: '/missions/M03.io',
    enabledByDefault: true, // Enabled as default starter model
    isFixedBase: true,
    arenaPosition: { x: 0.05, y: 0.002, z: -0.34 },
    yawDegrees: 0,
    description: 'Hinged rock boulder requiring lever arm lift.',
  },
  {
    id: 'M04',
    missionNumber: 4,
    name: 'Mission 04: Lucky Leaves',
    book: 'Book 04',
    ioFile: '/missions/M04.io',
    enabledByDefault: false,
    isFixedBase: true,
    arenaPosition: { x: 0.48, y: 0.002, z: -0.34 },
    yawDegrees: 0,
    description: 'Flippable leaf clusters with counter-balanced linkage.',
  },
  {
    id: 'M05',
    missionNumber: 5,
    name: 'Mission 05: Reaching Roots',
    book: 'Book 05',
    ioFile: '/missions/M05.io',
    enabledByDefault: false,
    isFixedBase: true,
    arenaPosition: { x: 0.85, y: 0.002, z: -0.18 },
    yawDegrees: -90,
    description: 'Telescoping root linkage pushed along guide rails.',
  },
  {
    id: 'M06',
    missionNumber: 6,
    name: 'Mission 06: Leafcutter Frenzy',
    book: 'Book 06',
    ioFile: '/missions/M06.io',
    enabledByDefault: false,
    isFixedBase: true,
    arenaPosition: { x: 0.70, y: 0.002, z: 0.22 },
    yawDegrees: 90,
    description: 'Leafcutter ant conveyor with rotary gear drives.',
  },
  {
    id: 'M07',
    missionNumber: 7,
    name: 'Mission 07: Humongous Fungus',
    book: 'Book 06',
    ioFile: '/missions/M07.io',
    enabledByDefault: false,
    isFixedBase: true,
    arenaPosition: { x: 0.32, y: 0.002, z: 0.18 },
    yawDegrees: 0,
    description: 'Mushroom cap riser with ratchet and friction pins.',
  },
  {
    id: 'M08',
    missionNumber: 8,
    name: 'Mission 08: Tangled',
    book: 'Book 07',
    ioFile: '/missions/M08.io',
    enabledByDefault: false,
    isFixedBase: true,
    arenaPosition: { x: -0.06, y: 0.002, z: 0.12 },
    yawDegrees: 0,
    description: 'Vine entanglement mechanism requiring precise rotational release.',
  },
  {
    id: 'M09',
    missionNumber: 9,
    name: 'Mission 09: Research Platform',
    book: 'Book 07',
    ioFile: '/missions/M09.io',
    enabledByDefault: false,
    isFixedBase: true,
    arenaPosition: { x: -0.46, y: 0.002, z: 0.18 },
    yawDegrees: 0,
    description: 'Elevated fungal research station with payload delivery basket.',
  },
  {
    id: 'M10',
    missionNumber: 10,
    name: 'Mission 10: Fragile Microhabitats',
    book: 'Book 08',
    ioFile: '/missions/M10.io',
    enabledByDefault: false,
    isFixedBase: true,
    arenaPosition: { x: -0.74, y: 0.002, z: 0.28 },
    yawDegrees: 0,
    description: 'Equilibrium scale mechanism balancing microhabitat blocks.',
  },
  {
    id: 'M11',
    missionNumber: 11,
    name: 'Mission 11: Window to the Past',
    book: 'Book 09',
    ioFile: '/missions/M11.io',
    enabledByDefault: false,
    isFixedBase: true,
    arenaPosition: { x: -0.22, y: 0.002, z: 0.36 },
    yawDegrees: 0,
    description: 'Amber core cylinder extraction gate with sliding pane.',
  },
  {
    id: 'M12',
    missionNumber: 12,
    name: 'Mission 12: Forest Elder',
    book: 'Book 10',
    ioFile: '/missions/M12.io',
    enabledByDefault: false,
    isFixedBase: true,
    arenaPosition: { x: 0.82, y: 0.002, z: 0.28 },
    yawDegrees: 180,
    description: 'Ancient tree canopy dial with counterweight balance.',
  },
  {
    id: 'M13',
    missionNumber: 13,
    name: 'Mission 13: Interchangeable Dock',
    book: 'Book 11-13',
    ioFile: '/missions/M13.io',
    enabledByDefault: false,
    isFixedBase: true,
    arenaPosition: { x: 0.54, y: 0.002, z: 0.36 },
    yawDegrees: 0,
    description: 'Dual-lock interchangeable dock for Keystone Species and Biocentric Architecture.',
  },
];

const STORAGE_KEY = 'fll_sim_active_season_missions';
const memoryOverrides: Record<string, boolean> = {};

export function getStoredSeasonMissionOverrides(): Record<string, boolean> {
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore
    }
  }
  return { ...memoryOverrides };
}

export function saveStoredSeasonMissionOverride(id: string, enabled: boolean): void {
  memoryOverrides[id] = enabled;
  if (typeof localStorage !== 'undefined') {
    try {
      const current = getStoredSeasonMissionOverrides();
      current[id] = enabled;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch {
      // ignore
    }
  }
}

export function isMissionConfigEnabled(config: SeasonMissionSpec): boolean {
  const overrides = getStoredSeasonMissionOverrides();
  if (config.id in overrides) {
    return overrides[config.id];
  }
  return config.enabledByDefault;
}
