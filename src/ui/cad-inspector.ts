import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import JSZip from 'jszip';
import RAPIER from '@dimforge/rapier3d-compat';
import { LDrawImporter } from '../cad/ldraw-importer';
import { RobotAssemblySpec, PlacedPart } from '../cad/types';
import { LEGO_COLORS, createTechnicBeamGroup } from '../view/lego-visuals';
import { isChainPart } from '../cad/part-catalog';
import { legoAssetManager } from '../cad/lego-asset-manager';
import {
  SEASON_MISSIONS_CONFIG,
  saveMissionArenaPosition,
  getMissionArenaPosition,
} from '../missions/season-config';
import { resolveAssetUrl } from '../utils/asset-path';

export interface CadInspectorCallbacks {
  onDeployToField?: (missionId: string, customSpec?: RobotAssemblySpec) => void;
  onToggleSolidMode?: (missionId: string, solid: boolean) => void;
  onUpdateFieldPosition?: (missionId: string, pos: { x: number; y: number; z: number }, yaw: number) => void;
}

export interface InspectedStepItem {
  stepIndex: number;
  part: PlacedPart;
  clusterIndex: number;
  clusterName: string;
  isRootChassis: boolean;
  mesh: THREE.Object3D;
}

/**
 * CAD Model Inspector & Diagnostic Validator
 * 
 * Provides an interactive 3D inspection studio for BrickLink Studio (.io)
 * and LDraw (.ldr) models, displaying side-by-side official Studio renders,
 * step-by-step assembly build playback, live Rapier physics sandbox,
 * virtual mouse "hand" interaction tool, cluster field-anchor toggles,
 * and competition mat placement controls.
 */
export class CadModelInspector {
  private overlay: HTMLElement;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private animationId: number | null = null;

  private modelGroup: THREE.Group = new THREE.Group();
  private colliderGroup: THREE.Group = new THREE.Group();
  private gridHelper!: THREE.GridHelper;

  private currentSpec: RobotAssemblySpec | null = null;
  private currentThumbnailUrl: string | null = null;
  private currentMissionId: string = 'M01';
  private isWireframe: boolean = false;
  private showColliders: boolean = false;
  private isSolidMode: boolean = false;

  // Assembly Step Debugger State
  private inspectedSteps: InspectedStepItem[] = [];
  private isStepMode: boolean = false;
  private currentStepIndex: number = 0;
  private stepPlayTimer: number | null = null;
  private highlightHelper: THREE.BoxHelper | null = null;

  // Live Rapier Physics Sandbox & Multi-Object Interaction State
  private physicsWorld: RAPIER.World | null = null;
  private isPhysicsRunning: boolean = false;
  private physicsBodies: Map<string, RAPIER.RigidBody> = new Map();
  private clusterMeshGroups: Map<string, THREE.Group> = new Map();
  private initialMeshPoses: Map<string, { pos: THREE.Vector3; quat: THREE.Quaternion }> = new Map();
  private selectedClusterId: string | null = null;

  // Virtual Mouse Hand Tool & Technic Bar Probe
  private toolMode: 'grab' | 'technic_bar' = 'grab';
  private handMesh: THREE.Mesh | null = null;
  private handLine: THREE.Line | null = null;
  private reticleMesh: THREE.Mesh | null = null;
  private isHandDragging: boolean = false;
  private draggedBody: RAPIER.RigidBody | null = null;
  private draggedLocalAnchor: THREE.Vector3 = new THREE.Vector3();
  private dragPlane: THREE.Plane = new THREE.Plane();
  private mouseRay: THREE.Raycaster = new THREE.Raycaster();
  private mouseCoords: THREE.Vector2 = new THREE.Vector2();
  private handTargetPoint: THREE.Vector3 = new THREE.Vector3();

  // Technic Bar Tool
  private technicBarMesh: THREE.Group | null = null;
  private technicBarBody: RAPIER.RigidBody | null = null;
  private technicBarHeight: number = 0.035; // 35mm above mat
  private technicBarTarget: THREE.Vector3 = new THREE.Vector3(0, 0.035, 0);
  private isTechnicBarPushing: boolean = false;

  private callbacks: CadInspectorCallbacks;

  public getCurrentSpec(): RobotAssemblySpec | null {
    return this.currentSpec;
  }

  public getCurrentThumbnailUrl(): string | null {
    return this.currentThumbnailUrl;
  }

  public getSolidMode(): boolean {
    return this.isSolidMode;
  }

  constructor(callbacks: CadInspectorCallbacks = {}) {
    this.callbacks = callbacks;
    if (typeof document !== 'undefined') {
      this.overlay = document.createElement('div');
      this.overlay.className = 'cad-inspector-overlay';
      this.overlay.style.display = 'none';
      document.body.appendChild(this.overlay);

      this.renderDom();
      this.setupEvents();
    } else {
      this.overlay = {
        querySelector: () => null,
        querySelectorAll: () => [],
      } as any;
    }
  }

  private renderDom(): void {
    this.overlay.innerHTML = `
      <div class="cad-inspector-window">
        <!-- Window Header -->
        <div class="inspector-header">
          <div class="inspector-title-group">
            <span class="inspector-icon">🔬</span>
            <div class="inspector-title-text">
              <h2>LEGO® CAD Model Inspector & Validator</h2>
              <p class="inspector-subtitle">Verify official Studio 2.0 (.io) geometry, step build, live physics & field anchors</p>
            </div>
          </div>
          <div class="inspector-header-controls">
            <select id="inspector-mission-select" class="hud-select hud-select-sm">
              ${SEASON_MISSIONS_CONFIG.map((m) => `<option value="${m.id}">${m.id}: ${m.name}</option>`).join('')}
              <option value="custom">📁 Custom Model (Upload...)</option>
            </select>
            <label class="btn btn-sm btn-secondary file-upload-btn" title="Inspect custom .io or .ldr file">
              📂 Upload .io
              <input type="file" id="inspector-file-input" accept=".io,.ldr,.mpd,.dat" style="display: none;">
            </label>
            <button class="btn btn-sm btn-outline" id="btn-close-inspector" title="Close Inspector">✖</button>
          </div>
        </div>

        <!-- Main Body Split -->
        <div class="inspector-body">
          <!-- Left Column: Visual Viewport & Studio Render -->
          <div class="inspector-left-col">
            <div class="inspector-viewport-tabs">
              <button class="tab-btn active" data-tab="3d">🌐 Interactive 3D CAD</button>
              <button class="tab-btn" data-tab="studio-render">📸 Studio 2.0 Render</button>
            </div>

            <div class="inspector-viewport-container" id="inspector-viewport-container">
              <canvas id="inspector-canvas"></canvas>
              <!-- 3D Overlays / Toolbar -->
              <div class="inspector-canvas-toolbar">
                <button class="btn btn-xs btn-outline" id="btn-toggle-wireframe">🕸️ Wireframe: OFF</button>
                <button class="btn btn-xs btn-outline" id="btn-toggle-colliders">🔲 Colliders: OFF</button>
                <button class="btn btn-xs btn-outline" id="btn-toggle-physics" title="Run live Rapier physics in inspector">▶ Live Physics: OFF</button>
                <div class="inspector-tool-mode-group" id="inspector-tool-mode-group" style="display: none; display: inline-flex; gap: 2px;">
                  <button class="btn btn-xs btn-primary active" id="btn-tool-grab" title="✋ Grab & Drag: Click and pull parts with spring force">✋ Grab</button>
                  <button class="btn btn-xs btn-outline" id="btn-tool-technic-bar" title="🥢 Technic Bar: LEGO beam probe to physically push and poke mechanisms">🥢 Technic Bar</button>
                </div>
                <button class="btn btn-xs btn-outline" id="btn-reset-physics" style="display: none;" title="Reset parts back to initial CAD positions">🔄 Reset Poses</button>
                <button class="btn btn-xs btn-outline" id="btn-reset-view">🎯 Reset Camera</button>
              </div>
              <div class="technic-bar-badge" id="technic-bar-height-badge" style="display: none; position: absolute; bottom: 8px; right: 8px; background: rgba(15,23,42,0.85); border: 1px solid #38bdf8; border-radius: 4px; padding: 3px 8px; font-size: 11px; color: #38bdf8; pointer-events: none; z-index: 10;">
                🥢 Technic Bar: 35mm (Scroll wheel to adjust height)
              </div>
            </div>

            <!-- Assembly Step Debugger Bar -->
            <div class="inspector-step-bar" id="inspector-step-bar">
              <div class="step-bar-top">
                <button class="btn btn-xs btn-outline" id="btn-toggle-step-mode" title="Toggle step-by-step assembly build inspection">🧱 Step Build Mode: OFF</button>
                <div class="step-playback-group" id="step-playback-controls" style="display: none;">
                  <button class="btn btn-xs btn-ghost" id="btn-step-first" title="First step (⏮)">⏮</button>
                  <button class="btn btn-xs btn-ghost" id="btn-step-prev" title="Previous step (◀)">◀</button>
                  <button class="btn btn-xs btn-primary" id="btn-step-play" title="Auto-build playback">▶ Play</button>
                  <button class="btn btn-xs btn-ghost" id="btn-step-next" title="Next step (▶)">▶</button>
                  <button class="btn btn-xs btn-ghost" id="btn-step-last" title="Last step (⏭)">⏭</button>
                  <select id="step-speed-select" class="hud-select hud-select-sm" title="Playback speed">
                    <option value="1">1x</option>
                    <option value="2">2x</option>
                    <option value="5" selected>5x</option>
                    <option value="10">10x</option>
                  </select>
                </div>
                <span class="step-counter-text" id="step-counter-display">All parts visible</span>
              </div>
              <div class="step-slider-row" id="step-slider-row" style="display: none;">
                <input type="range" id="step-scrubber-slider" min="1" max="1" value="1" class="step-scrubber" />
              </div>
            </div>

            <div class="inspector-studio-render-container" id="inspector-studio-container" style="display: none;">
              <div class="studio-render-box">
                <img id="inspector-thumbnail-img" src="" alt="Official Studio 2.0 Render" />
                <div class="studio-render-caption">Official BrickLink Studio 2.0 Render (embedded inside .io archive)</div>
              </div>
            </div>
          </div>

          <!-- Right Column: Validation & Kinematics Report -->
          <div class="inspector-right-col" style="overflow-y: auto;">
            <div class="inspector-panel-title">📊 Validation & Kinematics Report</div>
            
            <div class="status-banner status-pass" id="inspector-status-banner">
              <span class="status-icon">✅</span>
              <div class="status-details">
                <div class="status-head">MODEL GEOMETRY VALID</div>
                <div class="status-sub">All submodels linked without loose or unanchored parts</div>
              </div>
            </div>

            <!-- Active Step Inspection Card -->
            <div class="inspector-section-card" id="inspector-active-step-card" style="display: none;">
              <div class="section-card-title">🔍 Step Inspector: Active LEGO Element</div>
              <div class="active-step-details" id="active-step-details">
                <!-- Dynamically populated -->
              </div>
            </div>

            <!-- Metrics Grid -->
            <div class="inspector-metrics-grid">
              <div class="metric-card">
                <span class="metric-label">TOTAL LEGO PARTS</span>
                <span class="metric-val" id="metric-parts-count">--</span>
              </div>
              <div class="metric-card">
                <span class="metric-label">SUBMODELS</span>
                <span class="metric-val" id="metric-submodels-count">--</span>
              </div>
              <div class="metric-card">
                <span class="metric-label">KINEMATIC BODIES</span>
                <span class="metric-val" id="metric-clusters-count">--</span>
              </div>
              <div class="metric-card">
                <span class="metric-label">ESTIMATED MASS</span>
                <span class="metric-val" id="metric-mass">-- g</span>
              </div>
            </div>

            <!-- Dimensions Card -->
            <div class="inspector-section-card">
              <div class="section-card-title">📐 Bounding Dimensions</div>
              <div class="dim-row">
                <span class="dim-label">Width (X):</span>
                <span class="dim-val" id="dim-x">-- mm (-- studs)</span>
              </div>
              <div class="dim-row">
                <span class="dim-label">Depth (Z):</span>
                <span class="dim-val" id="dim-z">-- mm (-- studs)</span>
              </div>
              <div class="dim-row">
                <span class="dim-label">Height (Y):</span>
                <span class="dim-val" id="dim-y">-- mm (-- plates)</span>
              </div>
              <div class="dim-row">
                <span class="dim-label">Ground Alignment:</span>
                <span class="dim-val highlight-green" id="dim-ground">Flush with mat (+0.0 mm)</span>
              </div>
            </div>

            <!-- Clusters Breakdown & Parts BOM Tabs -->
            <div class="inspector-section-card">
              <div class="inspector-tab-row" style="display: flex; gap: 8px; margin-bottom: 8px;">
                <button class="btn btn-xs btn-outline active" id="btn-tab-clusters">🧩 Clusters</button>
                <button class="btn btn-xs btn-outline" id="btn-tab-bom">📋 Parts List / BOM</button>
              </div>

              <!-- Quick Presets -->
              <div class="cluster-quick-presets" id="cluster-quick-presets">
                <button class="btn btn-xs btn-ghost" id="btn-preset-fix-base" title="Anchor base plate, make mechanisms dynamic">📌 Fix Base Only</button>
                <button class="btn btn-xs btn-ghost" id="btn-preset-all-dynamic" title="Make all pieces free and movable">🔓 All Movable</button>
                <button class="btn btn-xs btn-ghost" id="btn-preset-lock-all" title="Freeze entire model as solid immovable base">🔒 Lock All</button>
              </div>

              <!-- Selected Cluster Nudge & Position Adjuster -->
              <div class="cluster-nudge-box" id="cluster-nudge-card" style="display: none;">
                <span class="nudge-title" id="cluster-nudge-title">Adjust Selected Element Position:</span>
                <div class="nudge-btn-row">
                  <span>X:</span>
                  <button class="btn btn-xs btn-ghost btn-nudge" data-axis="x" data-delta="-8">-8mm</button>
                  <button class="btn btn-xs btn-ghost btn-nudge" data-axis="x" data-delta="8">+8mm</button>
                  <span>Y:</span>
                  <button class="btn btn-xs btn-ghost btn-nudge" data-axis="y" data-delta="-3.2">-3.2mm</button>
                  <button class="btn btn-xs btn-ghost btn-nudge" data-axis="y" data-delta="3.2">+3.2mm</button>
                  <span>Z:</span>
                  <button class="btn btn-xs btn-ghost btn-nudge" data-axis="z" data-delta="-8">-8mm</button>
                  <button class="btn btn-xs btn-ghost btn-nudge" data-axis="z" data-delta="8">+8mm</button>
                </div>
              </div>

              <div class="clusters-list" id="inspector-clusters-list">
                <!-- Dynamically populated -->
              </div>
              <div class="bom-table-container" id="inspector-bom-container" style="display: none; max-height: 240px; overflow-y: auto;">
                <table class="bom-table" style="width: 100%; font-size: 11px; border-collapse: collapse;">
                  <thead>
                    <tr style="text-align: left; border-bottom: 1px solid #334155; color: #94a3b8;">
                      <th style="padding: 4px;">Part #</th>
                      <th style="padding: 4px;">Qty</th>
                      <th style="padding: 4px;">Description</th>
                      <th style="padding: 4px;">3D Mesh</th>
                    </tr>
                  </thead>
                  <tbody id="inspector-bom-tbody"></tbody>
                </table>
              </div>
            </div>

            <!-- Competition Mat Position Settings -->
            <div class="inspector-section-card">
              <div class="section-card-title">📍 Competition Field Placement</div>
              <div class="field-pos-grid" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; margin-top: 6px;">
                <label style="font-size: 10px; color: #94a3b8;">X (m):
                  <input type="number" step="0.02" class="hud-input hud-input-sm w-100" id="input-field-x" value="0.00">
                </label>
                <label style="font-size: 10px; color: #94a3b8;">Z (m):
                  <input type="number" step="0.02" class="hud-input hud-input-sm w-100" id="input-field-z" value="0.00">
                </label>
                <label style="font-size: 10px; color: #94a3b8;">Yaw (°):
                  <input type="number" step="15" class="hud-input hud-input-sm w-100" id="input-field-yaw" value="0">
                </label>
              </div>
              <button class="btn btn-xs btn-outline w-100" style="margin-top: 8px;" id="btn-save-field-pos">💾 Save Mat Coordinates</button>
            </div>

            <!-- 3D Mesh Engine Mode (Draco GLB vs Native Procedural) -->
            <div class="inspector-section-card">
              <div class="section-card-title">🎨 3D Mesh Engine Mode</div>
              <div class="engine-mode-row" style="display: flex; gap: 8px; margin-top: 6px;">
                <button class="btn btn-xs btn-outline" id="btn-engine-draco" title="High-fidelity Draco compressed 3D GLB models">⚡ Draco GLB</button>
                <button class="btn btn-xs btn-outline" id="btn-engine-procedural" title="Fast built-in procedural LEGO geometry">🧱 Native Procedural</button>
              </div>
              <div class="engine-status-desc" id="engine-status-desc" style="font-size: 11px; color: #94a3b8; margin-top: 6px;">
                Active: ⚡ Draco GLB (High fidelity, authentic geometry)
              </div>
            </div>

            <!-- Physics Mode Controls -->
            <div class="inspector-section-card">
              <div class="section-card-title">⚙️ Physics Engine Mode</div>
              <div class="physics-mode-row">
                <label class="mode-radio-label">
                  <input type="radio" name="inspector-physics-mode" value="articulated" checked id="radio-mode-articulated">
                  <span><strong>Articulated Physics:</strong> Solves mechanisms, slides & hinges</span>
                </label>
                <label class="mode-radio-label">
                  <input type="radio" name="inspector-physics-mode" value="solid" id="radio-mode-solid">
                  <span><strong>Solid Anchor:</strong> 100% immovable rigid body on mat (zero wobble)</span>
                </label>
              </div>
            </div>

            <!-- Action Buttons -->
            <div class="inspector-actions" style="margin-top: 12px;">
              <button class="btn btn-sm btn-primary w-100" id="btn-deploy-inspected">🚀 Deploy Model to Mat</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private setupEvents(): void {
    const btnClose = this.overlay.querySelector('#btn-close-inspector')!;
    btnClose.addEventListener('click', () => this.close());

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.overlay.style.display !== 'none') {
        this.close();
      }
    });

    // Viewport tabs
    const tabBtns = this.overlay.querySelectorAll('.inspector-viewport-tabs .tab-btn');
    const viewportContainer = this.overlay.querySelector('#inspector-viewport-container') as HTMLElement;
    const studioContainer = this.overlay.querySelector('#inspector-studio-container') as HTMLElement;

    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        tabBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.getAttribute('data-tab');
        if (tab === '3d') {
          viewportContainer.style.display = 'block';
          studioContainer.style.display = 'none';
          this.onResize();
        } else {
          viewportContainer.style.display = 'none';
          studioContainer.style.display = 'flex';
        }
      });
    });

    // Wireframe toggle
    const btnWireframe = this.overlay.querySelector('#btn-toggle-wireframe') as HTMLButtonElement;
    btnWireframe.addEventListener('click', () => {
      this.isWireframe = !this.isWireframe;
      btnWireframe.textContent = `🕸️ Wireframe: ${this.isWireframe ? 'ON' : 'OFF'}`;
      this.setWireframe(this.isWireframe);
    });

    // Colliders toggle
    const btnColliders = this.overlay.querySelector('#btn-toggle-colliders') as HTMLButtonElement;
    btnColliders.addEventListener('click', () => {
      this.showColliders = !this.showColliders;
      btnColliders.textContent = `🔲 Colliders: ${this.showColliders ? 'ON' : 'OFF'}`;
      this.colliderGroup.visible = this.showColliders;
    });

    // Reset camera
    const btnResetCam = this.overlay.querySelector('#btn-reset-view')!;
    btnResetCam.addEventListener('click', () => this.resetCamera());

    // Live Rapier Physics Sandbox Toggle
    const btnTogglePhysics = this.overlay.querySelector('#btn-toggle-physics') as HTMLButtonElement;
    btnTogglePhysics.addEventListener('click', () => this.toggleLivePhysics());

    const btnResetPhysics = this.overlay.querySelector('#btn-reset-physics') as HTMLButtonElement;
    btnResetPhysics.addEventListener('click', () => this.resetPhysicsPoses());

    const btnToolGrab = this.overlay.querySelector('#btn-tool-grab') as HTMLButtonElement | null;
    const btnToolBar = this.overlay.querySelector('#btn-tool-technic-bar') as HTMLButtonElement | null;
    btnToolGrab?.addEventListener('click', () => this.setToolMode('grab'));
    btnToolBar?.addEventListener('click', () => this.setToolMode('technic_bar'));

    // Mission selector
    const missionSelect = this.overlay.querySelector('#inspector-mission-select') as HTMLSelectElement;
    missionSelect.addEventListener('change', () => {
      const val = missionSelect.value;
      if (val === 'custom') {
        (this.overlay.querySelector('#inspector-file-input') as HTMLInputElement).click();
      } else {
        this.loadMissionModel(val);
      }
    });

    // File input
    const fileInput = this.overlay.querySelector('#inspector-file-input') as HTMLInputElement;
    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files[0]) {
        this.loadFromFile(fileInput.files[0]);
        fileInput.value = '';
      }
    });

    // Step Debugger Scrubber and Playback Events
    const btnToggleStep = this.overlay.querySelector('#btn-toggle-step-mode');
    btnToggleStep?.addEventListener('click', () => this.toggleStepMode());

    const stepSlider = this.overlay.querySelector('#step-scrubber-slider') as HTMLInputElement | null;
    stepSlider?.addEventListener('input', () => {
      this.setStep(parseInt(stepSlider.value, 10));
    });

    const btnStepFirst = this.overlay.querySelector('#btn-step-first');
    btnStepFirst?.addEventListener('click', () => this.setStep(1));

    const btnStepPrev = this.overlay.querySelector('#btn-step-prev');
    btnStepPrev?.addEventListener('click', () => this.setStep(this.currentStepIndex - 1));

    const btnStepPlay = this.overlay.querySelector('#btn-step-play');
    btnStepPlay?.addEventListener('click', () => {
      if (this.stepPlayTimer !== null) {
        this.stopStepPlay();
      } else {
        this.startStepPlay();
      }
    });

    const btnStepNext = this.overlay.querySelector('#btn-step-next');
    btnStepNext?.addEventListener('click', () => this.setStep(this.currentStepIndex + 1));

    const btnStepLast = this.overlay.querySelector('#btn-step-last');
    btnStepLast?.addEventListener('click', () => this.setStep(this.inspectedSteps.length));

    const stepSpeedSelect = this.overlay.querySelector('#step-speed-select') as HTMLSelectElement | null;
    stepSpeedSelect?.addEventListener('change', () => {
      if (this.stepPlayTimer !== null) {
        this.stopStepPlay();
        this.startStepPlay();
      }
    });

    // Clusters vs BOM tab toggle
    const btnTabClusters = this.overlay.querySelector('#btn-tab-clusters');
    const btnTabBom = this.overlay.querySelector('#btn-tab-bom');
    const clustersList = this.overlay.querySelector('#inspector-clusters-list') as HTMLElement;
    const bomContainer = this.overlay.querySelector('#inspector-bom-container') as HTMLElement;

    btnTabClusters?.addEventListener('click', () => {
      btnTabClusters.classList.add('active');
      btnTabBom?.classList.remove('active');
      clustersList.style.display = 'block';
      bomContainer.style.display = 'none';
    });

    btnTabBom?.addEventListener('click', () => {
      btnTabBom.classList.add('active');
      btnTabClusters?.classList.remove('active');
      clustersList.style.display = 'none';
      bomContainer.style.display = 'block';
    });

    // Quick Presets
    this.overlay.querySelector('#btn-preset-fix-base')?.addEventListener('click', () => {
      if (!this.currentSpec) return;
      const childClusterIds = new Set(this.currentSpec.joints.map((j) => j.childClusterId));
      this.currentSpec.clusters.forEach((c) => {
        const isChain = c.name.toLowerCase().includes('chain') ||
          c.parts?.some((p) => p.role === 'CHAIN_LINK' || isChainPart(p.partNumber, p.submodel));
        if (c.isRootChassis) {
          c.isFixed = true;
        } else if (isChain) {
          c.isFixed = false;
        } else if (childClusterIds.has(c.clusterId)) {
          c.isFixed = false;
        } else if (this.currentSpec!.joints.length === 0) {
          c.isFixed = true;
        } else {
          c.isFixed = false;
        }
      });
      this.saveClusterOverrides();
      this.rebuildPhysicsIfRunning();
      this.renderClusterList();
    });

    this.overlay.querySelector('#btn-preset-all-dynamic')?.addEventListener('click', () => {
      if (!this.currentSpec) return;
      this.currentSpec.clusters.forEach((c) => {
        c.isFixed = false;
      });
      this.saveClusterOverrides();
      this.rebuildPhysicsIfRunning();
      this.renderClusterList();
    });

    this.overlay.querySelector('#btn-preset-lock-all')?.addEventListener('click', () => {
      if (!this.currentSpec) return;
      this.currentSpec.clusters.forEach((c) => {
        c.isFixed = true;
      });
      this.saveClusterOverrides();
      this.rebuildPhysicsIfRunning();
      this.renderClusterList();
    });

    // Nudge Buttons
    this.overlay.querySelectorAll('.btn-nudge').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!this.selectedClusterId) return;
        const axis = btn.getAttribute('data-axis') as 'x' | 'y' | 'z';
        const delta = parseFloat(btn.getAttribute('data-delta') || '0');
        this.nudgeCluster(this.selectedClusterId, axis, delta);
      });
    });

    // Save field coordinates button
    this.overlay.querySelector('#btn-save-field-pos')?.addEventListener('click', () => {
      this.saveFieldCoordinates();
    });

    // 3D Mesh Engine Mode buttons (Draco GLB vs Native Procedural)
    const btnDraco = this.overlay.querySelector('#btn-engine-draco') as HTMLButtonElement | null;
    const btnProc = this.overlay.querySelector('#btn-engine-procedural') as HTMLButtonElement | null;

    const updateEngineButtons = () => {
      const mode = legoAssetManager.getRenderMode();
      if (mode === 'draco_glb') {
        btnDraco?.classList.add('btn-primary', 'active');
        btnDraco?.classList.remove('btn-outline');
        btnProc?.classList.add('btn-outline');
        btnProc?.classList.remove('btn-primary', 'active');
      } else {
        btnProc?.classList.add('btn-primary', 'active');
        btnProc?.classList.remove('btn-outline');
        btnDraco?.classList.add('btn-outline');
        btnDraco?.classList.remove('btn-primary', 'active');
      }
    };
    updateEngineButtons();

    btnDraco?.addEventListener('click', async () => {
      legoAssetManager.setRenderMode('draco_glb');
      updateEngineButtons();
      if (this.currentSpec) {
        await this.build3DRepresentation(this.currentSpec);
      }
    });

    btnProc?.addEventListener('click', async () => {
      legoAssetManager.setRenderMode('procedural');
      updateEngineButtons();
      if (this.currentSpec) {
        await this.build3DRepresentation(this.currentSpec);
      }
    });

    // Deploy to mat
    const btnDeploy = this.overlay.querySelector('#btn-deploy-inspected')!;
    btnDeploy.addEventListener('click', () => {
      if (this.currentMissionId) {
        this.saveFieldCoordinates();
        this.callbacks.onDeployToField?.(this.currentMissionId, this.currentSpec || undefined);
        this.close();
      }
    });

    // Physics mode radio
    const radioArticulated = this.overlay.querySelector('#radio-mode-articulated') as HTMLInputElement;
    const radioSolid = this.overlay.querySelector('#radio-mode-solid') as HTMLInputElement;
    radioArticulated.addEventListener('change', () => {
      if (radioArticulated.checked) {
        this.isSolidMode = false;
        this.callbacks.onToggleSolidMode?.(this.currentMissionId, false);
        this.rebuildPhysicsIfRunning();
      }
    });
    radioSolid.addEventListener('change', () => {
      if (radioSolid.checked) {
        this.isSolidMode = true;
        this.callbacks.onToggleSolidMode?.(this.currentMissionId, true);
        this.rebuildPhysicsIfRunning();
      }
    });
  }

  private initThree(): void {
    if (this.renderer) return;

    const canvas = this.overlay.querySelector('#inspector-canvas') as HTMLCanvasElement;
    const container = this.overlay.querySelector('#inspector-viewport-container') as HTMLElement;
    const width = container.clientWidth || 560;
    const height = container.clientHeight || 420;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f172a);

    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.01, 10);
    this.camera.position.set(0.35, 0.25, 0.35);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.target.set(0, 0.05, 0);

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 1.2);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight.position.set(1.0, 2.0, 1.0);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    this.scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x94a3b8, 1.0);
    fillLight.position.set(-1.0, 1.0, -1.0);
    this.scene.add(fillLight);

    // Workbench ground grid
    this.gridHelper = new THREE.GridHelper(1.0, 20, 0x38bdf8, 0x334155);
    this.gridHelper.position.y = 0;
    this.scene.add(this.gridHelper);

    // Groups
    this.scene.add(this.modelGroup);
    this.scene.add(this.colliderGroup);
    this.colliderGroup.visible = false;

    // Build Virtual Hand & Reticle 3D indicators
    this.initVirtualHand();

    // Attach Pointer events for hover targeting and physical mouse grab
    canvas.addEventListener('pointermove', (e) => this.onPointerMove(e, canvas));
    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e, canvas));
    canvas.addEventListener('pointerup', () => this.onPointerUp());
    canvas.addEventListener('pointercancel', () => this.onPointerUp());
    canvas.addEventListener('pointerleave', () => this.onPointerUp());
    canvas.addEventListener('wheel', (e) => {
      if (this.toolMode === 'technic_bar' && this.isPhysicsRunning) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.005 : -0.005; // 5mm vertical step
        this.technicBarHeight = Math.max(0.005, Math.min(0.20, this.technicBarHeight + delta));
        this.updateTechnicBarBadge();
      }
    }, { passive: false });

    window.addEventListener('resize', () => this.onResize());
  }

  private initVirtualHand(): void {
    // 1. Targeting reticle (ring)
    const reticleGeom = new THREE.RingGeometry(0.006, 0.009, 20);
    const reticleMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    this.reticleMesh = new THREE.Mesh(reticleGeom, reticleMat);
    this.reticleMesh.visible = false;
    this.scene.add(this.reticleMesh);

    // 2. 3D Virtual Hand Gripper Sphere
    const handGeom = new THREE.SphereGeometry(0.012, 16, 16);
    const handMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.9,
      roughness: 0.2,
      metalness: 0.1,
      transparent: true,
      opacity: 0.85,
    });
    this.handMesh = new THREE.Mesh(handGeom, handMat);
    this.handMesh.visible = false;
    this.scene.add(this.handMesh);

    // 3. Tractor beam / spring line
    const lineGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xfacc15,
      linewidth: 2,
      transparent: true,
      opacity: 0.9,
    });
    this.handLine = new THREE.Line(lineGeom, lineMat);
    this.handLine.visible = false;
    this.scene.add(this.handLine);

    // 4. 3D Technic Beam probe
    this.technicBarMesh = createTechnicBeamGroup(7, LEGO_COLORS.YELLOW);
    this.technicBarMesh.visible = false;
    this.scene.add(this.technicBarMesh);
  }

  private onPointerMove(e: PointerEvent, canvas: HTMLCanvasElement): void {
    const rect = canvas.getBoundingClientRect();
    this.mouseCoords.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouseCoords.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    if (!this.isPhysicsRunning) return;

    if (this.toolMode === 'technic_bar') {
      this.mouseRay.setFromCamera(this.mouseCoords, this.camera);
      const hPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.technicBarHeight);
      const hitPt = new THREE.Vector3();
      if (this.mouseRay.ray.intersectPlane(hPlane, hitPt)) {
        this.technicBarTarget.copy(hitPt);
        if (this.technicBarMesh) {
          this.technicBarMesh.position.set(hitPt.x, this.technicBarHeight, hitPt.z);
          this.technicBarMesh.visible = this.isPhysicsRunning;
        }
      }
      canvas.style.cursor = 'crosshair';
      if (this.reticleMesh) this.reticleMesh.visible = false;
      return;
    }

    if (this.isHandDragging && this.draggedBody) {
      // Dragging a piece with the virtual hand - update target point on drag plane
      this.mouseRay.setFromCamera(this.mouseCoords, this.camera);
      const targetPoint = new THREE.Vector3();
      if (this.mouseRay.ray.intersectPlane(this.dragPlane, targetPoint)) {
        this.handTargetPoint.copy(targetPoint);
        if (this.handMesh) {
          this.handMesh.position.copy(targetPoint);
          this.handMesh.visible = true;
        }
      }
    } else {
      // Hover targeting
      this.mouseRay.setFromCamera(this.mouseCoords, this.camera);
      const hits = this.mouseRay.intersectObjects(this.modelGroup.children, true);
      if (hits.length > 0) {
        const hit = hits[0];
        const clusterId = this.findClusterIdFromObject(hit.object);
        const body = clusterId ? this.physicsBodies.get(clusterId) : null;

        if (body && body.isDynamic()) {
          if (this.reticleMesh) {
            this.reticleMesh.position.copy(hit.point);
            if (hit.face?.normal) {
              const norm = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
              this.reticleMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), norm);
              this.reticleMesh.position.addScaledVector(norm, 0.001);
            }
            this.reticleMesh.visible = true;
          }
          canvas.style.cursor = 'grab';
        } else {
          if (this.reticleMesh) this.reticleMesh.visible = false;
          canvas.style.cursor = 'default';
        }
      } else {
        if (this.reticleMesh) this.reticleMesh.visible = false;
        canvas.style.cursor = 'default';
      }
    }
  }

  private onPointerDown(e: PointerEvent, canvas: HTMLCanvasElement): void {
    if (e.button !== 0 || !this.isPhysicsRunning) return;

    if (this.toolMode === 'technic_bar') {
      this.controls.enabled = false;
      this.isTechnicBarPushing = true;
      return;
    }

    const rect = canvas.getBoundingClientRect();
    this.mouseCoords.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouseCoords.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.mouseRay.setFromCamera(this.mouseCoords, this.camera);
    const hits = this.mouseRay.intersectObjects(this.modelGroup.children, true);

    if (hits.length > 0) {
      const hit = hits[0];
      const clusterId = this.findClusterIdFromObject(hit.object);
      const body = clusterId ? this.physicsBodies.get(clusterId) : null;

      if (body && body.isDynamic()) {
        this.controls.enabled = false;
        this.isHandDragging = true;
        this.draggedBody = body;
        this.handTargetPoint.copy(hit.point);

        const bTrans = body.translation();
        const bRot = body.rotation();
        const bQuat = new THREE.Quaternion(bRot.x, bRot.y, bRot.z, bRot.w);
        this.draggedLocalAnchor = hit.point.clone()
          .sub(new THREE.Vector3(bTrans.x, bTrans.y, bTrans.z))
          .applyQuaternion(bQuat.clone().invert());

        const camDir = new THREE.Vector3();
        this.camera.getWorldDirection(camDir).negate();
        this.dragPlane.setFromNormalAndCoplanarPoint(camDir, hit.point);

        canvas.style.cursor = 'grabbing';
        if (this.reticleMesh) this.reticleMesh.visible = false;
      }
    }
  }

  private onPointerUp(): void {
    if (this.isTechnicBarPushing) {
      this.isTechnicBarPushing = false;
      this.controls.enabled = true;
    }

    if (this.isHandDragging) {
      this.isHandDragging = false;
      this.draggedBody = null;
      this.controls.enabled = true;
      if (this.handMesh) this.handMesh.visible = false;
      if (this.handLine) this.handLine.visible = false;
      const canvas = this.overlay.querySelector('#inspector-canvas') as HTMLCanvasElement;
      if (canvas) canvas.style.cursor = 'default';
    }
  }

  private findClusterIdFromObject(obj: THREE.Object3D | null): string | null {
    let curr: THREE.Object3D | null = obj;
    while (curr && curr !== this.modelGroup) {
      if (curr.userData?.clusterId) return curr.userData.clusterId;
      curr = curr.parent;
    }
    return null;
  }

  private onResize(): void {
    if (!this.renderer || !this.camera) return;
    const container = this.overlay.querySelector('#inspector-viewport-container') as HTMLElement;
    const width = container.clientWidth || 560;
    const height = container.clientHeight || 420;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private startLoop(): void {
    if (this.animationId !== null) return;
    const loop = () => {
      this.animationId = requestAnimationFrame(loop);

      // Step Live Rapier physics and synchronize Three.js visual meshes
      if (this.isPhysicsRunning && this.physicsWorld) {
        if (this.isHandDragging && this.draggedBody && this.draggedBody.isDynamic()) {
          const bTrans = this.draggedBody.translation();
          const bRot = this.draggedBody.rotation();
          const bQuat = new THREE.Quaternion(bRot.x, bRot.y, bRot.z, bRot.w);
          const worldAnchor = this.draggedLocalAnchor.clone().applyQuaternion(bQuat).add(new THREE.Vector3(bTrans.x, bTrans.y, bTrans.z));

          if (this.handLine) {
            this.handLine.geometry.setFromPoints([worldAnchor, this.handTargetPoint]);
            this.handLine.visible = true;
          }

          const diff = this.handTargetPoint.clone().sub(worldAnchor);
          const linvel = this.draggedBody.linvel();
          const mass = Math.max(0.01, this.draggedBody.mass());

          // Stable, gentle tractor spring tuned for LEGO parts (10g - 200g)
          // Clamps maximum velocity to 0.75 m/s and limits impulse to prevent wild flying
          const desiredVelX = Math.max(-0.75, Math.min(0.75, diff.x * 25.0));
          const desiredVelY = Math.max(-0.75, Math.min(0.75, diff.y * 25.0));
          const desiredVelZ = Math.max(-0.75, Math.min(0.75, diff.z * 25.0));

          const maxImpulse = mass * 0.25;
          const impX = Math.max(-maxImpulse, Math.min(maxImpulse, (desiredVelX - linvel.x) * mass * 0.7));
          const impY = Math.max(-maxImpulse, Math.min(maxImpulse, (desiredVelY - linvel.y) * mass * 0.7));
          const impZ = Math.max(-maxImpulse, Math.min(maxImpulse, (desiredVelZ - linvel.z) * mass * 0.7));

          this.draggedBody.applyImpulseAtPoint(
            { x: impX, y: impY, z: impZ },
            { x: worldAnchor.x, y: worldAnchor.y, z: worldAnchor.z },
            true
          );
          this.draggedBody.wakeUp();
        }

        if (this.toolMode === 'technic_bar' && this.technicBarBody) {
          this.technicBarBody.setNextKinematicTranslation({
            x: this.technicBarTarget.x,
            y: this.technicBarHeight,
            z: this.technicBarTarget.z,
          });
          if (this.technicBarMesh) {
            this.technicBarMesh.position.set(
              this.technicBarTarget.x,
              this.technicBarHeight,
              this.technicBarTarget.z
            );
          }
        }

        this.physicsWorld.step();
        for (const [clusterId, body] of this.physicsBodies.entries()) {
          const grp = this.clusterMeshGroups.get(clusterId);
          if (grp) {
            const t = body.translation();
            const r = body.rotation();
            grp.position.set(t.x, t.y, t.z);
            grp.quaternion.set(r.x, r.y, r.z, r.w);
          }
        }
      }

      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  private stopLoop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  public open(missionId: string = 'M01'): void {
    this.overlay.style.display = 'flex';
    this.initThree();
    this.startLoop();
    requestAnimationFrame(() => {
      this.onResize();
      this.loadMissionModel(missionId);
    });
  }

  public close(): void {
    this.overlay.style.display = 'none';
    this.stopStepPlay();
    this.stopPhysicsSandbox();
    this.stopLoop();
  }

  public inspectSpec(spec: RobotAssemblySpec, name: string = 'Custom Model', id: string = 'custom'): void {
    this.currentMissionId = id;
    this.currentSpec = spec;
    this.currentThumbnailUrl = null;
    this.updateThumbnailDom(null);
    this.build3DRepresentation(spec);
    this.updateReportDom(spec, name, id);
    this.resetCamera();
  }

  public async loadMissionModel(missionId: string): Promise<void> {
    this.currentMissionId = missionId;
    const select = this.overlay.querySelector('#inspector-mission-select') as HTMLSelectElement;
    if (select) {
      const exists = Array.from(select.options).some((o) => o.value === missionId);
      if (exists) select.value = missionId;
    }

    let specConfig = SEASON_MISSIONS_CONFIG.find((m) => m.id === missionId);
    if (!specConfig) {
      specConfig = SEASON_MISSIONS_CONFIG[0];
      if (!specConfig) return;
    }

    try {
      const fileUrl = resolveAssetUrl(specConfig.ioFile);
      const res = await fetch(fileUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buffer = await res.arrayBuffer();
      await this.inspectBinaryArchive(buffer, specConfig.name, specConfig.id);
    } catch (err) {
      console.error(`[CadModelInspector] Failed to load ${missionId}:`, err);
    }
  }

  public async loadFromFile(file: File): Promise<void> {
    const buffer = await file.arrayBuffer();
    const name = file.name.replace(/\.(io|ldr|mpd)$/i, '');
    this.currentMissionId = name;
    await this.inspectBinaryArchive(buffer, name, name);
  }

  private async inspectBinaryArchive(buffer: ArrayBuffer, name: string, id: string): Promise<void> {
    const zip = new JSZip();
    let thumbUrl: string | null = null;
    let spec: RobotAssemblySpec;

    try {
      const archive = await zip.loadAsync(buffer);
      const thumbFile = archive.file('thumbnail.png');
      if (thumbFile) {
        const b64 = await thumbFile.async('base64');
        thumbUrl = `data:image/png;base64,${b64}`;
      }
      spec = await LDrawImporter.parseStudioIo(buffer);
    } catch {
      const dec = new TextDecoder();
      const text = dec.decode(buffer);
      const parsed = LDrawImporter.parseLDrawText(text, name);
      const { CadClusteringPreSolver } = await import('../cad/clustering-solver');
      spec = CadClusteringPreSolver.solve(parsed);
    }

    this.currentSpec = spec;
    this.currentThumbnailUrl = thumbUrl;

    this.updateThumbnailDom(thumbUrl);
    await this.build3DRepresentation(spec);
    this.updateReportDom(spec, name, id);
    this.resetCamera();
  }

  private updateThumbnailDom(url: string | null): void {
    const img = this.overlay.querySelector('#inspector-thumbnail-img') as HTMLImageElement;
    if (url) {
      img.src = url;
      img.style.display = 'block';
    } else {
      img.src = '';
      img.style.display = 'none';
    }
  }

  private async build3DRepresentation(spec: RobotAssemblySpec): Promise<void> {
    this.modelGroup.clear();
    this.colliderGroup.clear();
    this.clusterMeshGroups.clear();
    this.initialMeshPoses.clear();
    this.inspectedSteps = [];
    if (this.highlightHelper) {
      this.scene.remove(this.highlightHelper);
      this.highlightHelper = null;
    }
    legoAssetManager.resetStats();

    // Restore any custom cluster isFixed overrides
    try {
      const key = `fll_mission_${this.currentMissionId}_clusters_override`;
      const raw = localStorage.getItem(key);
      if (raw) {
        const overrides = JSON.parse(raw);
        for (const c of spec.clusters) {
          if (overrides[c.clusterId]?.isFixed !== undefined) {
            c.isFixed = overrides[c.clusterId].isFixed;
          }
        }
      }
    } catch {
      // ignore
    }

    const clusterPalette = [
      LEGO_COLORS.DARK_BLUE,
      LEGO_COLORS.RED,
      LEGO_COLORS.YELLOW,
      LEGO_COLORS.DARK_GRAY,
      LEGO_COLORS.LIGHT_GRAY,
      LEGO_COLORS.AZURE,
      LEGO_COLORS.ORANGE,
    ];

    let colorIdx = 0;

    // Centering & ground normalization
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    let minColliderBottom = Infinity;

    for (const cluster of spec.clusters) {
      if (cluster.parts) {
        for (const p of cluster.parts) {
          const px = p.position[0] / 1000;
          const pz = p.position[2] / 1000;
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (pz < minZ) minZ = pz;
          if (pz > maxZ) maxZ = pz;
        }
      }
      for (const col of cluster.colliders) {
        const cy = col.offset[1];
        let hy = 0.015;
        if (col.shape === 'sphere') hy = col.radius || 0.015;
        else if (col.shape === 'cylinder') hy = col.halfHeight || 0.02;
        else if (col.halfExtents) hy = col.halfExtents[1];
        const bottom = cy - hy;
        if (bottom < minColliderBottom) minColliderBottom = bottom;
      }
    }

    const offsetX = minX !== Infinity ? -(minX + maxX) / 2 : 0;
    const offsetY = minColliderBottom !== Infinity ? -minColliderBottom : 0;
    const offsetZ = minZ !== Infinity ? -(minZ + maxZ) / 2 : 0;

    for (const cluster of spec.clusters) {
      const clusterColor = clusterPalette[colorIdx % clusterPalette.length];
      colorIdx++;

      const clusterObj = new THREE.Group();
      clusterObj.position.set(offsetX, offsetY, offsetZ);
      clusterObj.userData = { clusterId: cluster.clusterId };
      this.clusterMeshGroups.set(cluster.clusterId, clusterObj);

      // Render authentic LEGO bricks with Draco GLB / procedural engine
      if (cluster.parts && cluster.parts.length > 0) {
        for (const part of cluster.parts) {
          const pColor = part.colorHex ?? clusterColor;
          const mesh = await legoAssetManager.loadPartMesh(part.partNumber, pColor, part.role);
          mesh.position.set(part.position[0] / 1000, part.position[1] / 1000, part.position[2] / 1000);
          mesh.quaternion.set(part.rotation[0], part.rotation[1], part.rotation[2], part.rotation[3]);
          mesh.userData = { clusterId: cluster.clusterId, partId: part.id };
          clusterObj.add(mesh);

          this.inspectedSteps.push({
            stepIndex: this.inspectedSteps.length + 1,
            part,
            clusterIndex: colorIdx,
            clusterName: cluster.name,
            isRootChassis: !!cluster.isRootChassis,
            mesh,
          });
        }
      }
      this.modelGroup.add(clusterObj);
      this.initialMeshPoses.set(cluster.clusterId, {
        pos: clusterObj.position.clone(),
        quat: clusterObj.quaternion.clone(),
      });

      // Build collider visualization
      for (const col of cluster.colliders) {
        const hx = col.halfExtents ? col.halfExtents[0] : 0.03;
        const hy = col.halfExtents ? col.halfExtents[1] : 0.015;
        const hz = col.halfExtents ? col.halfExtents[2] : 0.03;
        const geom = new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2);
        const mat = new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          wireframe: true,
          transparent: true,
          opacity: 0.8,
        });
        const colMesh = new THREE.Mesh(geom, mat);
        colMesh.position.set(col.offset[0] + offsetX, col.offset[1] + offsetY, col.offset[2] + offsetZ);
        this.colliderGroup.add(colMesh);
      }
    }

    const statusDesc = this.overlay.querySelector('#engine-status-desc') as HTMLDivElement | null;
    if (statusDesc) {
      const stats = legoAssetManager.getStats();
      if (stats.mode === 'draco_glb') {
        statusDesc.innerHTML = `Active: <strong style="color: #38bdf8;">⚡ Draco GLB</strong> (<span style="color:#4ade80;">${stats.dracoHits} GLB assets</span>, <span style="color:#fbbf24;">${stats.proceduralFallbacks} procedural fallbacks</span>)`;
      } else {
        statusDesc.innerHTML = `Active: <strong style="color: #f97316;">🧱 Native Procedural</strong> (${stats.proceduralFallbacks} procedural meshes)`;
      }
    }

    const slider = this.overlay.querySelector('#step-scrubber-slider') as HTMLInputElement | null;
    if (slider) {
      slider.max = `${Math.max(1, this.inspectedSteps.length)}`;
      slider.value = `${this.inspectedSteps.length}`;
    }

    // Rebuild physics world if Live Physics is currently active
    if (this.isPhysicsRunning) {
      await this.buildPhysicsWorld();
    }
  }

  /**
   * Toggles the live Rapier physics simulation sandbox within the inspector
   */
  public async toggleLivePhysics(): Promise<void> {
    if (this.isPhysicsRunning) {
      this.stopPhysicsSandbox();
    } else {
      await this.startPhysicsSandbox();
    }
  }

  public async startPhysicsSandbox(): Promise<void> {
    if (!this.currentSpec) return;
    await RAPIER.init();
    await this.buildPhysicsWorld();
    this.isPhysicsRunning = true;

    const btnTogglePhysics = this.overlay.querySelector('#btn-toggle-physics') as HTMLButtonElement | null;
    if (btnTogglePhysics) {
      btnTogglePhysics.classList.add('btn-physics-active');
      btnTogglePhysics.textContent = '⏸ Pause Physics: ON';
    }

    const toolGroup = this.overlay.querySelector('#inspector-tool-mode-group') as HTMLElement | null;
    const btnResetPhys = this.overlay.querySelector('#btn-reset-physics') as HTMLElement | null;
    if (toolGroup) toolGroup.style.display = 'inline-flex';
    if (btnResetPhys) btnResetPhys.style.display = 'inline-flex';
    this.setToolMode(this.toolMode);
  }

  public stopPhysicsSandbox(): void {
    this.isPhysicsRunning = false;
    this.onPointerUp();

    const btnTogglePhysics = this.overlay.querySelector('#btn-toggle-physics') as HTMLButtonElement | null;
    if (btnTogglePhysics) {
      btnTogglePhysics.classList.remove('btn-physics-active');
      btnTogglePhysics.textContent = '▶ Live Physics: OFF';
    }

    const toolGroup = this.overlay.querySelector('#inspector-tool-mode-group') as HTMLElement | null;
    const btnResetPhys = this.overlay.querySelector('#btn-reset-physics') as HTMLElement | null;
    const heightBadge = this.overlay.querySelector('#technic-bar-height-badge') as HTMLElement | null;
    if (toolGroup) toolGroup.style.display = 'none';
    if (btnResetPhys) btnResetPhys.style.display = 'none';
    if (heightBadge) heightBadge.style.display = 'none';

    if (this.reticleMesh) this.reticleMesh.visible = false;
    if (this.technicBarMesh) this.technicBarMesh.visible = false;
  }

  private async buildPhysicsWorld(): Promise<void> {
    if (!this.currentSpec) return;

    if (this.physicsWorld) {
      this.physicsWorld.free();
      this.physicsWorld = null;
    }
    this.physicsBodies.clear();

    this.physicsWorld = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

    // Static ground plane at workbench floor level (Y = 0)
    const groundDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.05, 0);
    const groundBody = this.physicsWorld.createRigidBody(groundDesc);
    const groundCol = RAPIER.ColliderDesc.cuboid(5.0, 0.05, 5.0)
      .setFriction(0.8)
      .setRestitution(0.0);
    this.physicsWorld.createCollider(groundCol, groundBody);

    for (const cluster of this.currentSpec.clusters) {
      const isFixed = cluster.isFixed !== undefined
        ? cluster.isFixed
        : (this.currentSpec.joints.length === 0 || cluster.isRootChassis);
      const clusterGroup = this.clusterMeshGroups.get(cluster.clusterId);
      const initPos = clusterGroup?.position || new THREE.Vector3();
      const initQuat = clusterGroup?.quaternion || new THREE.Quaternion();

      let bodyDesc: RAPIER.RigidBodyDesc;
      if (isFixed || this.isSolidMode) {
        bodyDesc = RAPIER.RigidBodyDesc.fixed()
          .setTranslation(initPos.x, initPos.y, initPos.z)
          .setRotation({ x: initQuat.x, y: initQuat.y, z: initQuat.z, w: initQuat.w });
      } else {
        bodyDesc = RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(initPos.x, initPos.y, initPos.z)
          .setRotation({ x: initQuat.x, y: initQuat.y, z: initQuat.z, w: initQuat.w })
          .setLinearDamping(1.5)
          .setAngularDamping(2.0)
          .setAdditionalMass(Math.max(0.05, cluster.totalMassKg));
      }

      const body = this.physicsWorld.createRigidBody(bodyDesc);
      this.physicsBodies.set(cluster.clusterId, body);

      for (const col of cluster.colliders) {
        let colDesc: RAPIER.ColliderDesc;
        if (col.shape === 'sphere') {
          colDesc = RAPIER.ColliderDesc.ball(col.radius || 0.015);
        } else if (col.shape === 'cylinder') {
          colDesc = RAPIER.ColliderDesc.cylinder(col.halfHeight || 0.02, col.radius || 0.015);
        } else {
          const hx = col.halfExtents ? col.halfExtents[0] : 0.03;
          const hy = col.halfExtents ? col.halfExtents[1] : 0.015;
          const hz = col.halfExtents ? col.halfExtents[2] : 0.03;
          colDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz);
        }

        // Collision filtering:
        // Group 3 (0x0008): Fixed base clusters
        // Group 4 (0x0010): Dynamic mechanism clusters
        const membership = (isFixed || this.isSolidMode) ? 0x0008 : 0x0010;
        const filter = 0xFFFF;
        colDesc.setCollisionGroups((membership << 16) | filter);

        colDesc.setTranslation(col.offset[0], col.offset[1], col.offset[2])
          .setFriction(col.friction || 0.6)
          .setRestitution(col.restitution || 0.05);
        this.physicsWorld.createCollider(colDesc, body);
      }
    }

    // Connect kinematic joints
    for (const joint of this.currentSpec.joints) {
      const parentBody = this.physicsBodies.get(joint.parentClusterId);
      const childBody = this.physicsBodies.get(joint.childClusterId);
      if (parentBody && childBody) {
        const jointData = joint.type === 'SPHERICAL'
          ? RAPIER.JointData.spherical(
              { x: joint.anchorParent[0], y: joint.anchorParent[1], z: joint.anchorParent[2] },
              { x: joint.anchorChild[0], y: joint.anchorChild[1], z: joint.anchorChild[2] }
            )
          : RAPIER.JointData.revolute(
              { x: joint.anchorParent[0], y: joint.anchorParent[1], z: joint.anchorParent[2] },
              { x: joint.anchorChild[0], y: joint.anchorChild[1], z: joint.anchorChild[2] },
              { x: joint.axis[0], y: joint.axis[1], z: joint.axis[2] }
            );
        const j = this.physicsWorld.createImpulseJoint(jointData, parentBody, childBody, true);
        j.setContactsEnabled(false);
      }
    }

    // Create Kinematic Technic Bar probe body for mechanical pushing & testing
    const barDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(this.technicBarTarget.x, this.technicBarHeight, this.technicBarTarget.z);
    this.technicBarBody = this.physicsWorld.createRigidBody(barDesc);
    const barCol = RAPIER.ColliderDesc.cuboid(0.028, 0.004, 0.004)
      .setFriction(0.7)
      .setRestitution(0.1);
    barCol.setCollisionGroups((0x0020 << 16) | 0xFFFF);
    this.physicsWorld.createCollider(barCol, this.technicBarBody);

    if (this.toolMode !== 'technic_bar') {
      this.technicBarBody.setNextKinematicTranslation({ x: 0, y: -100, z: 0 });
    }
  }

  public resetPhysicsPoses(): void {
    if (!this.currentSpec) return;

    for (const [clusterId, body] of this.physicsBodies.entries()) {
      const initPose = this.initialMeshPoses.get(clusterId);
      if (initPose) {
        body.setTranslation({ x: initPose.pos.x, y: initPose.pos.y, z: initPose.pos.z }, true);
        body.setRotation({ x: initPose.quat.x, y: initPose.quat.y, z: initPose.quat.z, w: initPose.quat.w }, true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
    }

    // Sync visual meshes immediately
    for (const [clusterId, grp] of this.clusterMeshGroups.entries()) {
      const initPose = this.initialMeshPoses.get(clusterId);
      if (initPose) {
        grp.position.copy(initPose.pos);
        grp.quaternion.copy(initPose.quat);
      }
    }

    if (this.toolMode === 'technic_bar') {
      this.technicBarHeight = 0.035;
      this.technicBarTarget.set(0, 0.035, 0);
      if (this.technicBarBody) {
        this.technicBarBody.setTranslation({ x: 0, y: 0.035, z: 0 }, true);
      }
      if (this.technicBarMesh) {
        this.technicBarMesh.position.set(0, 0.035, 0);
      }
      this.updateTechnicBarBadge();
    }
  }

  public getToolMode(): 'grab' | 'technic_bar' {
    return this.toolMode;
  }

  public setToolMode(mode: 'grab' | 'technic_bar'): void {
    this.toolMode = mode;
    const btnToolGrab = this.overlay.querySelector('#btn-tool-grab') as HTMLButtonElement | null;
    const btnToolBar = this.overlay.querySelector('#btn-tool-technic-bar') as HTMLButtonElement | null;
    const heightBadge = this.overlay.querySelector('#technic-bar-height-badge') as HTMLElement | null;

    if (mode === 'grab') {
      btnToolGrab?.classList.add('btn-primary', 'active');
      btnToolGrab?.classList.remove('btn-outline');
      btnToolBar?.classList.remove('btn-primary', 'active');
      btnToolBar?.classList.add('btn-outline');

      if (heightBadge) heightBadge.style.display = 'none';
      if (this.technicBarMesh) this.technicBarMesh.visible = false;
      if (this.technicBarBody) {
        this.technicBarBody.setNextKinematicTranslation({ x: 0, y: -100, z: 0 });
      }
    } else {
      btnToolBar?.classList.add('btn-primary', 'active');
      btnToolBar?.classList.remove('btn-outline');
      btnToolGrab?.classList.remove('btn-primary', 'active');
      btnToolGrab?.classList.add('btn-outline');

      if (heightBadge) {
        heightBadge.style.display = this.isPhysicsRunning ? 'block' : 'none';
        heightBadge.textContent = `🥢 Technic Bar: ${(this.technicBarHeight * 1000).toFixed(0)}mm (Scroll wheel to adjust height)`;
      }
      if (this.technicBarMesh) this.technicBarMesh.visible = this.isPhysicsRunning;
      if (this.reticleMesh) this.reticleMesh.visible = false;
      if (this.technicBarBody) {
        this.technicBarBody.setNextKinematicTranslation({
          x: this.technicBarTarget.x,
          y: this.technicBarHeight,
          z: this.technicBarTarget.z,
        });
      }
    }
  }

  private updateTechnicBarBadge(): void {
    const badge = this.overlay.querySelector('#technic-bar-height-badge') as HTMLElement | null;
    if (badge) {
      badge.textContent = `🥢 Technic Bar: ${(this.technicBarHeight * 1000).toFixed(0)}mm (Scroll wheel to adjust height)`;
    }
  }

  private rebuildPhysicsIfRunning(): void {
    if (this.isPhysicsRunning) {
      this.buildPhysicsWorld();
    }
  }

  private toggleClusterAnchor(clusterId: string): void {
    if (!this.currentSpec) return;
    const cluster = this.currentSpec.clusters.find((c) => c.clusterId === clusterId);
    if (!cluster) return;

    const currentFixed = cluster.isFixed !== undefined
      ? cluster.isFixed
      : (this.currentSpec.joints.length === 0 || cluster.isRootChassis);
    cluster.isFixed = !currentFixed;

    this.saveClusterOverrides();

    // If physics is running, update the body immediately
    if (this.isPhysicsRunning && this.physicsBodies.has(clusterId)) {
      const body = this.physicsBodies.get(clusterId)!;
      body.setBodyType(
        cluster.isFixed ? RAPIER.RigidBodyType.Fixed : RAPIER.RigidBodyType.Dynamic,
        true
      );
      if (!cluster.isFixed) {
        body.wakeUp();
      }
    }

    this.renderClusterList();
  }

  private selectCluster(clusterId: string): void {
    this.selectedClusterId = clusterId;
    const clusterGroup = this.clusterMeshGroups.get(clusterId);

    if (this.highlightHelper) {
      this.scene.remove(this.highlightHelper);
      this.highlightHelper = null;
    }

    const nudgeCard = this.overlay.querySelector('#cluster-nudge-card') as HTMLElement | null;
    const nudgeTitle = this.overlay.querySelector('#cluster-nudge-title') as HTMLElement | null;

    if (clusterGroup) {
      this.highlightHelper = new THREE.BoxHelper(clusterGroup, 0x38bdf8);
      this.scene.add(this.highlightHelper);

      if (nudgeCard && nudgeTitle) {
        const cluster = this.currentSpec?.clusters.find((c) => c.clusterId === clusterId);
        nudgeTitle.textContent = `Nudge Position: ${cluster?.name || clusterId}`;
        nudgeCard.style.display = 'block';
      }
    } else {
      if (nudgeCard) nudgeCard.style.display = 'none';
    }

    this.renderClusterList();
  }

  private nudgeCluster(clusterId: string, axis: 'x' | 'y' | 'z', deltaMm: number): void {
    if (!this.currentSpec) return;
    const cluster = this.currentSpec.clusters.find((c) => c.clusterId === clusterId);
    if (!cluster || !cluster.parts) return;

    const deltaM = deltaMm / 1000;

    for (const p of cluster.parts) {
      if (axis === 'x') p.position[0] += deltaMm;
      if (axis === 'y') p.position[1] += deltaMm;
      if (axis === 'z') p.position[2] += deltaMm;
    }

    for (const col of cluster.colliders) {
      if (axis === 'x') col.offset[0] += deltaM;
      if (axis === 'y') col.offset[1] += deltaM;
      if (axis === 'z') col.offset[2] += deltaM;
    }

    const grp = this.clusterMeshGroups.get(clusterId);
    if (grp) {
      if (axis === 'x') grp.position.x += deltaM;
      if (axis === 'y') grp.position.y += deltaM;
      if (axis === 'z') grp.position.z += deltaM;

      const initPose = this.initialMeshPoses.get(clusterId);
      if (initPose) {
        initPose.pos.copy(grp.position);
      }
    }

    if (this.physicsBodies.has(clusterId)) {
      const body = this.physicsBodies.get(clusterId)!;
      const trans = body.translation();
      body.setTranslation({
        x: axis === 'x' ? trans.x + deltaM : trans.x,
        y: axis === 'y' ? trans.y + deltaM : trans.y,
        z: axis === 'z' ? trans.z + deltaM : trans.z,
      }, true);
      body.wakeUp();
    }

    if (this.highlightHelper && grp) {
      this.highlightHelper.update();
    }
  }

  private saveClusterOverrides(): void {
    if (!this.currentSpec) return;
    try {
      const key = `fll_mission_${this.currentMissionId}_clusters_override`;
      const overrides: Record<string, { isFixed?: boolean }> = {};
      for (const c of this.currentSpec.clusters) {
        overrides[c.clusterId] = { isFixed: c.isFixed };
      }
      localStorage.setItem(key, JSON.stringify(overrides));
    } catch {
      // ignore
    }
  }

  private saveFieldCoordinates(): void {
    const inputX = this.overlay.querySelector('#input-field-x') as HTMLInputElement | null;
    const inputZ = this.overlay.querySelector('#input-field-z') as HTMLInputElement | null;
    const inputYaw = this.overlay.querySelector('#input-field-yaw') as HTMLInputElement | null;
    if (!inputX || !inputZ || !inputYaw) return;

    const x = parseFloat(inputX.value) || 0;
    const z = parseFloat(inputZ.value) || 0;
    const yaw = parseFloat(inputYaw.value) || 0;

    saveMissionArenaPosition(this.currentMissionId, { x, y: 0.002, z }, yaw);
    this.callbacks.onUpdateFieldPosition?.(this.currentMissionId, { x, y: 0.002, z }, yaw);
  }

  private renderClusterList(): void {
    if (!this.currentSpec) return;
    const clusterList = this.overlay.querySelector('#inspector-clusters-list') as HTMLElement;
    if (!clusterList) return;

    clusterList.innerHTML = this.currentSpec.clusters
      .map((c, i) => {
        const isFixed = c.isFixed !== undefined
          ? c.isFixed
          : (this.currentSpec?.joints.length === 0 || c.isRootChassis);
        const pCount = c.parts?.length || c.partIds.length;
        const isSelected = this.selectedClusterId === c.clusterId;

        return `
          <div class="cluster-item ${isSelected ? 'selected' : ''}" data-cluster-id="${c.clusterId}">
            <div class="cluster-item-header">
              <span class="cluster-name">Cluster ${i + 1}: ${c.name}</span>
              <button class="btn btn-xs ${isFixed ? 'btn-fixed' : 'btn-dynamic'} btn-toggle-anchor" data-cluster-id="${c.clusterId}" title="Toggle anchor to field mat">
                ${isFixed ? '📌 Fixed to Field' : '🔄 Dynamic / Movable'}
              </button>
            </div>
            <div class="cluster-item-meta">${pCount} LEGO elements • Mass: ${Math.round(c.totalMassKg * 1000)}g</div>
            <div class="cluster-item-actions">
              <button class="btn btn-xs btn-outline btn-select-cluster" data-cluster-id="${c.clusterId}">
                ${isSelected ? '🎯 Selected' : '🔍 Select / Nudge'}
              </button>
            </div>
          </div>
        `;
      })
      .join('');

    // Attach row events
    clusterList.querySelectorAll('.btn-toggle-anchor').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const cid = btn.getAttribute('data-cluster-id');
        if (cid) this.toggleClusterAnchor(cid);
      });
    });

    clusterList.querySelectorAll('.btn-select-cluster').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const cid = btn.getAttribute('data-cluster-id');
        if (cid) this.selectCluster(cid);
      });
    });

    clusterList.querySelectorAll('.cluster-item').forEach((row) => {
      row.addEventListener('click', () => {
        const cid = row.getAttribute('data-cluster-id');
        if (cid) this.selectCluster(cid);
      });
    });
  }

  private updateReportDom(spec: RobotAssemblySpec, _name: string, id: string): void {
    const totalParts = spec.clusters.reduce((sum, c) => sum + (c.parts?.length || c.partIds.length), 0);
    const totalMass = Math.round(spec.clusters.reduce((sum, c) => sum + c.totalMassKg, 0) * 1000);

    const submodelNames = new Set<string>();
    for (const c of spec.clusters) {
      if (c.parts) {
        for (const p of c.parts) {
          if (p.submodel) submodelNames.add(p.submodel);
        }
      }
    }
    const submodelCount = Math.max(1, submodelNames.size);

    (this.overlay.querySelector('#metric-parts-count') as HTMLElement).textContent = `${totalParts}`;
    (this.overlay.querySelector('#metric-submodels-count') as HTMLElement).textContent = `${submodelCount}`;
    (this.overlay.querySelector('#metric-clusters-count') as HTMLElement).textContent = `${spec.clusters.length}`;
    (this.overlay.querySelector('#metric-mass') as HTMLElement).textContent = `${totalMass} g`;

    // Calculate dimensions in mm
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (const cluster of spec.clusters) {
      if (cluster.parts) {
        for (const p of cluster.parts) {
          const px = p.position[0];
          const py = p.position[1];
          const pz = p.position[2];
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
          if (pz < minZ) minZ = pz;
          if (pz > maxZ) maxZ = pz;
        }
      }
    }

    const sizeX = minX !== Infinity ? maxX - minX : 0;
    const sizeY = minY !== Infinity ? maxY - minY : 0;
    const sizeZ = minZ !== Infinity ? maxZ - minZ : 0;

    const studsX = (sizeX / 8).toFixed(1);
    const studsZ = (sizeZ / 8).toFixed(1);
    const platesY = (sizeY / 3.2).toFixed(1);

    (this.overlay.querySelector('#dim-x') as HTMLElement).textContent = `${sizeX.toFixed(1)} mm (${studsX} studs)`;
    (this.overlay.querySelector('#dim-z') as HTMLElement).textContent = `${sizeZ.toFixed(1)} mm (${studsZ} studs)`;
    (this.overlay.querySelector('#dim-y') as HTMLElement).textContent = `${sizeY.toFixed(1)} mm (${platesY} plates)`;

    // Render cluster list with interactive anchor toggles
    this.renderClusterList();

    // Populate field position inputs
    const config = SEASON_MISSIONS_CONFIG.find((m) => m.id === id);
    if (config) {
      const pose = getMissionArenaPosition(config);
      const inputX = this.overlay.querySelector('#input-field-x') as HTMLInputElement | null;
      const inputZ = this.overlay.querySelector('#input-field-z') as HTMLInputElement | null;
      const inputYaw = this.overlay.querySelector('#input-field-yaw') as HTMLInputElement | null;
      if (inputX) inputX.value = `${pose.x.toFixed(2)}`;
      if (inputZ) inputZ.value = `${pose.z.toFixed(2)}`;
      if (inputYaw) inputYaw.value = `${pose.yawDegrees}`;
    }

    // Parts List / BOM Table DOM
    const bomTbody = this.overlay.querySelector('#inspector-bom-tbody') as HTMLElement | null;
    if (bomTbody) {
      const bom =
        spec.bom && spec.bom.length > 0
          ? spec.bom
          : LDrawImporter.extractBomFromParts(spec.clusters.flatMap((c) => c.parts || []));

      bomTbody.innerHTML = bom
        .map((entry) => {
          const badgeHtml = entry.hasAccurateMesh
            ? '<span style="color:#4ade80; font-weight: 600;">✅ 3D Mesh</span>'
            : '<span style="color:#f59e0b; font-weight: 600;">⚠️ 2x2 Plate</span>';
          return `
            <tr style="border-bottom: 1px solid #1e293b;">
              <td style="padding: 4px; font-family: monospace; color: #38bdf8;">${entry.partNumber}</td>
              <td style="padding: 4px; font-weight: bold;">${entry.count}x</td>
              <td style="padding: 4px; color: #cbd5e1;" title="${entry.name}">${entry.name}</td>
              <td style="padding: 4px;">${badgeHtml}</td>
            </tr>
          `;
        })
        .join('');
    }
  }

  private setWireframe(wireframe: boolean): void {
    this.modelGroup.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => (m.wireframe = wireframe));
        } else {
          child.material.wireframe = wireframe;
        }
      }
    });
  }

  private resetCamera(): void {
    if (!this.controls || !this.camera) return;
    const box = new THREE.Box3().setFromObject(this.modelGroup);
    if (!box.isEmpty()) {
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 0.08);
      const dist = maxDim * 2.2;
      this.camera.position.set(center.x + dist * 0.75, center.y + dist * 0.55, center.z + dist * 0.75);
      this.controls.target.copy(center);
      this.camera.near = Math.max(0.005, dist / 100);
      this.camera.far = Math.max(20, dist * 20);
      this.camera.updateProjectionMatrix();
    } else {
      this.camera.position.set(0.35, 0.25, 0.35);
      this.controls.target.set(0, 0.05, 0);
    }
  }

  // =========================================================================
  // Assembly Step Debugger Methods
  // =========================================================================

  private toggleStepMode(): void {
    this.isStepMode = !this.isStepMode;
    const btnToggle = this.overlay.querySelector('#btn-toggle-step-mode');
    const controls = this.overlay.querySelector('#step-playback-controls') as HTMLElement;
    const sliderRow = this.overlay.querySelector('#step-slider-row') as HTMLElement;
    const activeStepCard = this.overlay.querySelector('#inspector-active-step-card') as HTMLElement;

    if (this.isStepMode) {
      if (btnToggle) btnToggle.textContent = '🧱 Step Build Mode: ON';
      controls.style.display = 'flex';
      sliderRow.style.display = 'flex';
      activeStepCard.style.display = 'block';
      this.setStep(1);
    } else {
      this.stopStepPlay();
      if (btnToggle) btnToggle.textContent = '🧱 Step Build Mode: OFF';
      controls.style.display = 'none';
      sliderRow.style.display = 'none';
      activeStepCard.style.display = 'none';
      if (this.highlightHelper) {
        this.scene.remove(this.highlightHelper);
        this.highlightHelper = null;
      }
      for (const item of this.inspectedSteps) {
        item.mesh.visible = true;
      }
      const counter = this.overlay.querySelector('#step-counter-display');
      if (counter) counter.textContent = 'All parts visible';
    }
  }

  private setStep(stepIndex: number): void {
    if (!this.inspectedSteps.length) return;
    const target = Math.max(1, Math.min(stepIndex, this.inspectedSteps.length));
    this.currentStepIndex = target;

    const slider = this.overlay.querySelector('#step-scrubber-slider') as HTMLInputElement;
    if (slider) slider.value = `${target}`;

    const counter = this.overlay.querySelector('#step-counter-display');
    if (counter) counter.textContent = `Step ${target} of ${this.inspectedSteps.length}`;

    for (let i = 0; i < this.inspectedSteps.length; i++) {
      this.inspectedSteps[i].mesh.visible = i < target;
    }

    const currentItem = this.inspectedSteps[target - 1];
    if (currentItem) {
      if (this.highlightHelper) {
        this.scene.remove(this.highlightHelper);
      }
      this.highlightHelper = new THREE.BoxHelper(currentItem.mesh, 0x38bdf8);
      this.scene.add(this.highlightHelper);

      const detailsEl = this.overlay.querySelector('#active-step-details');
      if (detailsEl) {
        const p = currentItem.part;
        const colorHex = '#' + (p.colorHex || 0xffffff).toString(16).padStart(6, '0');
        detailsEl.innerHTML = `
          <div class="step-detail-row">
            <span>Part:</span>
            <span class="font-mono highlight-blue">${p.partNumber} (${p.role})</span>
          </div>
          <div class="step-detail-row">
            <span>Submodel:</span>
            <span class="text-xs">${p.submodel || 'main'}</span>
          </div>
          <div class="step-detail-row">
            <span>Color:</span>
            <span><span class="color-sample-dot" style="background-color: ${colorHex};"></span> ${colorHex}</span>
          </div>
          <div class="step-detail-row">
            <span>Cluster:</span>
            <span>${currentItem.clusterName} (${currentItem.isRootChassis ? '📌 Fixed' : '🔄 Dynamic'})</span>
          </div>
        `;
      }
    }
  }

  private startStepPlay(): void {
    if (this.stepPlayTimer !== null) return;
    const btnPlay = this.overlay.querySelector('#btn-step-play');
    if (btnPlay) btnPlay.textContent = '⏸ Pause';

    const speedSelect = this.overlay.querySelector('#step-speed-select') as HTMLSelectElement;
    const speed = speedSelect ? parseFloat(speedSelect.value) || 5 : 5;
    const intervalMs = Math.max(30, 1000 / speed);

    this.stepPlayTimer = window.setInterval(() => {
      if (this.currentStepIndex >= this.inspectedSteps.length) {
        this.setStep(1);
      } else {
        this.setStep(this.currentStepIndex + 1);
      }
    }, intervalMs);
  }

  private stopStepPlay(): void {
    if (this.stepPlayTimer !== null) {
      clearInterval(this.stepPlayTimer);
      this.stepPlayTimer = null;
    }
    const btnPlay = this.overlay.querySelector('#btn-step-play');
    if (btnPlay) btnPlay.textContent = '▶ Play';
  }
}
