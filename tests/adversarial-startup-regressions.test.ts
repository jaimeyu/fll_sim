import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { PerformanceProfiler } from '../src/core/performance-profiler';
import { SimulatorHud, DEFAULT_PORT_MAPPING, RobotPortMapping } from '../src/ui/hud';

describe('Adversarial Regression Suite: Startup Lifecycle, Callbacks, and High-Refresh Rates', () => {
  let mockLocalStorage: Record<string, string>;

  beforeEach(() => {
    mockLocalStorage = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mockLocalStorage[k] || null,
      setItem: (k: string, v: string) => { mockLocalStorage[k] = v; },
      removeItem: (k: string) => { delete mockLocalStorage[k]; },
      clear: () => { mockLocalStorage = {}; },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('guarantees main.ts callbacks are guarded with optional chaining when hud reference is uninitialized', () => {
    const mainPath = path.resolve(__dirname, '../src/main.ts');
    const mainCode = fs.readFileSync(mainPath, 'utf-8');

    // Verify main.ts uses guarded optional chaining hud?.logConsole and hud?.logCommand
    expect(mainCode).toContain('hud?.logConsole?.(');
    expect(mainCode).toContain('hud?.logCommand?.(');

    // Verify onPortMappingChange does NOT use unguarded hud.logConsole
    expect(mainCode).not.toMatch(/onPortMappingChange:\s*\([^)]*\)\s*=>\s*\{[^}]*\bhud\.logConsole\(/);

    // Test execution safety: simulate callbacks invoked while hud is still unassigned
    let uninitializedHudRef: any = undefined;
    const callbacks = {
      onPortMappingChange: (mappings: RobotPortMapping) => {
        uninitializedHudRef?.logConsole?.(`⚙️ Updated drive wheel ports: Left=[${mappings.driveLeft}], Right=[${mappings.driveRight}]`);
      },
      onResetEncoders: () => {
        uninitializedHudRef?.logConsole?.('🔄 Zeroed all virtual motor encoders.');
        uninitializedHudRef?.logCommand?.('CMD', 'UI Button', 'Zeroed all motor encoders to 0.0°');
      },
      onResetGyro: () => {
        uninitializedHudRef?.logConsole?.('🧭 Zeroed Gyro heading to 0.0°.');
        uninitializedHudRef?.logCommand?.('CMD', 'UI Button', 'Calibrated and zeroed Gyro IMU heading to 0.0°');
      },
    };

    expect(() => {
      callbacks.onPortMappingChange(DEFAULT_PORT_MAPPING);
      callbacks.onResetEncoders();
      callbacks.onResetGyro();
    }).not.toThrow();
  });

  it('preserves user custom port mappings across sessions without resetting to defaults on constructor load', () => {
    const hudPath = path.resolve(__dirname, '../src/ui/hud.ts');
    const hudCode = fs.readFileSync(hudPath, 'utf-8');

    // 1. Verify constructor calls updatePresetUI instead of selectRobotPreset
    expect(hudCode).toContain('this.updatePresetUI(this.activeRobotPreset);');
    expect(hudCode).not.toContain('this.selectRobotPreset(this.activeRobotPreset);');

    // 2. Functional test: load custom mappings and verify updatePresetUI leaves them intact
    const customMappings: RobotPortMapping = {
      ...DEFAULT_PORT_MAPPING,
      driveLeft: 'E',
      driveRight: 'F',
    };
    mockLocalStorage['fll_robot_port_mappings'] = JSON.stringify(customMappings);
    mockLocalStorage['fll_robot_active_preset'] = 'advanced';

    const mockHud: any = {
      activeRobotPreset: 'advanced',
      portMappings: { ...DEFAULT_PORT_MAPPING },
      PORT_STORAGE_KEY: 'fll_robot_port_mappings',
      ROBOT_PRESET_STORAGE_KEY: 'fll_robot_active_preset',
      callbacks: {},
      loadPortMappingsFromStorage: SimulatorHud.prototype.loadPortMappingsFromStorage,
      updatePresetUI: SimulatorHud.prototype.updatePresetUI,
      selectRobotPreset: SimulatorHud.prototype.selectRobotPreset,
      getPortMappings: SimulatorHud.prototype.getPortMappings,
    };

    // Load from storage
    mockHud.loadPortMappingsFromStorage();
    expect(mockHud.getPortMappings().driveLeft).toBe('E');
    expect(mockHud.getPortMappings().driveRight).toBe('F');

    // Startup lifecycle call: updatePresetUI must NOT clobber port mappings
    mockHud.updatePresetUI('advanced');
    expect(mockHud.getPortMappings().driveLeft).toBe('E');
    expect(mockHud.getPortMappings().driveRight).toBe('F');

    // selectRobotPreset with applyDefaults=false preserves custom mappings
    mockHud.selectRobotPreset('advanced', false);
    expect(mockHud.getPortMappings().driveLeft).toBe('E');
    expect(mockHud.getPortMappings().driveRight).toBe('F');

    // selectRobotPreset with applyDefaults=true applies preset defaults (Ports A & B)
    mockHud.selectRobotPreset('advanced', true);
    expect(mockHud.getPortMappings().driveLeft).toBe('A');
    expect(mockHud.getPortMappings().driveRight).toBe('B');
  });

  it('PerformanceProfiler dynamically adapts target FPS and frame budget to 120Hz displays', () => {
    const profiler = new PerformanceProfiler();
    profiler.reset();

    let time = 1000;
    // Simulate 120 FPS frame intervals (8.33ms per frame)
    for (let i = 0; i < 60; i++) {
      time += 8.333;
      profiler.startFrame(time);
      profiler.recordPhysicsTime(1.5);
      profiler.recordSyncTime(0.8);
      profiler.recordRenderTime(3.2);
      profiler.recordSensorsTime(0.3);
    }

    const snapshot = profiler.getSnapshot();
    expect(snapshot.fps).toBeGreaterThanOrEqual(115);
    expect(snapshot.targetFps).toBe(120);
    expect(snapshot.frameBudgetMs).toBeCloseTo(8.33, 1);
    expect(snapshot.bottleneckSeverity).toBe('OPTIMAL');
    expect(snapshot.recommendations[0]).toContain('120 FPS');
  });

  it('PerformanceProfiler maintains 60Hz target under standard 60 FPS loads', () => {
    const profiler = new PerformanceProfiler();
    profiler.reset();

    let time = 1000;
    // Simulate 60 FPS frame intervals (16.67ms per frame)
    for (let i = 0; i < 60; i++) {
      time += 16.666;
      profiler.startFrame(time);
      profiler.recordPhysicsTime(3.0);
      profiler.recordSyncTime(1.5);
      profiler.recordRenderTime(6.0);
      profiler.recordSensorsTime(0.5);
    }

    const snapshot = profiler.getSnapshot();
    expect(snapshot.fps).toBeGreaterThanOrEqual(58);
    expect(snapshot.fps).toBeLessThanOrEqual(62);
    expect(snapshot.targetFps).toBe(60);
    expect(snapshot.frameBudgetMs).toBeCloseTo(16.67, 1);
    expect(snapshot.bottleneckSeverity).toBe('OPTIMAL');
    expect(snapshot.recommendations[0]).toContain('60 FPS');
  });
});
