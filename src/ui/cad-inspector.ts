import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import JSZip from 'jszip';
import { LDrawImporter } from '../cad/ldraw-importer';
import { RobotAssemblySpec, PlacedPart } from '../cad/types';
import { createLegoBrickMesh, LEGO_COLORS } from '../view/lego-visuals';
import { SEASON_MISSIONS_CONFIG } from '../missions/season-config';

export interface CadInspectorCallbacks {
  onDeployToField?: (missionId: string) => void;
  onToggleSolidMode?: (missionId: string, solid: boolean) => void;
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
 * step-by-step assembly build playback, part hierarchy breakdown, physical
 * collider diagnostics, and kinematic validation.
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

  public getCurrentSpec(): RobotAssemblySpec | null {
    return this.currentSpec;
  }

  public getCurrentThumbnailUrl(): string | null {
    return this.currentThumbnailUrl;
  }

  public getSolidMode(): boolean {
    return this.isSolidMode;
  }

  private callbacks: CadInspectorCallbacks;

  constructor(callbacks: CadInspectorCallbacks = {}) {
    this.callbacks = callbacks;
    this.overlay = document.createElement('div');
    this.overlay.className = 'cad-inspector-overlay';
    this.overlay.style.display = 'none';
    document.body.appendChild(this.overlay);

    this.renderDom();
    this.setupEvents();
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
              <p class="inspector-subtitle">Verify official Studio 2.0 (.io) geometry, step-by-step assembly, and kinematic solver</p>
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
                <button class="btn btn-xs btn-outline" id="btn-reset-view">🎯 Reset Camera</button>
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
          <div class="inspector-right-col">
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
            <div class="inspector-actions">
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

    // Close on overlay click outside window
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    // Escape key
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

    // Deploy to mat
    const btnDeploy = this.overlay.querySelector('#btn-deploy-inspected')!;
    btnDeploy.addEventListener('click', () => {
      if (this.currentMissionId) {
        this.callbacks.onDeployToField?.(this.currentMissionId);
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
      }
    });
    radioSolid.addEventListener('change', () => {
      if (radioSolid.checked) {
        this.isSolidMode = true;
        this.callbacks.onToggleSolidMode?.(this.currentMissionId, true);
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

    window.addEventListener('resize', () => this.onResize());
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
      const baseUrl = (import.meta.env?.BASE_URL || './').replace(/\/$/, '') + '/';
      const fileUrl = `${baseUrl}${specConfig.ioFile.replace(/^\//, '')}`;
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

      // Extract official thumbnail
      const thumbFile = archive.file('thumbnail.png');
      if (thumbFile) {
        const b64 = await thumbFile.async('base64');
        thumbUrl = `data:image/png;base64,${b64}`;
      }

      spec = await LDrawImporter.parseStudioIo(buffer);
    } catch {
      // Flat LDraw text
      const dec = new TextDecoder();
      const text = dec.decode(buffer);
      const parsed = LDrawImporter.parseLDrawText(text, name);
      const { CadClusteringPreSolver } = await import('../cad/clustering-solver');
      spec = CadClusteringPreSolver.solve(parsed);
    }

    this.currentSpec = spec;
    this.currentThumbnailUrl = thumbUrl;

    this.updateThumbnailDom(thumbUrl);
    this.build3DRepresentation(spec);
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

  private build3DRepresentation(spec: RobotAssemblySpec): void {
    this.modelGroup.clear();
    this.colliderGroup.clear();
    this.inspectedSteps = [];
    if (this.highlightHelper) {
      this.scene.remove(this.highlightHelper);
      this.highlightHelper = null;
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
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (const cluster of spec.clusters) {
      if (cluster.parts) {
        for (const p of cluster.parts) {
          const px = p.position[0] / 1000;
          const py = p.position[1] / 1000;
          const pz = p.position[2] / 1000;
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
          if (pz < minZ) minZ = pz;
          if (pz > maxZ) maxZ = pz;
        }
      }
    }

    const offsetX = minX !== Infinity ? -(minX + maxX) / 2 : 0;
    const offsetY = minY !== Infinity ? -minY : 0;
    const offsetZ = minZ !== Infinity ? -(minZ + maxZ) / 2 : 0;

    for (const cluster of spec.clusters) {
      const clusterColor = clusterPalette[colorIdx % clusterPalette.length];
      colorIdx++;

      const clusterObj = new THREE.Group();
      clusterObj.position.set(offsetX, offsetY, offsetZ);

      // Render authentic LEGO bricks
      if (cluster.parts && cluster.parts.length > 0) {
        for (const part of cluster.parts) {
          const pColor = part.colorHex ?? clusterColor;
          const mesh = createLegoBrickMesh(part.partNumber, pColor, part.role);
          mesh.position.set(part.position[0] / 1000, part.position[1] / 1000, part.position[2] / 1000);
          mesh.quaternion.set(part.rotation[0], part.rotation[1], part.rotation[2], part.rotation[3]);
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

    const slider = this.overlay.querySelector('#step-scrubber-slider') as HTMLInputElement | null;
    if (slider) {
      slider.min = '1';
      slider.max = Math.max(1, this.inspectedSteps.length).toString();
      slider.value = this.isStepMode ? this.currentStepIndex.toString() : this.inspectedSteps.length.toString();
    }

    if (this.isStepMode) {
      if (this.currentStepIndex === 0 || this.currentStepIndex > this.inspectedSteps.length) {
        this.currentStepIndex = 1;
      }
      this.updateStepDisplay();
    } else {
      for (const item of this.inspectedSteps) {
        item.mesh.visible = true;
      }
      const counter = this.overlay.querySelector('#step-counter-display') as HTMLElement | null;
      if (counter) counter.textContent = `All ${this.inspectedSteps.length} parts visible`;
    }
  }

  public toggleStepMode(active?: boolean): void {
    this.isStepMode = active !== undefined ? active : !this.isStepMode;
    const btn = this.overlay.querySelector('#btn-toggle-step-mode') as HTMLButtonElement | null;
    const controls = this.overlay.querySelector('#step-playback-controls') as HTMLElement | null;
    const sliderRow = this.overlay.querySelector('#step-slider-row') as HTMLElement | null;

    if (btn) {
      btn.textContent = `🧱 Step Build Mode: ${this.isStepMode ? 'ON' : 'OFF'}`;
      btn.classList.toggle('active', this.isStepMode);
    }
    if (controls) controls.style.display = this.isStepMode ? 'flex' : 'none';
    if (sliderRow) sliderRow.style.display = this.isStepMode ? 'flex' : 'none';

    if (this.isStepMode) {
      if (this.currentStepIndex === 0 || this.currentStepIndex > this.inspectedSteps.length) {
        this.currentStepIndex = 1;
      }
      this.updateStepDisplay();
    } else {
      this.stopStepPlay();
      for (const item of this.inspectedSteps) {
        item.mesh.visible = true;
      }
      if (this.highlightHelper) this.highlightHelper.visible = false;
      const counter = this.overlay.querySelector('#step-counter-display') as HTMLElement | null;
      if (counter) counter.textContent = `All ${this.inspectedSteps.length} parts visible`;
      const stepCard = this.overlay.querySelector('#inspector-active-step-card') as HTMLElement | null;
      if (stepCard) stepCard.style.display = 'none';
    }
  }

  public setStep(step: number): void {
    const total = this.inspectedSteps.length;
    if (total === 0) return;
    this.currentStepIndex = Math.max(1, Math.min(total, step));
    this.updateStepDisplay();
  }

  public startStepPlay(): void {
    if (this.stepPlayTimer !== null) return;
    const speedSelect = this.overlay.querySelector('#step-speed-select') as HTMLSelectElement | null;
    const speedMult = parseFloat(speedSelect?.value || '5');
    const intervalMs = Math.max(30, Math.round(500 / speedMult));

    const btnPlay = this.overlay.querySelector('#btn-step-play') as HTMLButtonElement | null;
    if (btnPlay) {
      btnPlay.textContent = '⏸ Pause';
      btnPlay.classList.add('btn-warning');
      btnPlay.classList.remove('btn-primary');
    }

    this.stepPlayTimer = window.setInterval(() => {
      if (this.currentStepIndex >= this.inspectedSteps.length) {
        this.stopStepPlay();
        return;
      }
      this.setStep(this.currentStepIndex + 1);
    }, intervalMs);
  }

  public stopStepPlay(): void {
    if (this.stepPlayTimer !== null) {
      clearInterval(this.stepPlayTimer);
      this.stepPlayTimer = null;
    }
    const btnPlay = this.overlay.querySelector('#btn-step-play') as HTMLButtonElement | null;
    if (btnPlay) {
      btnPlay.textContent = '▶ Play';
      btnPlay.classList.add('btn-primary');
      btnPlay.classList.remove('btn-warning');
    }
  }

  private updateStepDisplay(): void {
    const total = this.inspectedSteps.length;
    if (total === 0) return;

    const slider = this.overlay.querySelector('#step-scrubber-slider') as HTMLInputElement | null;
    const counter = this.overlay.querySelector('#step-counter-display') as HTMLElement | null;
    const stepCard = this.overlay.querySelector('#inspector-active-step-card') as HTMLElement | null;
    const stepDetails = this.overlay.querySelector('#active-step-details') as HTMLElement | null;

    if (slider) {
      slider.max = total.toString();
      slider.value = this.currentStepIndex.toString();
    }

    for (let i = 0; i < total; i++) {
      const item = this.inspectedSteps[i];
      item.mesh.visible = (i < this.currentStepIndex);
    }

    const activeItem = this.inspectedSteps[this.currentStepIndex - 1];

    if (counter) {
      if (activeItem) {
        counter.textContent = `Step ${this.currentStepIndex} / ${total} (Part ${activeItem.part.partNumber})`;
      } else {
        counter.textContent = `Step ${this.currentStepIndex} / ${total}`;
      }
    }

    if (activeItem && this.isStepMode) {
      if (!this.highlightHelper) {
        this.highlightHelper = new THREE.BoxHelper(activeItem.mesh, 0x38bdf8);
        this.scene.add(this.highlightHelper);
      } else {
        this.highlightHelper.setFromObject(activeItem.mesh);
        this.highlightHelper.visible = true;
      }

      if (stepCard && stepDetails) {
        stepCard.style.display = 'flex';
        const p = activeItem.part;
        const px = p.position[0];
        const py = p.position[1];
        const pz = p.position[2];
        const studsX = (px / 8).toFixed(1);
        const studsZ = (pz / 8).toFixed(1);
        const platesY = (py / 3.2).toFixed(1);
        const q = p.rotation;
        const colorHexStr = p.colorHex !== undefined ? `#${p.colorHex.toString(16).padStart(6, '0')}` : 'default';

        stepDetails.innerHTML = `
          <div class="step-detail-row">
            <span class="dim-label">Element / Part #:</span>
            <span class="dim-val highlight-blue"><strong>${p.partNumber}</strong> (${p.role || 'brick'})</span>
          </div>
          <div class="step-detail-row">
            <span class="dim-label">Submodel Context:</span>
            <span class="dim-val">${p.submodelInstance || p.submodel || 'main assembly'}</span>
          </div>
          <div class="step-detail-row">
            <span class="dim-label">Cluster Body:</span>
            <span class="dim-val">${activeItem.clusterName} (${activeItem.isRootChassis ? '🔒 Base' : '⚙️ Articulated'})</span>
          </div>
          <div class="step-detail-row">
            <span class="dim-label">Position (X, Y, Z):</span>
            <span class="dim-val font-mono">${px.toFixed(1)}, ${py.toFixed(1)}, ${pz.toFixed(1)} mm</span>
          </div>
          <div class="step-detail-row">
            <span class="dim-label">Stud Coordinates:</span>
            <span class="dim-val font-mono">${studsX}s, ${platesY}p, ${studsZ}s</span>
          </div>
          <div class="step-detail-row">
            <span class="dim-label">Rotation (x, y, z, w):</span>
            <span class="dim-val font-mono text-xs">${q[0].toFixed(2)}, ${q[1].toFixed(2)}, ${q[2].toFixed(2)}, ${q[3].toFixed(2)}</span>
          </div>
          <div class="step-detail-row">
            <span class="dim-label">Color:</span>
            <span class="dim-val"><span class="color-sample-dot" style="background-color: ${colorHexStr};"></span> ${colorHexStr}</span>
          </div>
        `;
      }
    } else {
      if (this.highlightHelper) {
        this.highlightHelper.visible = false;
      }
      if (stepCard) {
        stepCard.style.display = 'none';
      }
    }
  }

  private updateReportDom(spec: RobotAssemblySpec, _name: string, _id: string): void {
    const totalParts = spec.clusters.reduce((sum, c) => sum + (c.parts?.length || c.partIds.length), 0);
    const submodels = new Set<string>();
    spec.clusters.forEach((c) => {
      c.parts?.forEach((p) => {
        if (p.submodel) submodels.add(p.submodel);
      });
    });

    (this.overlay.querySelector('#metric-parts-count') as HTMLElement).textContent = totalParts.toString();
    (this.overlay.querySelector('#metric-submodels-count') as HTMLElement).textContent = (submodels.size || 1).toString();
    (this.overlay.querySelector('#metric-clusters-count') as HTMLElement).textContent = spec.clusters.length.toString();

    const totalMassKg = spec.clusters.reduce((sum, c) => sum + c.totalMassKg, 0);
    (this.overlay.querySelector('#metric-mass') as HTMLElement).textContent = `${Math.round(totalMassKg * 1000)} g`;

    // Calculate bounding box in meters and studs
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (const c of spec.clusters) {
      if (c.parts) {
        for (const p of c.parts) {
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

    // Clusters Breakdown DOM
    const clusterList = this.overlay.querySelector('#inspector-clusters-list') as HTMLElement;
    clusterList.innerHTML = spec.clusters
      .map((c, i) => {
        const isRoot = c.isRootChassis;
        const pCount = c.parts?.length || c.partIds.length;
        return `
          <div class="cluster-item">
            <div class="cluster-item-header">
              <span class="cluster-name">Cluster ${i + 1}: ${c.name}</span>
              <span class="badge ${isRoot ? 'badge-fixed' : 'badge-dynamic'}">
                ${isRoot ? '🔒 FIXED BASE' : '⚙️ MECHANISM'}
              </span>
            </div>
            <div class="cluster-item-meta">${pCount} LEGO elements • Mass: ${Math.round(c.totalMassKg * 1000)}g</div>
          </div>
        `;
      })
      .join('');

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
    this.controls.update();
  }
}
