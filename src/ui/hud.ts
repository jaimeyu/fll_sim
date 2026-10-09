import { TelemetryState, ExecutionState, SpawnPose } from '../runtime/types';
import { CameraViewPreset } from '../view/viewport';
import { SimulatorAppMode } from '../missions/mission-manager';
import { MatMapType } from '../view/mat-texture';

import { SeasonMissionSpec } from '../missions/season-config';

export interface HudCallbacks {
  onRunScript: (script: string) => void;
  onStopScript: () => void;
  onResetRobot: () => void;
  onCameraChange: (preset: CameraViewPreset) => void;
  onImportFile: (file: File) => void;
  onImportMissionElement?: (file: File) => void;
  onMapChange?: (mapType: MatMapType) => void;
  onSpawnPoseChange?: (pose: SpawnPose) => void;
  onMoveRobotToPose?: (pose: SpawnPose, label?: string) => void;
  onCaptureCurrentPose?: () => void;
  onModeChange?: (mode: SimulatorAppMode) => void;
  onTogglePusherTool?: (active: boolean) => void;
  onSpawnTestBlock?: () => void;
  onToggleDynoMode?: (active: boolean) => void;
  onResetMission?: () => void;
  onResetAllMissions?: () => void;
  onElementTransformChange?: (id: string, x: number, z: number, yawDegrees: number) => void;
  onElementTogglePlaced?: (id: string, placed: boolean) => void;
  onElementDelete?: (id: string) => void;
  onElementFocus?: (id: string) => void;
  onFocusTarget?: (target: 'robot' | 'center' | string) => void;
  onToggleSeasonMission?: (id: string, enable: boolean) => void;
  onApplyMissionPreset?: (presetKey: string) => void;
  onOpenInspector?: (missionId?: string) => void;
}

export const SAMPLE_MISSIONS: Record<string, { title: string; code: string }> = {
  drive_straight: {
    title: 'Mission 1: Drive Straight (30 cm)',
    code: `from spike import PrimeHub, MotorPair

hub = PrimeHub()
motors = MotorPair('A', 'B')

motors.set_default_speed(50)
print("Starting 30 cm straight drive...")
motors.move(30, 'cm')
print("Successfully reached target position!")
`,
  },
  gyro_turn: {
    title: 'Mission 2: Gyro 90° Turn',
    code: `from spike import PrimeHub, MotorPair
from spike.control import wait_for_seconds

hub = PrimeHub()
motors = MotorPair('A', 'B')

print("Calibrating Gyro...")
hub.motion_sensor.reset_yaw_angle()
wait_for_seconds(0.2)

print("Executing precise 90-degree tank turn...")
motors.start_tank(35, -35)

while hub.motion_sensor.get_yaw_angle() < 90:
    wait_for_seconds(0.01)

motors.stop()
print("Turn completed! Final heading:", hub.motion_sensor.get_yaw_angle())
`,
  },
  line_follower: {
    title: 'Mission 3: Proportional Line Follower (P-Controller)',
    code: `from spike import MotorPair, ColorSensor
from spike.control import wait_for_seconds

motors = MotorPair('A', 'B')
color_c = ColorSensor('C')

# P-Controller Settings
target_light = 50   # Edge of line (50% reflected light)
kp = 0.85           # Proportional gain
base_speed = 35     # Base driving velocity

print("Starting P-Controller line follower on black track...")
for step in range(250):
    light = color_c.get_reflected_light()
    error = target_light - light
    steering = error * kp
    motors.start(steering, base_speed)
    wait_for_seconds(0.02)

motors.stop()
print("Line following sequence finished!")
`,
  },
  line_squaring: {
    title: 'Mission 4: Dual-Sensor Line Squaring',
    code: `from spike import MotorPair, ColorSensor
from spike.control import wait_for_seconds

motors = MotorPair('A', 'B')
sensor_c = ColorSensor('C') # Left
sensor_d = ColorSensor('D') # Right

print("Driving toward line at 30% speed...")
motors.start(0, 30)

step_count = 0
while sensor_c.get_reflected_light() > 30 and sensor_d.get_reflected_light() > 30 and step_count < 250:
    wait_for_seconds(0.01)
    step_count += 1

motors.stop()
print("Approached line! Squaring robot perpendicular...")

for i in range(100):
    left_light = sensor_c.get_reflected_light()
    right_light = sensor_d.get_reflected_light()
    
    left_spd = 15 if left_light > 30 else 0
    right_spd = 15 if right_light > 30 else 0
    
    if left_spd == 0 and right_spd == 0:
        break
        
    motors.start_tank(left_spd, right_spd)
    wait_for_seconds(0.02)

motors.stop()
print("Robot perfectly squared to line!")
`,
  },
};

export class SimulatorHud {
  public rootElement: HTMLElement;
  private callbacks: HudCallbacks;
  private codeTextarea!: HTMLTextAreaElement;
  private consoleOutput!: HTMLElement;
  private statusBadge!: HTMLElement;
  private timerDisplay!: HTMLElement;
  private runBtn!: HTMLButtonElement;
  private stopBtn!: HTMLButtonElement;
  private topbarRunBtn!: HTMLButtonElement;
  private topbarStopBtn!: HTMLButtonElement;

  // Activity Bar & Drawer state
  private activeView: 'code' | 'assets' | 'field' | 'terminal' = 'code';
  private isDrawerOpen: boolean = true;

  // Drawer Panel & Views DOM elements
  private drawerPanel!: HTMLElement;
  private viewCode!: HTMLElement;
  private viewAssets!: HTMLElement;
  private viewField!: HTMLElement;
  private viewTerminal!: HTMLElement;
  private drawerPanelTitle!: HTMLElement;
  private drawerPanelIcon!: HTMLElement;
  private drawerTermLog!: HTMLElement;

  // Floating Terminal DOM elements
  private floatingTerminal!: HTMLElement;
  private floatingTermLog!: HTMLElement;
  private isFloatingTermOpen: boolean = false;

  // Telemetry Panel toggle state
  private telemetryPanel!: HTMLElement;
  private isTelemetryOpen: boolean = true;

  // Telemetry DOM elements
  private telemPosX!: HTMLElement;
  private telemYaw!: HTMLElement;
  private telemMotorA!: HTMLElement;
  private telemMotorB!: HTMLElement;
  private telemColorC!: HTMLElement;
  private telemColorD!: HTMLElement;
  private telemDist!: HTMLElement;
  private telemFps!: HTMLElement;

  // Spawn pose configuration elements
  private spawnInputX!: HTMLInputElement;
  private spawnInputZ!: HTMLInputElement;
  private spawnInputYaw!: HTMLInputElement;

  // Sandbox Mode UI elements
  private modeSelect!: HTMLSelectElement;
  private sandboxToolbar!: HTMLElement;
  private btnToggleTool!: HTMLButtonElement;
  private btnSpawnBlock!: HTMLButtonElement;
  private btnToggleDyno!: HTMLButtonElement;
  private btnResetMission!: HTMLButtonElement;
  private missionScoreText!: HTMLElement;

  // Mission Asset Drawer UI elements
  private drawerElementsList!: HTMLElement;
  private assetCountBadge!: HTMLElement;
  private missionElementsData: Array<{
    id: string;
    name: string;
    description: string;
    sourceFile?: string;
    isPlacedOnField?: boolean;
    position: { x: number; y: number; z: number };
    yawDegrees: number;
    isCustom?: boolean;
  }> = [];

  private isToolActive = true;
  private isDynoActive = false;
  private seasonMissionsStatus: Array<{
    spec: SeasonMissionSpec;
    isLoaded: boolean;
    isLoading: boolean;
  }> = [];

  private matchSeconds = 150; // 2:30 match timer
  private matchTimerRunning = false;

  private scriptTabs: Array<{ id: string; title: string; code: string }> = [
    { id: 'tab-1', title: 'Mission 1', code: SAMPLE_MISSIONS.drive_straight.code },
  ];
  private activeTabIndex: number = 0;
  private readonly SCRIPT_STORAGE_KEY = 'fll_sim_user_scripts_v1';

  constructor(container: HTMLElement, callbacks: HudCallbacks) {
    this.callbacks = callbacks;
    this.loadScriptTabsFromStorage();
    this.rootElement = document.createElement('div');
    this.rootElement.className = 'fll-hud-root';
    container.appendChild(this.rootElement);

    this.render();
    this.setupEvents();
    this.startMatchTimer();
  }

  private render(): void {
    this.rootElement.innerHTML = `
      <!-- Top Navigation Bar -->
      <header class="hud-topbar">
        <div class="hud-brand">
          <span class="hud-logo">🤖</span>
          <span class="hud-title">FLL Robot Simulator</span>
          <span class="hud-badge">SPIKE Prime</span>
          <div class="status-indicator">
            <span class="status-dot status-idle" id="exec-status-dot"></span>
            <span id="exec-status-text">IDLE</span>
          </div>
        </div>

        <div class="hud-top-center">
          <div class="hud-timer-card">
            <span class="timer-label">MATCH TIMER</span>
            <span class="timer-value" id="hud-match-timer">02:30</span>
          </div>
          <div class="hud-camera-buttons">
            <button class="btn btn-sm btn-outline active" data-cam="ISO">📐 3D Iso</button>
            <button class="btn btn-sm btn-outline" data-cam="TOP_DOWN">🗺️ Top-Down</button>
            <button class="btn btn-sm btn-outline" data-cam="FOLLOW">🎥 Follow</button>
          </div>
          <div class="hud-focus-container">
            <label for="camera-focus-select" class="hud-label-inline">🔍 Focus:</label>
            <select id="camera-focus-select" class="hud-select hud-select-sm" title="Focus camera view on robot, mat center, or any mission model">
              <option value="robot" selected>🤖 Robot</option>
              <option value="center">🎯 Field Center</option>
            </select>
          </div>
        </div>

        <div class="hud-top-right">
          <button id="btn-topbar-run" class="btn btn-sm btn-primary" title="Run Active Python Script">▶ RUN</button>
          <button id="btn-topbar-stop" class="btn btn-sm btn-danger" disabled title="Stop Execution">⏹ STOP</button>
          <button class="btn btn-sm btn-outline" id="btn-toggle-floating-terminal" title="Toggle Floating Debug Terminal Window">📟 Terminal</button>
          <button class="btn btn-sm btn-outline" id="btn-toggle-telemetry" title="Toggle Live Telemetry Card">📡 Telemetry</button>
          <button class="btn btn-sm btn-outline" id="btn-topbar-inspector" title="Open LEGO CAD Model Inspector & Diagnostic Validator">🔬 CAD Inspector</button>
        </div>
      </header>

      <!-- Left Activity Bar (Fixed 48px vertical bar) -->
      <nav class="hud-activity-bar">
        <button class="activity-btn active" id="act-btn-code" title="💻 Python Code Editor" data-view="code">
          <span class="act-icon">💻</span>
          <span class="act-label">Code</span>
        </button>
        <button class="activity-btn" id="act-btn-assets" title="📦 Mission Asset Library & Presets" data-view="assets">
          <span class="act-icon">📦</span>
          <span class="act-label">Assets</span>
          <span class="act-badge" id="asset-count-badge">3</span>
        </button>
        <button class="activity-btn" id="act-btn-field" title="⚙️ Field & Simulation Setup" data-view="field">
          <span class="act-icon">⚙️</span>
          <span class="act-label">Field</span>
        </button>
        <button class="activity-btn" id="act-btn-terminal" title="📟 Debug Terminal & Logs" data-view="terminal">
          <span class="act-icon">📟</span>
          <span class="act-label">Terminal</span>
        </button>
        <div class="act-spacer"></div>
        <button class="activity-btn" id="act-btn-cad" title="🔬 LEGO CAD Model Inspector & Step Debugger">
          <span class="act-icon">🔬</span>
          <span class="act-label">CAD</span>
        </button>
      </nav>

      <!-- Left Resizable Multi-Job Drawer Panel -->
      <aside class="hud-drawer-panel" id="hud-drawer-panel">
        <div class="drawer-panel-header">
          <div class="drawer-panel-title-group">
            <span class="drawer-panel-icon" id="drawer-panel-icon">💻</span>
            <span class="drawer-panel-title" id="drawer-panel-title">Python Code Editor</span>
          </div>
          <div class="drawer-panel-header-actions">
            <button class="btn btn-xs btn-outline" id="btn-minimize-drawer" title="Minimize Drawer (or click active icon)">◀</button>
          </div>
        </div>

        <!-- View 1: Python Code Editor -->
        <div class="drawer-view-content" id="view-content-code">
          <div class="mission-select-container">
            <label for="mission-select">Sample Mission:</label>
            <select id="mission-select" class="hud-select">
              <option value="drive_straight">Mission 1: Drive Straight (30 cm)</option>
              <option value="gyro_turn">Mission 2: Gyro 90° Turn</option>
              <option value="line_follower">Mission 3: Proportional Line Follower</option>
              <option value="line_squaring">Mission 4: Dual-Sensor Line Squaring</option>
            </select>
          </div>

          <div class="script-tabs-bar">
            <div class="script-tabs-list" id="script-tabs-list"></div>
            <button class="btn btn-xs btn-outline btn-new-tab" id="btn-new-tab" title="Create a new blank script page">➕ New Script</button>
          </div>

          <div class="code-editor-container">
            <textarea id="python-code-editor" spellcheck="false"></textarea>
          </div>

          <div class="hud-action-bar">
            <button id="btn-run" class="btn btn-primary">▶ RUN</button>
            <button id="btn-stop" class="btn btn-danger" disabled>⏹ STOP</button>
            <button id="btn-reset" class="btn btn-warning">↺ RESET</button>
          </div>

          <div class="console-card">
            <div class="console-title-bar">
              <span>ROBOT CONSOLE PREVIEW</span>
              <button class="btn btn-xs btn-ghost" id="btn-open-terminal-from-preview" title="Open full floating terminal">📟 Pop Out ↗</button>
            </div>
            <div id="console-output" class="console-text">System ready. Select a mission or write Python code, then click RUN.</div>
          </div>
        </div>

        <!-- View 2: Mission Asset Library -->
        <div class="drawer-view-content" id="view-content-assets" style="display: none;">
          <div class="drawer-toolbar">
            <label class="btn btn-sm btn-primary file-upload-btn w-100">
              ➕ Import Mission Model (.io / .ldr)
              <input type="file" id="mission-cad-file-input" accept=".io,.ldr,.mpd,.dat" style="display: none;">
            </label>
            <div class="drawer-preset-container">
              <label for="select-mission-preset" class="drawer-preset-label">🎯 Mission Preset:</label>
              <div class="drawer-preset-controls">
                <select id="select-mission-preset" class="hud-select hud-select-sm flex-1">
                  <option value="" disabled selected>Select preset...</option>
                  <option value="starter">⚡ Starter Test (Missions 1, 2, 3)</option>
                  <option value="m1_only">🎯 Mission 1 Only (Drone Survey)</option>
                  <option value="m2_only">🎯 Mission 2 Only (Exploding Seeds)</option>
                  <option value="m3_only">🎯 Mission 3 Only (Flip the Rock)</option>
                  <option value="north">🧭 North Zone (Missions 1 - 4)</option>
                  <option value="all">🌟 All 13 Official Missions</option>
                  <option value="clear">🧹 Clear All Models</option>
                </select>
                <button class="btn btn-sm btn-secondary" id="btn-apply-mission-preset" title="Load selected mission preset">Load</button>
              </div>
            </div>
            <button class="btn btn-sm btn-outline w-100" id="btn-drawer-reset-all">🔄 Reset All Elements to Idle</button>
          </div>

          <div class="drawer-content" id="drawer-elements-list">
            <!-- Populated dynamically with element cards and season catalog -->
          </div>

          <div class="drawer-footer-hint">
            💡 <strong>Tip:</strong> Click & drag mission elements directly on the mat! Use <strong>mouse wheel</strong> or press <strong>R</strong> to rotate.
          </div>
        </div>

        <!-- View 3: Field & Simulation Setup -->
        <div class="drawer-view-content" id="view-content-field" style="display: none;">
          <div class="field-settings-scroll">
            <div class="settings-card">
              <div class="settings-card-title">🎯 Simulation Mode</div>
              <select id="mode-select" class="hud-select w-100">
                <option value="ARENA" selected>🏟️ Competition Arena</option>
                <option value="SANDBOX_RISER">🔬 Sandbox: 4-Axle Riser</option>
                <option value="SANDBOX_DIAL">🔬 Sandbox: Rotary Dial</option>
                <option value="SANDBOX_CASCADE">🔬 Sandbox: Multi-Gear Cascade</option>
              </select>
            </div>

            <div class="settings-card">
              <div class="settings-card-title">🗺️ Competition Field Mat</div>
              <select id="map-select" class="hud-select w-100">
                <option value="numbered" selected>Numbered Field Mat (BioGlow)</option>
                <option value="grid">Grid Playing Field Mat</option>
                <option value="procedural">Procedural FLL Mat</option>
              </select>
            </div>

            <div class="settings-card">
              <div class="settings-card-title">🤖 Robot Hardware CAD</div>
              <p class="settings-card-desc">Import official SPIKE Prime Studio (.io) or LDraw (.ldr) build.</p>
              <label class="btn btn-sm btn-secondary file-upload-btn w-100" title="Import robot CAD model (.io / .ldr)">
                📂 Import Robot Model (.io)
                <input type="file" id="cad-file-input" accept=".io,.ldr,.mpd" style="display: none;">
              </label>
            </div>

            <div class="settings-card">
              <div class="settings-card-title">📍 Robot Spawn Position & Presets</div>
              <div class="spawn-inputs-row">
                <div class="spawn-input-group">
                  <label for="spawn-x">X (m)</label>
                  <input type="number" id="spawn-x" step="0.05" value="-0.80">
                </div>
                <div class="spawn-input-group">
                  <label for="spawn-z">Z (m)</label>
                  <input type="number" id="spawn-z" step="0.05" value="0.32">
                </div>
                <div class="spawn-input-group">
                  <label for="spawn-yaw">Yaw (°)</label>
                  <input type="number" id="spawn-yaw" step="5" value="90">
                </div>
              </div>
              <div class="spawn-rotate-row">
                <span class="rotate-label">Heading:</span>
                <button class="btn btn-xs btn-outline" data-rot-step="-45">⟲ -45°</button>
                <button class="btn btn-xs btn-outline" data-rot-step="-15">⟲ -15°</button>
                <button class="btn btn-xs btn-outline" data-rot-step="15">⟳ +15°</button>
                <button class="btn btn-xs btn-outline" data-rot-step="45">⟳ +45°</button>
              </div>
              <div class="spawn-heading-chips">
                <button class="btn btn-xs btn-ghost" data-rot-preset="0">0° N</button>
                <button class="btn btn-xs btn-ghost" data-rot-preset="90">90° E</button>
                <button class="btn btn-xs btn-ghost" data-rot-preset="180">180° S</button>
                <button class="btn btn-xs btn-ghost" data-rot-preset="270">270° W</button>
              </div>
              <div class="spawn-actions-row">
                <button class="btn btn-xs btn-primary" id="btn-move-pose">🚀 Move Robot</button>
                <button class="btn btn-xs btn-outline" id="btn-capture-pose">📌 Set as Start</button>
              </div>
              <div class="spawn-presets-row">
                <button class="btn btn-xs btn-outline" data-spawn-preset="red">🚩 Red Arc</button>
                <button class="btn btn-xs btn-outline" data-spawn-preset="blue">🔷 Blue Arc</button>
                <button class="btn btn-xs btn-outline" data-spawn-preset="center">🎯 Center</button>
              </div>
            </div>

            <div class="settings-card">
              <div class="settings-card-title">🔬 Sandbox Workbench Tools</div>
              <div class="settings-btn-col">
                <button class="btn btn-sm btn-outline active" id="btn-toggle-tool">🖐️ Pusher Tool: ON</button>
                <button class="btn btn-sm btn-outline" id="btn-spawn-block">🧱 Drop Test Block</button>
                <button class="btn btn-sm btn-outline" id="btn-toggle-dyno">🔒 Robot Dyno: OFF</button>
                <button class="btn btn-sm btn-outline" id="btn-reset-mission">↺ Reset Mission</button>
              </div>
            </div>
          </div>
        </div>

        <!-- View 4: Full-Height Debug Terminal View -->
        <div class="drawer-view-content" id="view-content-terminal" style="display: none;">
          <div class="terminal-drawer-toolbar">
            <span class="terminal-status-chip">● LIVE CONSOLE</span>
            <div class="terminal-drawer-actions">
              <button class="btn btn-xs btn-outline" id="btn-drawer-term-clear">🧹 Clear</button>
              <button class="btn btn-xs btn-secondary" id="btn-popout-terminal" title="Pop out into floating window">🗗 Pop Out</button>
            </div>
          </div>
          <div id="terminal-drawer-log" class="terminal-log-area">
            <div><span style="color: #64748b;">[INIT]</span> Robot terminal ready. Standard output and execution logs stream here.</div>
          </div>
        </div>

        <!-- Resizer handle on right edge -->
        <div class="hud-panel-resizer" id="hud-panel-resizer" title="Drag to resize panel"></div>
      </aside>

      <!-- Floating Debug Terminal Window -->
      <div class="hud-floating-terminal" id="hud-floating-terminal" style="display: none;">
        <div class="floating-terminal-header" id="floating-terminal-header">
          <div class="floating-terminal-title">
            <span>📟 Robot Debug Terminal</span>
          </div>
          <div class="floating-terminal-actions">
            <button class="btn btn-xs btn-outline" id="btn-float-term-clear" title="Clear console output">🧹 Clear</button>
            <button class="btn btn-xs btn-outline" id="btn-float-term-close" title="Close floating terminal">✖</button>
          </div>
        </div>
        <div class="floating-terminal-body" id="floating-terminal-log">
          <div><span style="color: #64748b;">[SYSTEM]</span> Debug terminal ready. Live output will stream here.</div>
        </div>
      </div>

      <!-- Floating Sandbox Action Toolbar -->
      <div class="hud-sandbox-toolbar" id="sandbox-toolbar" style="display: none;">
        <span class="sandbox-badge">🔬 SANDBOX WORKBENCH</span>
        <div class="mission-status-chip">
          <span class="chip-label">STATUS:</span>
          <span class="chip-val" id="mission-score-text">UNSOLVED (0%)</span>
        </div>
      </div>

      <!-- Bottom-Right Telemetry Card -->
      <div class="hud-telemetry-panel" id="hud-telemetry-panel">
        <div class="telem-header">
          <span>📡 LIVE TELEMETRY</span>
          <span id="telem-fps" class="fps-badge">60 FPS</span>
        </div>
        <div class="telem-grid">
          <div class="telem-item">
            <span class="label">Position (X, Z)</span>
            <span class="value" id="telem-pos">0.00m, 0.00m</span>
          </div>
          <div class="telem-item">
            <span class="label">Heading (Yaw)</span>
            <span class="value highlight" id="telem-yaw">0.0°</span>
          </div>
          <div class="telem-item">
            <span class="label">Motor Left [A]</span>
            <span class="value" id="telem-motor-a">0° (0 deg/s)</span>
          </div>
          <div class="telem-item">
            <span class="label">Motor Right [B]</span>
            <span class="value" id="telem-motor-b">0° (0 deg/s)</span>
          </div>
          <div class="telem-item">
            <span class="label">Color Sensor [C]</span>
            <span class="value" id="telem-color-c">Refl: 0% [white]</span>
          </div>
          <div class="telem-item">
            <span class="label">Color Sensor [D]</span>
            <span class="value" id="telem-color-d">Refl: 0% [white]</span>
          </div>
          <div class="telem-item">
            <span class="label">Ultrasonic Dist</span>
            <span class="value" id="telem-dist">-- cm</span>
          </div>
        </div>
      </div>
    `;

    // Cache elements
    this.codeTextarea = this.rootElement.querySelector('#python-code-editor')!;
    this.consoleOutput = this.rootElement.querySelector('#console-output')!;
    this.statusBadge = this.rootElement.querySelector('#exec-status-text')!;
    this.timerDisplay = this.rootElement.querySelector('#hud-match-timer')!;
    this.runBtn = this.rootElement.querySelector('#btn-run')!;
    this.stopBtn = this.rootElement.querySelector('#btn-stop')!;
    this.topbarRunBtn = this.rootElement.querySelector('#btn-topbar-run')!;
    this.topbarStopBtn = this.rootElement.querySelector('#btn-topbar-stop')!;

    // Drawer and view elements
    this.drawerPanel = this.rootElement.querySelector('#hud-drawer-panel')!;
    this.viewCode = this.rootElement.querySelector('#view-content-code')!;
    this.viewAssets = this.rootElement.querySelector('#view-content-assets')!;
    this.viewField = this.rootElement.querySelector('#view-content-field')!;
    this.viewTerminal = this.rootElement.querySelector('#view-content-terminal')!;
    this.drawerPanelTitle = this.rootElement.querySelector('#drawer-panel-title')!;
    this.drawerPanelIcon = this.rootElement.querySelector('#drawer-panel-icon')!;
    this.drawerTermLog = this.rootElement.querySelector('#terminal-drawer-log')!;

    // Floating Terminal elements
    this.floatingTerminal = this.rootElement.querySelector('#hud-floating-terminal')!;
    this.floatingTermLog = this.rootElement.querySelector('#floating-terminal-log')!;
    this.telemetryPanel = this.rootElement.querySelector('#hud-telemetry-panel')!;

    this.telemPosX = this.rootElement.querySelector('#telem-pos')!;
    this.telemYaw = this.rootElement.querySelector('#telem-yaw')!;
    this.telemMotorA = this.rootElement.querySelector('#telem-motor-a')!;
    this.telemMotorB = this.rootElement.querySelector('#telem-motor-b')!;
    this.telemColorC = this.rootElement.querySelector('#telem-color-c')!;
    this.telemColorD = this.rootElement.querySelector('#telem-color-d')!;
    this.telemDist = this.rootElement.querySelector('#telem-dist')!;
    this.telemFps = this.rootElement.querySelector('#telem-fps')!;

    this.spawnInputX = this.rootElement.querySelector('#spawn-x')!;
    this.spawnInputZ = this.rootElement.querySelector('#spawn-z')!;
    this.spawnInputYaw = this.rootElement.querySelector('#spawn-yaw')!;

    this.modeSelect = this.rootElement.querySelector('#mode-select')!;
    this.sandboxToolbar = this.rootElement.querySelector('#sandbox-toolbar')!;
    this.btnToggleTool = this.rootElement.querySelector('#btn-toggle-tool')!;
    this.btnSpawnBlock = this.rootElement.querySelector('#btn-spawn-block')!;
    this.btnToggleDyno = this.rootElement.querySelector('#btn-toggle-dyno')!;
    this.btnResetMission = this.rootElement.querySelector('#btn-reset-mission')!;
    this.missionScoreText = this.rootElement.querySelector('#mission-score-text')!;

    this.drawerElementsList = this.rootElement.querySelector('#drawer-elements-list')!;
    this.assetCountBadge = this.rootElement.querySelector('#asset-count-badge')!;

    // Set initial sample code
    this.codeTextarea.value = this.scriptTabs[0].code;
  }

  private setupEvents(): void {
    // 1. Script Tabs and Code Editor bindings
    this.renderScriptTabs();

    const btnNewTab = this.rootElement.querySelector('#btn-new-tab') as HTMLButtonElement | null;
    btnNewTab?.addEventListener('click', () => {
      this.addNewScriptTab();
    });

    this.codeTextarea.addEventListener('input', () => {
      if (this.scriptTabs[this.activeTabIndex]) {
        this.scriptTabs[this.activeTabIndex].code = this.codeTextarea.value;
      }
      this.saveScriptTabsToStorage();
    });

    // 2. Camera Focus Dropdown
    const cameraFocusSelect = this.rootElement.querySelector('#camera-focus-select') as HTMLSelectElement | null;
    cameraFocusSelect?.addEventListener('change', () => {
      const val = cameraFocusSelect.value;
      if (val === 'robot' || val === 'center') {
        this.callbacks.onFocusTarget?.(val);
      } else if (val) {
        this.callbacks.onElementFocus?.(val);
      }
    });

    // Mission dropdown change
    const missionSelect = this.rootElement.querySelector('#mission-select') as HTMLSelectElement;
    missionSelect.addEventListener('change', () => {
      const selected = SAMPLE_MISSIONS[missionSelect.value];
      if (selected) {
        this.codeTextarea.value = selected.code;
        if (this.scriptTabs[this.activeTabIndex]) {
          this.scriptTabs[this.activeTabIndex].code = selected.code;
          this.scriptTabs[this.activeTabIndex].title = selected.title.split(':')[0].trim();
        }
        this.renderScriptTabs();
        this.saveScriptTabsToStorage();
        this.logConsole(`Loaded ${selected.title}`);
      }
    });

    // Competition Mat dropdown change
    const mapSelect = this.rootElement.querySelector('#map-select') as HTMLSelectElement | null;
    if (mapSelect) {
      mapSelect.addEventListener('change', () => {
        const val = mapSelect.value as MatMapType;
        this.callbacks.onMapChange?.(val);
        this.logConsole(`Switched competition mat to: ${mapSelect.options[mapSelect.selectedIndex].text}`);
      });
    }

    // Run button
    this.runBtn.addEventListener('click', () => {
      this.setExecutionState('RUNNING');
      if (this.scriptTabs[this.activeTabIndex]) {
        this.scriptTabs[this.activeTabIndex].code = this.codeTextarea.value;
      }
      this.callbacks.onRunScript(this.codeTextarea.value);
    });

    // Stop button
    this.stopBtn.addEventListener('click', () => {
      this.setExecutionState('IDLE');
      this.callbacks.onStopScript();
      this.logConsole('Execution stopped by user.');
    });

    // Reset button
    const resetBtn = this.rootElement.querySelector('#btn-reset')!;
    resetBtn.addEventListener('click', () => {
      this.setExecutionState('IDLE');
      this.callbacks.onStopScript();
      this.callbacks.onResetRobot();
      this.resetMatchTimer();
      this.logConsole('Robot reset to Launch Area.');
    });

    // Camera preset buttons
    const camButtons = this.rootElement.querySelectorAll('.hud-camera-buttons button');
    camButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        camButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const preset = btn.getAttribute('data-cam') as CameraViewPreset;
        this.callbacks.onCameraChange(preset);
      });
    });

    // File upload
    const fileInput = this.rootElement.querySelector('#cad-file-input') as HTMLInputElement;
    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files[0]) {
        this.callbacks.onImportFile(fileInput.files[0]);
      }
    });

    // Spawn pose inputs change listener
    const handleSpawnChange = () => {
      const pose = this.getSpawnPose();
      this.callbacks.onSpawnPoseChange?.(pose);
    };
    this.spawnInputX.addEventListener('input', handleSpawnChange);
    this.spawnInputZ.addEventListener('input', handleSpawnChange);
    this.spawnInputYaw.addEventListener('input', handleSpawnChange);

    // Enter key inside inputs moves robot immediately
    const handleMoveToInputs = () => {
      const pose = this.getSpawnPose();
      this.setExecutionState('IDLE');
      this.callbacks.onMoveRobotToPose?.(pose, `Position (X=${pose.x.toFixed(2)}m, Z=${pose.z.toFixed(2)}m, Yaw=${pose.yawDegrees.toFixed(1)}°)`);
    };

    [this.spawnInputX, this.spawnInputZ, this.spawnInputYaw].forEach((input) => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          handleMoveToInputs();
        }
      });
    });

    const btnMovePose = this.rootElement.querySelector('#btn-move-pose');
    btnMovePose?.addEventListener('click', handleMoveToInputs);

    // Capture current position button
    const btnCapture = this.rootElement.querySelector('#btn-capture-pose');
    btnCapture?.addEventListener('click', () => {
      this.callbacks.onCaptureCurrentPose?.();
    });

    // Preset spawn buttons: immediately stop running program and relocate robot
    const presetBtns = this.rootElement.querySelectorAll('[data-spawn-preset]');
    presetBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = btn.getAttribute('data-spawn-preset');
        let pose: SpawnPose;
        let label = '';
        if (preset === 'red') {
          pose = { x: -0.80, y: 0.035, z: 0.32, yawDegrees: 90 };
          label = 'Red Launch Arc (Left)';
        } else if (preset === 'blue') {
          pose = { x: 0.80, y: 0.035, z: 0.32, yawDegrees: -90 };
          label = 'Blue Launch Arc (Right)';
        } else if (preset === 'center') {
          pose = { x: 0.00, y: 0.035, z: 0.00, yawDegrees: 0 };
          label = 'Field Center';
        } else {
          return;
        }
        this.setSpawnPose(pose);
        this.setExecutionState('IDLE');
        this.callbacks.onMoveRobotToPose?.(pose, label);
      });
    });

    // Heading quick-rotate step buttons (⟲ -45°, ⟲ -15°, ⟳ +15°, ⟳ +45°)
    const rotStepBtns = this.rootElement.querySelectorAll('[data-rot-step]');
    rotStepBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const step = parseFloat(btn.getAttribute('data-rot-step') || '0');
        const curPose = this.getSpawnPose();
        let newYaw = (curPose.yawDegrees + step) % 360;
        if (newYaw > 180) newYaw -= 360;
        if (newYaw < -180) newYaw += 360;
        newYaw = Math.round(newYaw);
        this.spawnInputYaw.value = newYaw.toString();
        const updatedPose = { ...curPose, yawDegrees: newYaw };
        this.callbacks.onMoveRobotToPose?.(updatedPose, `Rotated to heading ${newYaw}°`);
      });
    });

    // Heading preset chips (0° N, 90° E, 180° S, 270° W)
    const rotPresetBtns = this.rootElement.querySelectorAll('[data-rot-preset]');
    rotPresetBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const presetYaw = parseFloat(btn.getAttribute('data-rot-preset') || '0');
        const curPose = this.getSpawnPose();
        this.spawnInputYaw.value = presetYaw.toString();
        const updatedPose = { ...curPose, yawDegrees: presetYaw };
        this.callbacks.onMoveRobotToPose?.(updatedPose, `Aligned heading to ${presetYaw}°`);
      });
    });

    // Topbar Quick Run & Stop Buttons
    this.topbarRunBtn?.addEventListener('click', () => {
      this.runBtn.click();
    });
    this.topbarStopBtn?.addEventListener('click', () => {
      this.stopBtn.click();
    });

    // Activity Bar View Switching
    const actBtns = this.rootElement.querySelectorAll('.activity-btn[data-view]');
    actBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const view = btn.getAttribute('data-view') as 'code' | 'assets' | 'field' | 'terminal';
        if (view === this.activeView && this.isDrawerOpen) {
          this.toggleDrawer(false);
        } else {
          this.setActiveDrawerJob(view);
        }
      });
    });

    // Activity Bar CAD Inspector Button
    const actBtnCad = this.rootElement.querySelector('#act-btn-cad');
    actBtnCad?.addEventListener('click', () => {
      this.callbacks.onOpenInspector?.('M01');
    });

    // Drawer Minimize Button
    const btnMinimize = this.rootElement.querySelector('#btn-minimize-drawer');
    btnMinimize?.addEventListener('click', () => {
      this.toggleDrawer(false);
    });

    // Drawer Resizer Drag Handler
    const resizer = this.rootElement.querySelector('#hud-panel-resizer') as HTMLElement | null;
    if (resizer) {
      let isResizing = false;
      resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
      });

      window.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const newWidth = Math.max(320, Math.min(800, e.clientX - 48));
        this.drawerPanel.style.width = `${newWidth}px`;
      });

      window.addEventListener('mouseup', () => {
        if (isResizing) {
          isResizing = false;
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
        }
      });
    }

    // Floating Terminal Window Toggles & Actions
    const btnToggleFloatingTerm = this.rootElement.querySelector('#btn-toggle-floating-terminal');
    btnToggleFloatingTerm?.addEventListener('click', () => {
      this.toggleFloatingTerminal();
    });

    const btnPopoutFromPreview = this.rootElement.querySelector('#btn-open-terminal-from-preview');
    btnPopoutFromPreview?.addEventListener('click', () => {
      this.toggleFloatingTerminal(true);
    });

    const btnPopoutFromDrawer = this.rootElement.querySelector('#btn-popout-terminal');
    btnPopoutFromDrawer?.addEventListener('click', () => {
      this.toggleFloatingTerminal(true);
    });

    const btnFloatTermClose = this.rootElement.querySelector('#btn-float-term-close');
    btnFloatTermClose?.addEventListener('click', () => {
      this.toggleFloatingTerminal(false);
    });

    const btnFloatTermClear = this.rootElement.querySelector('#btn-float-term-clear');
    btnFloatTermClear?.addEventListener('click', () => {
      if (this.floatingTermLog) this.floatingTermLog.innerHTML = '';
    });

    const btnDrawerTermClear = this.rootElement.querySelector('#btn-drawer-term-clear');
    btnDrawerTermClear?.addEventListener('click', () => {
      if (this.drawerTermLog) this.drawerTermLog.innerHTML = '';
    });

    // Dragging Floating Terminal
    const floatHeader = this.rootElement.querySelector('#floating-terminal-header') as HTMLElement | null;
    if (floatHeader && this.floatingTerminal) {
      let isDragging = false;
      let startX = 0, startY = 0, initLeft = 0, initTop = 0;
      floatHeader.addEventListener('mousedown', (e) => {
        if ((e.target as HTMLElement).tagName === 'BUTTON') return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = this.floatingTerminal.getBoundingClientRect();
        initLeft = rect.left;
        initTop = rect.top;
        this.floatingTerminal.style.right = 'auto';
        this.floatingTerminal.style.bottom = 'auto';
        this.floatingTerminal.style.left = `${initLeft}px`;
        this.floatingTerminal.style.top = `${initTop}px`;
        e.preventDefault();
      });

      window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        this.floatingTerminal.style.left = `${Math.max(10, initLeft + dx)}px`;
        this.floatingTerminal.style.top = `${Math.max(50, initTop + dy)}px`;
      });

      window.addEventListener('mouseup', () => {
        isDragging = false;
      });
    }

    // Telemetry Panel Toggle
    const btnToggleTelem = this.rootElement.querySelector('#btn-toggle-telemetry');
    btnToggleTelem?.addEventListener('click', () => {
      this.toggleTelemetryPanel();
    });

    // Mode dropdown change
    this.modeSelect.addEventListener('change', () => {
      const mode = this.modeSelect.value as SimulatorAppMode;
      this.setMode(mode);
      this.callbacks.onModeChange?.(mode);
      this.logConsole(`Switched simulator mode to: ${this.modeSelect.options[this.modeSelect.selectedIndex].text}`);
    });

    // Toggle Pusher Tool
    this.btnToggleTool.addEventListener('click', () => {
      this.isToolActive = !this.isToolActive;
      this.setPusherActive(this.isToolActive);
      this.callbacks.onTogglePusherTool?.(this.isToolActive);
      this.logConsole(`Mouse Pusher Tool: ${this.isToolActive ? 'ENABLED' : 'DISABLED'}`);
    });

    // Spawn Test Block
    this.btnSpawnBlock.addEventListener('click', () => {
      this.callbacks.onSpawnTestBlock?.();
      this.logConsole('Spawned dynamic LEGO test block on workbench.');
    });

    // Toggle Robot Dyno Mode
    this.btnToggleDyno.addEventListener('click', () => {
      this.isDynoActive = !this.isDynoActive;
      this.setDynoActive(this.isDynoActive);
      this.callbacks.onToggleDynoMode?.(this.isDynoActive);
      this.logConsole(`Robot Dyno Jig Mode: ${this.isDynoActive ? 'LOCKED STATIONARY (Chassis Pinned)' : 'RELEASED (Normal Driving)'}`);
    });

    // Reset Mission Model
    this.btnResetMission.addEventListener('click', () => {
      this.callbacks.onResetMission?.();
      this.logConsole('Mission model reset to starting state.');
    });
  }

  private startMatchTimer(): void {
    setInterval(() => {
      if (this.matchTimerRunning && this.matchSeconds > 0) {
        this.matchSeconds--;
        const mins = Math.floor(this.matchSeconds / 60).toString().padStart(2, '0');
        const secs = (this.matchSeconds % 60).toString().padStart(2, '0');
        this.timerDisplay.textContent = `${mins}:${secs}`;
      }
    }, 1000);
  }

  public resetMatchTimer(): void {
    this.matchSeconds = 150;
    this.matchTimerRunning = false;
    this.timerDisplay.textContent = '02:30';
  }

  public updateTelemetry(state: TelemetryState): void {
    this.telemPosX.textContent = `${state.robot.x.toFixed(2)}m, ${state.robot.z.toFixed(2)}m`;
    this.telemYaw.textContent = `${state.robot.yawDegrees.toFixed(1)}°`;

    this.telemMotorA.textContent = `${state.motors.left.degrees}° (${state.motors.left.speed} d/s)`;
    this.telemMotorB.textContent = `${state.motors.right.degrees}° (${state.motors.right.speed} d/s)`;

    this.telemColorC.textContent = `${state.sensors.colorC.reflectedLight}% [${state.sensors.colorC.color}]`;
    this.telemColorD.textContent = `${state.sensors.colorD.reflectedLight}% [${state.sensors.colorD.color}]`;

    this.telemDist.textContent = `${state.sensors.distanceCm} cm`;
    this.telemFps.textContent = `${Math.round(state.fps)} FPS • ${Math.round(state.physicsHz)} Hz`;
  }

  public getSpawnPose(): SpawnPose {
    const x = parseFloat(this.spawnInputX.value) || 0;
    const z = parseFloat(this.spawnInputZ.value) || 0;
    const yaw = parseFloat(this.spawnInputYaw.value) || 0;
    return { x, y: 0.035, z, yawDegrees: yaw };
  }

  public setSpawnPose(pose: Partial<SpawnPose>): void {
    if (pose.x !== undefined) this.spawnInputX.value = pose.x.toFixed(2);
    if (pose.z !== undefined) this.spawnInputZ.value = pose.z.toFixed(2);
    if (pose.yawDegrees !== undefined) this.spawnInputYaw.value = pose.yawDegrees.toFixed(1);
  }

  public setMode(mode: SimulatorAppMode): void {
    this.modeSelect.value = mode;
    if (mode === 'ARENA') {
      this.sandboxToolbar.style.display = 'none';
    } else {
      this.sandboxToolbar.style.display = 'flex';
    }
  }

  public setPusherActive(active: boolean): void {
    this.isToolActive = active;
    if (active) {
      this.btnToggleTool.classList.add('active');
      this.btnToggleTool.textContent = '🖐️ Pusher Tool: ON';
    } else {
      this.btnToggleTool.classList.remove('active');
      this.btnToggleTool.textContent = '🖐️ Pusher Tool: OFF';
    }
  }

  public setDynoActive(active: boolean): void {
    this.isDynoActive = active;
    if (active) {
      this.btnToggleDyno.classList.add('active');
      this.btnToggleDyno.textContent = '🔒 Robot Dyno: ON';
    } else {
      this.btnToggleDyno.classList.remove('active');
      this.btnToggleDyno.textContent = '🔒 Robot Dyno: OFF';
    }
  }

  public isDynoModeActive(): boolean {
    return this.isDynoActive;
  }

  public updateMissionScore(score: number, solved: boolean): void {
    if (solved) {
      this.missionScoreText.textContent = `SOLVED (100%)`;
      this.missionScoreText.className = 'chip-val solved';
    } else {
      this.missionScoreText.textContent = `PROGRESS: ${score}%`;
      this.missionScoreText.className = 'chip-val';
    }
  }

  public logConsole(msg: string): void {
    const time = new Date().toLocaleTimeString();
    const entryHtml = `<div><span style="color: #64748b;">[${time}]</span> ${msg}</div>`;

    if (this.consoleOutput) {
      this.consoleOutput.innerHTML += entryHtml;
      this.consoleOutput.scrollTop = this.consoleOutput.scrollHeight;
    }
    if (this.drawerTermLog) {
      this.drawerTermLog.innerHTML += entryHtml;
      this.drawerTermLog.scrollTop = this.drawerTermLog.scrollHeight;
    }
    if (this.floatingTermLog) {
      this.floatingTermLog.innerHTML += entryHtml;
      this.floatingTermLog.scrollTop = this.floatingTermLog.scrollHeight;
    }
  }

  public setExecutionState(state: ExecutionState): void {
    const dot = this.rootElement.querySelector('#exec-status-dot')!;
    this.statusBadge.textContent = state;

    dot.className = 'status-dot';
    const isRunning = state === 'RUNNING';
    const isError = state === 'ERROR';

    if (isRunning) {
      dot.classList.add('status-running');
      this.matchTimerRunning = true;
    } else if (isError) {
      dot.classList.add('status-error');
    } else {
      dot.classList.add('status-idle');
    }

    this.runBtn.disabled = isRunning;
    this.stopBtn.disabled = !isRunning;
    if (this.topbarRunBtn) this.topbarRunBtn.disabled = isRunning;
    if (this.topbarStopBtn) this.topbarStopBtn.disabled = !isRunning;
  }

  public setActiveDrawerJob(view: 'code' | 'assets' | 'field' | 'terminal'): void {
    this.activeView = view;
    this.isDrawerOpen = true;
    this.drawerPanel.style.display = 'flex';

    // Update activity buttons
    const actBtns = this.rootElement.querySelectorAll('.activity-btn[data-view]');
    actBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-view') === view);
    });

    // Update view contents
    this.viewCode.style.display = view === 'code' ? 'flex' : 'none';
    this.viewAssets.style.display = view === 'assets' ? 'flex' : 'none';
    this.viewField.style.display = view === 'field' ? 'flex' : 'none';
    this.viewTerminal.style.display = view === 'terminal' ? 'flex' : 'none';

    // Update header title & icon
    const titles: Record<string, { icon: string; title: string }> = {
      code: { icon: '💻', title: 'Python Code Editor' },
      assets: { icon: '📦', title: 'Mission Asset Library' },
      field: { icon: '⚙️', title: 'Field & Simulation Setup' },
      terminal: { icon: '📟', title: 'Debug Console Output' },
    };
    const t = titles[view] || { icon: '⚙️', title: 'Settings' };
    this.drawerPanelIcon.textContent = t.icon;
    this.drawerPanelTitle.textContent = t.title;
  }

  public toggleDrawer(open?: boolean): void {
    this.isDrawerOpen = open !== undefined ? open : !this.isDrawerOpen;
    this.drawerPanel.style.display = this.isDrawerOpen ? 'flex' : 'none';
    const actBtns = this.rootElement.querySelectorAll('.activity-btn[data-view]');
    actBtns.forEach((btn) => {
      if (!this.isDrawerOpen) {
        btn.classList.remove('active');
      } else {
        btn.classList.toggle('active', btn.getAttribute('data-view') === this.activeView);
      }
    });
  }

  public toggleFloatingTerminal(open?: boolean): void {
    this.isFloatingTermOpen = open !== undefined ? open : !this.isFloatingTermOpen;
    this.floatingTerminal.style.display = this.isFloatingTermOpen ? 'flex' : 'none';
    const btn = this.rootElement.querySelector('#btn-toggle-floating-terminal');
    btn?.classList.toggle('active', this.isFloatingTermOpen);
  }

  public toggleTelemetryPanel(open?: boolean): void {
    this.isTelemetryOpen = open !== undefined ? open : !this.isTelemetryOpen;
    this.telemetryPanel.style.display = this.isTelemetryOpen ? 'block' : 'none';
    const btn = this.rootElement.querySelector('#btn-toggle-telemetry');
    btn?.classList.toggle('active', this.isTelemetryOpen);
  }

  public toggleAssetDrawer(open?: boolean): void {
    if (open === false) {
      if (this.activeView === 'assets' && this.isDrawerOpen) {
        this.toggleDrawer(false);
      }
    } else {
      this.setActiveDrawerJob('assets');
    }
  }

  public setMissionElements(
    elements: Array<{
      id: string;
      name: string;
      description: string;
      sourceFile?: string;
      isPlacedOnField?: boolean;
      position: { x: number; y: number; z: number };
      yawDegrees: number;
      isCustom?: boolean;
    }>,
    seasonStatus?: Array<{
      spec: SeasonMissionSpec;
      isLoaded: boolean;
      isLoading: boolean;
    }>
  ): void {
    this.missionElementsData = elements;
    if (seasonStatus) {
      this.seasonMissionsStatus = seasonStatus;
    }
    const activeCount = elements.filter((e) => e.isPlacedOnField !== false).length;
    this.assetCountBadge.textContent = activeCount.toString();
    this.renderDrawerElements();
    this.updateFocusDropdown();
  }

  public renderDrawerElements(): void {
    const loadedCardsHtml = this.missionElementsData.length === 0
      ? `<div style="color:var(--text-muted);font-size:11px;padding:6px 0;">No models on field. Use the catalog below to selectively load season missions.</div>`
      : this.missionElementsData
          .map(
            (elem) => `
          <div class="drawer-card" data-element-id="${elem.id}">
            <div class="drawer-card-header">
              <span class="card-elem-name">${elem.name}</span>
              <span class="badge ${elem.isPlacedOnField !== false ? 'badge-active' : 'badge-inactive'}">
                ${elem.isPlacedOnField !== false ? 'ON FIELD' : 'IN DRAWER'}
              </span>
            </div>
            <p class="card-elem-desc">${elem.description}${elem.sourceFile ? ` <span style="color:#38bdf8">(${elem.sourceFile})</span>` : ''}</p>
            <div class="card-actions-row">
              <button class="btn btn-xs ${elem.isPlacedOnField !== false ? 'btn-danger' : 'btn-success'}" data-action="toggle-placed" data-id="${elem.id}">
                ${elem.isPlacedOnField !== false ? '➖ Stow in Drawer' : '➕ Place on Field'}
              </button>
              <button class="btn btn-xs btn-outline" data-action="focus" data-id="${elem.id}">
                🔍 Focus
              </button>
              <button class="btn btn-xs btn-outline" data-action="inspect" data-id="${elem.id}" title="Inspect 3D CAD model & diagnostics">
                🔬 Inspect
              </button>
              ${elem.isCustom ? `<button class="btn btn-xs btn-outline text-danger" data-action="delete" data-id="${elem.id}" title="Delete element">🗑️</button>` : ''}
            </div>
            ${
              elem.isPlacedOnField !== false
                ? `
            <div class="card-transform-group">
              <div class="card-inputs-row">
                <div class="spawn-input-group">
                  <label>X (m)</label>
                  <input type="number" step="0.05" value="${elem.position.x.toFixed(2)}" data-transform="x" data-id="${elem.id}">
                </div>
                <div class="spawn-input-group">
                  <label>Z (m)</label>
                  <input type="number" step="0.05" value="${elem.position.z.toFixed(2)}" data-transform="z" data-id="${elem.id}">
                </div>
                <div class="spawn-input-group">
                  <label>Yaw (°)</label>
                  <input type="number" step="5" value="${Math.round(elem.yawDegrees)}" data-transform="yaw" data-id="${elem.id}">
                </div>
              </div>
              <div class="card-rotate-row">
                <button class="btn btn-xs btn-outline" data-action="rot-step" data-delta="-45" data-id="${elem.id}">⟲ -45°</button>
                <button class="btn btn-xs btn-outline" data-action="rot-step" data-delta="45" data-id="${elem.id}">⟳ +45°</button>
                <button class="btn btn-xs btn-outline" data-action="reset-pose" data-id="${elem.id}">↺ Reset</button>
              </div>
            </div>
            `
                : ''
            }
          </div>
        `
          )
          .join('');

    const seasonCardsHtml = this.seasonMissionsStatus.length === 0
      ? ''
      : `
        <div class="drawer-section-title">🏆 Official Season Models (${this.seasonMissionsStatus.length})</div>
        <div class="season-models-list">
          ${this.seasonMissionsStatus
            .map(
              ({ spec, isLoaded, isLoading }) => `
            <div class="season-model-card" data-season-id="${spec.id}">
              <div class="season-model-info">
                <div class="season-model-header">
                  <span class="season-badge">${spec.id}</span>
                  <span class="season-model-name" title="${spec.name}">${spec.name}</span>
                </div>
                <div class="season-model-desc">${spec.book} • ${spec.description.slice(0, 48)}...</div>
              </div>
              <div class="season-model-action">
                <button class="btn btn-xs btn-outline" data-action="inspect-season" data-id="${spec.id}" title="Inspect 3D CAD model & official render">🔬 Inspect</button>
                ${
                  isLoading
                    ? `<button class="btn btn-xs btn-outline" disabled>⏳ Loading...</button>`
                    : isLoaded
                    ? `<button class="btn btn-xs btn-outline text-success" data-action="toggle-season" data-id="${spec.id}" data-enable="false">✅ Loaded (Stow)</button>`
                    : `<button class="btn btn-xs btn-primary" data-action="toggle-season" data-id="${spec.id}" data-enable="true">➕ Load</button>`
                }
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      `;

    this.drawerElementsList.innerHTML = `
      <div class="drawer-section-title">🏟️ Active Field Elements (${this.missionElementsData.filter((e) => e.isPlacedOnField !== false).length})</div>
      <div class="drawer-loaded-list">
        ${loadedCardsHtml}
      </div>
      ${seasonCardsHtml}
    `;

    // Wire up season toggle buttons
    this.drawerElementsList.querySelectorAll('[data-action="toggle-season"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id')!;
        const enable = btn.getAttribute('data-enable') === 'true';
        this.callbacks.onToggleSeasonMission?.(id, enable);
      });
    });

    // Wire up events in the cards
    this.drawerElementsList.querySelectorAll('[data-action="toggle-placed"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id')!;
        const elem = this.missionElementsData.find((e) => e.id === id);
        if (elem) {
          const placed = elem.isPlacedOnField === false;
          elem.isPlacedOnField = placed;
          this.callbacks.onElementTogglePlaced?.(id, placed);
          this.setMissionElements(this.missionElementsData);
        }
      });
    });

    this.drawerElementsList.querySelectorAll('[data-action="focus"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id')!;
        this.callbacks.onElementFocus?.(id);
      });
    });

    this.drawerElementsList.querySelectorAll('[data-action="inspect"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id')!;
        this.callbacks.onOpenInspector?.(id);
      });
    });

    this.drawerElementsList.querySelectorAll('[data-action="inspect-season"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id')!;
        this.callbacks.onOpenInspector?.(id);
      });
    });

    this.drawerElementsList.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id')!;
        this.callbacks.onElementDelete?.(id);
      });
    });

    this.drawerElementsList.querySelectorAll('[data-action="rot-step"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id')!;
        const delta = parseFloat(btn.getAttribute('data-delta') || '0');
        const elem = this.missionElementsData.find((e) => e.id === id);
        if (elem) {
          let newYaw = Math.round((elem.yawDegrees + delta) % 360);
          if (newYaw > 180) newYaw -= 360;
          if (newYaw < -180) newYaw += 360;
          elem.yawDegrees = newYaw;
          this.callbacks.onElementTransformChange?.(id, elem.position.x, elem.position.z, newYaw);
          this.setMissionElements(this.missionElementsData);
        }
      });
    });

    this.drawerElementsList.querySelectorAll('[data-action="reset-pose"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id')!;
        const elem = this.missionElementsData.find((e) => e.id === id);
        if (elem) {
          this.callbacks.onResetMission?.();
        }
      });
    });

    this.drawerElementsList.querySelectorAll('input[data-transform]').forEach((input) => {
      input.addEventListener('change', () => {
        const inputElem = input as HTMLInputElement;
        const id = inputElem.getAttribute('data-id')!;
        const elem = this.missionElementsData.find((e) => e.id === id);
        if (elem) {
          const card = inputElem.closest('.drawer-card');
          if (card) {
            const xVal = parseFloat((card.querySelector('input[data-transform="x"]') as HTMLInputElement).value) || 0;
            const zVal = parseFloat((card.querySelector('input[data-transform="z"]') as HTMLInputElement).value) || 0;
            const yawVal = parseFloat((card.querySelector('input[data-transform="yaw"]') as HTMLInputElement).value) || 0;
            elem.position.x = xVal;
            elem.position.z = zVal;
            elem.yawDegrees = yawVal;
            this.callbacks.onElementTransformChange?.(id, xVal, zVal, yawVal);
          }
        }
      });
    });
  }

  public updateFocusDropdown(): void {
    const select = this.rootElement.querySelector('#camera-focus-select') as HTMLSelectElement | null;
    if (!select) return;

    const currentVal = select.value;
    let html = `
      <option value="robot">🤖 Robot</option>
      <option value="center">🎯 Field Center</option>
    `;

    const placedElements = this.missionElementsData.filter((e) => e.isPlacedOnField !== false);
    for (const elem of placedElements) {
      html += `<option value="${elem.id}">📦 ${elem.name}</option>`;
    }

    select.innerHTML = html;
    if (select.querySelector(`option[value="${currentVal}"]`)) {
      select.value = currentVal;
    } else {
      select.value = 'robot';
    }
  }

  public renderScriptTabs(): void {
    const list = this.rootElement.querySelector('#script-tabs-list');
    if (!list) return;

    list.innerHTML = this.scriptTabs
      .map((tab, idx) => {
        const isActive = idx === this.activeTabIndex;
        const canClose = this.scriptTabs.length > 1;
        return `
          <div class="script-tab ${isActive ? 'active' : ''}" data-tab-idx="${idx}" title="${tab.title}">
            <span class="tab-title">${tab.title}</span>
            ${canClose ? `<button class="tab-close-btn" data-close-tab="${idx}" title="Close tab">✕</button>` : ''}
          </div>
        `;
      })
      .join('');

    // Tab click handlers
    list.querySelectorAll('.script-tab').forEach((tabEl) => {
      tabEl.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('tab-close-btn')) {
          e.stopPropagation();
          const closeIdx = parseInt(target.getAttribute('data-close-tab') || '0', 10);
          this.closeScriptTab(closeIdx);
          return;
        }
        const idx = parseInt(tabEl.getAttribute('data-tab-idx') || '0', 10);
        this.switchScriptTab(idx);
      });
    });
  }

  public switchScriptTab(idx: number): void {
    if (idx < 0 || idx >= this.scriptTabs.length || idx === this.activeTabIndex) return;
    this.scriptTabs[this.activeTabIndex].code = this.codeTextarea.value;
    this.activeTabIndex = idx;
    this.codeTextarea.value = this.scriptTabs[this.activeTabIndex].code;
    this.renderScriptTabs();
    this.saveScriptTabsToStorage();
  }

  public addNewScriptTab(title?: string, initialCode?: string): void {
    this.scriptTabs[this.activeTabIndex].code = this.codeTextarea.value;
    const tabNum = this.scriptTabs.length + 1;
    const defaultCode =
      initialCode ??
      `# Custom Python Script ${tabNum}
from spike import MotorPair, ColorSensor
from spike.control import Timer

# Left motor on E, Right motor on F
drive_base = MotorPair('E', 'F') 
sensor_left = ColorSensor('C')   
sensor_right = ColorSensor('D')  

timer = Timer()
timer.reset()

print("Starting custom script ${tabNum}...")
while timer.get_time_sec() < 5:
    drive_base.start(steering=0, speed=30)

drive_base.stop()
print("Finished!")
`;

    this.scriptTabs.push({
      id: `tab-${Date.now()}`,
      title: title || `Script ${tabNum}`,
      code: defaultCode,
    });
    this.activeTabIndex = this.scriptTabs.length - 1;
    this.codeTextarea.value = this.scriptTabs[this.activeTabIndex].code;
    this.renderScriptTabs();
    this.saveScriptTabsToStorage();
    this.logConsole(`➕ Created new script page: "${this.scriptTabs[this.activeTabIndex].title}"`);
  }

  public closeScriptTab(idx: number): void {
    if (this.scriptTabs.length <= 1) return;
    this.scriptTabs.splice(idx, 1);
    if (this.activeTabIndex >= this.scriptTabs.length) {
      this.activeTabIndex = this.scriptTabs.length - 1;
    }
    this.codeTextarea.value = this.scriptTabs[this.activeTabIndex].code;
    this.renderScriptTabs();
    this.saveScriptTabsToStorage();
  }

  private loadScriptTabsFromStorage(): void {
    try {
      const raw = localStorage.getItem(this.SCRIPT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.scriptTabs = parsed;
          this.activeTabIndex = 0;
        }
      }
    } catch (e) {
      console.warn('Could not restore script tabs from localStorage:', e);
    }
  }

  private saveScriptTabsToStorage(): void {
    try {
      if (this.scriptTabs[this.activeTabIndex]) {
        this.scriptTabs[this.activeTabIndex].code = this.codeTextarea.value;
      }
      localStorage.setItem(this.SCRIPT_STORAGE_KEY, JSON.stringify(this.scriptTabs));
    } catch (e) {
      console.warn('Could not save script tabs to localStorage:', e);
    }
  }
}
