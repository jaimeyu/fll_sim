import { TelemetryState, ExecutionState } from '../runtime/types';
import { CameraViewPreset } from '../view/viewport';

export interface HudCallbacks {
  onRunScript: (script: string) => void;
  onStopScript: () => void;
  onResetRobot: () => void;
  onCameraChange: (preset: CameraViewPreset) => void;
  onImportFile: (file: File) => void;
  onMapChange?: (mapType: 'grid' | 'procedural') => void;
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

  // Telemetry DOM elements
  private telemPosX!: HTMLElement;
  private telemYaw!: HTMLElement;
  private telemMotorA!: HTMLElement;
  private telemMotorB!: HTMLElement;
  private telemColorC!: HTMLElement;
  private telemColorD!: HTMLElement;
  private telemDist!: HTMLElement;
  private telemFps!: HTMLElement;

  private matchSeconds = 150; // 2:30 match timer
  private matchTimerRunning = false;

  constructor(container: HTMLElement, callbacks: HudCallbacks) {
    this.callbacks = callbacks;
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
          <span class="hud-badge">SPIKE Prime • WebGL/Wasm</span>
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
        </div>

        <div class="hud-top-right">
          <div class="map-select-container">
            <label for="map-select" class="hud-label-inline">🗺️ Mat:</label>
            <select id="map-select" class="hud-select hud-select-sm">
              <option value="grid" selected>Official Grid Mat</option>
              <option value="procedural">Procedural FLL Mat</option>
            </select>
          </div>
          <label class="btn btn-sm btn-secondary file-upload-btn">
            📂 Import Studio .io / .ldr
            <input type="file" id="cad-file-input" accept=".io,.ldr,.mpd" style="display: none;">
          </label>
        </div>
      </header>

      <!-- Main Sidebar Panel (Left: Code & Control) -->
      <aside class="hud-sidebar">
        <div class="sidebar-header">
          <div class="mission-select-container">
            <label for="mission-select">Sample Mission:</label>
            <select id="mission-select" class="hud-select">
              <option value="drive_straight">Mission 1: Drive Straight (30 cm)</option>
              <option value="gyro_turn">Mission 2: Gyro 90° Turn</option>
              <option value="line_follower">Mission 3: Proportional Line Follower</option>
              <option value="line_squaring">Mission 4: Dual-Sensor Line Squaring</option>
            </select>
          </div>
          <div class="status-indicator">
            <span class="status-dot status-idle" id="exec-status-dot"></span>
            <span id="exec-status-text">IDLE</span>
          </div>
        </div>

        <!-- Code Editor -->
        <div class="code-editor-container">
          <textarea id="python-code-editor" spellcheck="false"></textarea>
        </div>

        <!-- Execution Action Buttons -->
        <div class="hud-action-bar">
          <button id="btn-run" class="btn btn-primary">▶ RUN</button>
          <button id="btn-stop" class="btn btn-danger" disabled>⏹ STOP</button>
          <button id="btn-reset" class="btn btn-warning">↺ RESET</button>
        </div>

        <!-- Console Log Output -->
        <div class="console-card">
          <div class="console-title">ROBOT CONSOLE OUTPUT</div>
          <div id="console-output" class="console-text">System ready. Select a mission or write Python code, then click RUN.</div>
        </div>
      </aside>

      <!-- Bottom-Right Telemetry Card -->
      <div class="hud-telemetry-panel">
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

    this.telemPosX = this.rootElement.querySelector('#telem-pos')!;
    this.telemYaw = this.rootElement.querySelector('#telem-yaw')!;
    this.telemMotorA = this.rootElement.querySelector('#telem-motor-a')!;
    this.telemMotorB = this.rootElement.querySelector('#telem-motor-b')!;
    this.telemColorC = this.rootElement.querySelector('#telem-color-c')!;
    this.telemColorD = this.rootElement.querySelector('#telem-color-d')!;
    this.telemDist = this.rootElement.querySelector('#telem-dist')!;
    this.telemFps = this.rootElement.querySelector('#telem-fps')!;

    // Set initial sample code
    this.codeTextarea.value = SAMPLE_MISSIONS.drive_straight.code;
  }

  private setupEvents(): void {
    // Mission dropdown change
    const missionSelect = this.rootElement.querySelector('#mission-select') as HTMLSelectElement;
    missionSelect.addEventListener('change', () => {
      const selected = SAMPLE_MISSIONS[missionSelect.value];
      if (selected) {
        this.codeTextarea.value = selected.code;
        this.logConsole(`Loaded ${selected.title}`);
      }
    });

    // Competition Mat dropdown change
    const mapSelect = this.rootElement.querySelector('#map-select') as HTMLSelectElement | null;
    if (mapSelect) {
      mapSelect.addEventListener('change', () => {
        const val = mapSelect.value as 'grid' | 'procedural';
        this.callbacks.onMapChange?.(val);
        this.logConsole(`Switched competition mat to: ${mapSelect.options[mapSelect.selectedIndex].text}`);
      });
    }

    // Run button
    this.runBtn.addEventListener('click', () => {
      this.setExecutionState('RUNNING');
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
  }

  public logConsole(msg: string): void {
    const time = new Date().toLocaleTimeString();
    this.consoleOutput.innerHTML += `<div><span style="color: #64748b;">[${time}]</span> ${msg}</div>`;
    this.consoleOutput.scrollTop = this.consoleOutput.scrollHeight;
  }

  public setExecutionState(state: ExecutionState): void {
    const dot = this.rootElement.querySelector('#exec-status-dot')!;
    this.statusBadge.textContent = state;

    dot.className = 'status-dot';
    if (state === 'RUNNING') {
      dot.classList.add('status-running');
      this.runBtn.disabled = true;
      this.stopBtn.disabled = false;
      this.matchTimerRunning = true;
    } else if (state === 'ERROR') {
      dot.classList.add('status-error');
      this.runBtn.disabled = false;
      this.stopBtn.disabled = true;
    } else {
      dot.classList.add('status-idle');
      this.runBtn.disabled = false;
      this.stopBtn.disabled = true;
    }
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
}
