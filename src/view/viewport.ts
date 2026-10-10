import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CompetitionMatTexture } from './mat-texture';

export type CameraViewPreset = 'ISO' | 'TOP_DOWN' | 'FOLLOW';

export class Viewport3D {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public controls: OrbitControls;
  public matTexture: CompetitionMatTexture;
  public currentView: CameraViewPreset = 'ISO';

  public onRobotDrop?: (x: number, z: number, yawDegrees?: number) => void;
  public onRobotDragMove?: (x: number, z: number, yawDegrees?: number) => void;
  public onRobotDragStart?: () => void;
  public onRobotRotate?: (yawDegrees: number) => void;

  public onElementDragStart?: (elementId: string) => void;
  public onElementDragMove?: (elementId: string, x: number, z: number, yawDegrees: number) => void;
  public onElementDrop?: (elementId: string, x: number, z: number, yawDegrees: number) => void;
  public onElementSelected?: (elementId: string | null) => void;
  public onDualLockToggle?: (elementId: string, locked: boolean, point: { x: number; z: number }) => void;

  private isDualLockToolActive: boolean = false;
  private dualLockHoverPad!: THREE.Group;

  private tableMesh!: THREE.Group;
  private container: HTMLElement;

  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private isDragging = false;
  private dragOffset = new THREE.Vector2(0, 0);
  private robotHitProxy!: THREE.Mesh;
  private dropReticle!: THREE.Group;
  private elementReticle!: THREE.Group;
  private robotVisualRoot: THREE.Object3D | null = null;
  private robotYawDegrees: number = 90;

  // Sandbox Mode Mouse Tool & Workbench & Mission Elements
  private interactionTool: any = null;
  private isDraggingTool = false;
  private workbenchMesh!: THREE.Group;
  private workbenchSpotlight!: THREE.SpotLight;
  private missionManager: any = null;
  private draggedBlock: any = null;
  private draggedMissionMechanism: any = null;
  private isDraggingElement = false;
  private selectedElement: any = null;
  private elementDragOffset = new THREE.Vector2(0, 0);
  private hoveredElement: any = null;
  private isHoveringRobot = false;

  constructor(container: HTMLElement) {
    this.container = container;

    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f172a); // Slate-900 dark theme

    // 2. Camera: Optimized near and far planes for maximum depth buffer precision
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 25);
    this.setCameraPreset('ISO');

    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement);

    // 4. Orbit Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02; // Don't dip below table plane
    this.controls.minDistance = 0.3;
    this.controls.maxDistance = 5.0;

    // 5. Lighting
    this.setupLighting();

    // 6. 4x8 ft Competition Table Arena & Dedicated Sandbox Workbench
    this.matTexture = new CompetitionMatTexture();
    this.buildTableArena();
    this.buildWorkbench();

    // 7. Interactive Drag-and-Drop Placement Support
    this.createDropReticle();
    this.createElementReticle();
    this.createDualLockHoverPad();
    this.createRobotHitProxy();
    this.setupDragAndDrop();

    // 8. Responsive Resizing
    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  private setupLighting(): void {
    // Ambient soft fill
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(ambientLight);

    // Main Sunlight Casting Crisp Shadows
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.4);
    sunLight.position.set(1.5, 3.0, 1.5);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 10;
    sunLight.shadow.camera.left = -2.0;
    sunLight.shadow.camera.right = 2.0;
    sunLight.shadow.camera.top = 2.0;
    sunLight.shadow.camera.bottom = -2.0;
    sunLight.shadow.bias = -0.0005;
    this.scene.add(sunLight);

    // Soft fill from opposite side
    const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.4);
    fillLight.position.set(-2, 2, -2);
    this.scene.add(fillLight);
  }

  private buildTableArena(): void {
    this.tableMesh = new THREE.Group();

    // Table Mat (2.362m x 1.143m)
    // Placed slightly above ground (Y = 0.002m) with polygon offset to eliminate any z-fighting
    const matGeom = new THREE.PlaneGeometry(this.matTexture.worldLength, this.matTexture.worldWidth);
    matGeom.rotateX(-Math.PI / 2);
    const matMaterial = new THREE.MeshStandardMaterial({
      map: this.matTexture.texture,
      roughness: 0.8,
      metalness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -1.0,
    });
    const matMesh = new THREE.Mesh(matGeom, matMaterial);
    matMesh.position.set(0, 0.002, 0);
    matMesh.receiveShadow = true;
    this.tableMesh.add(matMesh);

    // Wood Perimeter Boundary Walls (height 77mm, thickness 25mm)
    // In FLL rules, table walls are allowed to be spaced away from the field mat.
    const wallH = 0.077;
    const wallThick = 0.025;
    const wallMargin = 0.025; // 25mm spacing away from mat edges
    const wallHalfL = this.matTexture.worldLength / 2 + wallMargin;
    const wallHalfW = this.matTexture.worldWidth / 2 + wallMargin;

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x475569, // Modern slate border
      roughness: 0.6,
      metalness: 0.1,
    });

    // North wall (+Z)
    const wallN = new THREE.Mesh(
      new THREE.BoxGeometry(wallHalfL * 2 + wallThick * 2, wallH, wallThick),
      wallMat
    );
    wallN.position.set(0, wallH / 2, wallHalfW + wallThick / 2);
    wallN.castShadow = true;
    wallN.receiveShadow = true;
    this.tableMesh.add(wallN);

    // South wall (-Z)
    const wallS = new THREE.Mesh(
      new THREE.BoxGeometry(wallHalfL * 2 + wallThick * 2, wallH, wallThick),
      wallMat
    );
    wallS.position.set(0, wallH / 2, -wallHalfW - wallThick / 2);
    wallS.castShadow = true;
    wallS.receiveShadow = true;
    this.tableMesh.add(wallS);

    // East wall (+X)
    const wallE = new THREE.Mesh(
      new THREE.BoxGeometry(wallThick, wallH, wallHalfW * 2),
      wallMat
    );
    wallE.position.set(wallHalfL + wallThick / 2, wallH / 2, 0);
    wallE.castShadow = true;
    wallE.receiveShadow = true;
    this.tableMesh.add(wallE);

    // West wall (-X)
    const wallW = new THREE.Mesh(
      new THREE.BoxGeometry(wallThick, wallH, wallHalfW * 2),
      wallMat
    );
    wallW.position.set(-wallHalfL - wallThick / 2, wallH / 2, 0);
    wallW.castShadow = true;
    wallW.receiveShadow = true;
    this.tableMesh.add(wallW);

    // Table Wooden Base Frame Underneath
    // Positioned with top surface strictly below Y = 0 (top at Y = -0.005m) to prevent coplanar interference
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 });
    const baseMesh = new THREE.Mesh(
      new THREE.BoxGeometry(this.matTexture.worldLength + 0.1, 0.08, this.matTexture.worldWidth + 0.1),
      baseMat
    );
    baseMesh.position.set(0, -0.045, 0);
    this.tableMesh.add(baseMesh);

    this.scene.add(this.tableMesh);
  }

  private buildWorkbench(): void {
    this.workbenchMesh = new THREE.Group();
    this.workbenchMesh.visible = false; // Initially hidden in ARENA mode

    // 1. Workbench Table Top: 1.20m x 1.20m, 0.04m thick
    // Placed at Y = -0.018m so top surface is at Y = 0.002m
    const topGeom = new THREE.BoxGeometry(1.20, 0.04, 1.20);
    const topMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b, // Dark slate laboratory finish
      roughness: 0.45,
      metalness: 0.15,
    });
    const topMesh = new THREE.Mesh(topGeom, topMat);
    topMesh.position.set(0, -0.018, 0);
    topMesh.receiveShadow = true;
    this.workbenchMesh.add(topMesh);

    // 2. High-precision engineering calibration grid on top
    const gridHelper = new THREE.GridHelper(1.10, 22, 0x38bdf8, 0x334155);
    gridHelper.position.set(0, 0.0025, 0);
    this.workbenchMesh.add(gridHelper);

    // 3. Warm Walnut Wood Chamfered Trim
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x854d0e, // Rich walnut wood
      roughness: 0.35,
    });
    const trimThick = 0.025;
    const trimH = 0.045;
    const trimL = 1.20 + trimThick * 2;

    const trimN = new THREE.Mesh(new THREE.BoxGeometry(trimL, trimH, trimThick), trimMat);
    trimN.position.set(0, -0.018, 0.60 + trimThick / 2);
    trimN.castShadow = true;
    this.workbenchMesh.add(trimN);

    const trimS = new THREE.Mesh(new THREE.BoxGeometry(trimL, trimH, trimThick), trimMat);
    trimS.position.set(0, -0.018, -0.60 - trimThick / 2);
    trimS.castShadow = true;
    this.workbenchMesh.add(trimS);

    const trimE = new THREE.Mesh(new THREE.BoxGeometry(trimThick, trimH, 1.20), trimMat);
    trimE.position.set(0.60 + trimThick / 2, -0.018, 0);
    trimE.castShadow = true;
    this.workbenchMesh.add(trimE);

    const trimW = new THREE.Mesh(new THREE.BoxGeometry(trimThick, trimH, 1.20), trimMat);
    trimW.position.set(-0.60 - trimThick / 2, -0.018, 0);
    trimW.castShadow = true;
    this.workbenchMesh.add(trimW);

    // 4. Heavy Steel Legs Underneath
    const legGeom = new THREE.CylinderGeometry(0.028, 0.028, 0.75, 16);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.8 });
    const legPositions = [
      [-0.52, 0.52],
      [0.52, 0.52],
      [-0.52, -0.52],
      [0.52, -0.52],
    ];
    for (const [lx, lz] of legPositions) {
      const leg = new THREE.Mesh(legGeom, legMat);
      leg.position.set(lx, -0.40, lz);
      this.workbenchMesh.add(leg);
    }

    this.scene.add(this.workbenchMesh);

    // 5. Overhead Workbench Inspection SpotLight
    this.workbenchSpotlight = new THREE.SpotLight(0xfff7ed, 2.5);
    this.workbenchSpotlight.position.set(0, 1.4, 0.2);
    this.workbenchSpotlight.target.position.set(0, 0.04, 0);
    this.workbenchSpotlight.angle = Math.PI / 3.5;
    this.workbenchSpotlight.penumbra = 0.4;
    this.workbenchSpotlight.castShadow = true;
    this.workbenchSpotlight.shadow.mapSize.width = 1024;
    this.workbenchSpotlight.shadow.mapSize.height = 1024;
    this.workbenchSpotlight.shadow.bias = -0.0005;
    this.workbenchSpotlight.visible = false;
    this.scene.add(this.workbenchSpotlight);
    this.scene.add(this.workbenchSpotlight.target);
  }

  public setMode(mode: string): void {
    if (mode === 'ARENA') {
      this.tableMesh.visible = true;
      this.workbenchMesh.visible = false;
      this.workbenchSpotlight.visible = false;
    } else {
      this.tableMesh.visible = false;
      this.workbenchMesh.visible = true;
      this.workbenchSpotlight.visible = true;
    }
  }

  public setCameraPreset(preset: CameraViewPreset): void {
    this.currentView = preset;
    if (preset === 'ISO') {
      this.camera.position.set(0, 1.8, 1.8);
      this.camera.lookAt(0, 0, 0);
      if (this.controls) {
        this.controls.target.set(0, 0, 0);
        this.controls.update();
      }
    } else if (preset === 'TOP_DOWN') {
      this.camera.position.set(0, 2.5, 0.001); // Slight offset to prevent singularity
      this.camera.lookAt(0, 0, 0);
      if (this.controls) {
        this.controls.target.set(0, 0, 0);
        this.controls.update();
      }
    }
  }

  public updateCameraFollow(targetX: number, targetY: number, targetZ: number, yawDeg: number): void {
    if (this.currentView !== 'FOLLOW') return;

    const yawRad = (yawDeg * Math.PI) / 180;
    // Follow from behind the robot
    const distance = 0.45;
    const height = 0.3;

    const camX = targetX - Math.sin(yawRad) * distance;
    const camZ = targetZ - Math.cos(yawRad) * distance;

    this.camera.position.set(camX, targetY + height, camZ);
    this.camera.lookAt(targetX, targetY + 0.05, targetZ);
    this.controls.target.set(targetX, targetY, targetZ);
  }

  private createDropReticle(): void {
    this.dropReticle = new THREE.Group();
    this.dropReticle.visible = false;

    // Outer cyan ring (diameter 28cm)
    const ringGeom = new THREE.RingGeometry(0.12, 0.14, 36);
    ringGeom.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const outerRing = new THREE.Mesh(ringGeom, ringMat);
    this.dropReticle.add(outerRing);

    // Inner green target circle (radius 4cm)
    const innerGeom = new THREE.RingGeometry(0.03, 0.045, 24);
    innerGeom.rotateX(-Math.PI / 2);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    const innerRing = new THREE.Mesh(innerGeom, innerMat);
    this.dropReticle.add(innerRing);

    // Forward direction indicator arrow
    const arrowGeom = new THREE.ConeGeometry(0.025, 0.06, 12);
    arrowGeom.rotateX(Math.PI / 2);
    arrowGeom.translate(0, 0, 0.16);
    const arrowMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.9,
    });
    const arrowMesh = new THREE.Mesh(arrowGeom, arrowMat);
    this.dropReticle.add(arrowMesh);

    // Translucent floor highlight disc
    const diskGeom = new THREE.CircleGeometry(0.14, 32);
    diskGeom.rotateX(-Math.PI / 2);
    const diskMat = new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
    });
    const diskMesh = new THREE.Mesh(diskGeom, diskMat);
    this.dropReticle.add(diskMesh);

    this.scene.add(this.dropReticle);
  }

  private createElementReticle(): void {
    this.elementReticle = new THREE.Group();
    this.elementReticle.visible = false;

    // Outer amber ring (diameter 24cm)
    const ringGeom = new THREE.RingGeometry(0.10, 0.12, 36);
    ringGeom.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const outerRing = new THREE.Mesh(ringGeom, ringMat);
    this.elementReticle.add(outerRing);

    // Inner amber target circle
    const innerGeom = new THREE.RingGeometry(0.02, 0.035, 24);
    innerGeom.rotateX(-Math.PI / 2);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    const innerRing = new THREE.Mesh(innerGeom, innerMat);
    this.elementReticle.add(innerRing);

    // Forward direction indicator arrow
    const arrowGeom = new THREE.ConeGeometry(0.022, 0.05, 12);
    arrowGeom.rotateX(Math.PI / 2);
    arrowGeom.translate(0, 0, 0.14);
    const arrowMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.95,
    });
    const arrowMesh = new THREE.Mesh(arrowGeom, arrowMat);
    this.elementReticle.add(arrowMesh);

    // Translucent floor highlight disc
    const diskGeom = new THREE.CircleGeometry(0.12, 32);
    diskGeom.rotateX(-Math.PI / 2);
    const diskMat = new THREE.MeshBasicMaterial({
      color: 0xd97706,
      transparent: true,
      opacity: 0.20,
      side: THREE.DoubleSide,
    });
    const diskMesh = new THREE.Mesh(diskGeom, diskMat);
    this.elementReticle.add(diskMesh);

    this.scene.add(this.elementReticle);
  }

  private createDualLockHoverPad(): void {
    this.dualLockHoverPad = new THREE.Group();
    this.dualLockHoverPad.visible = false;

    // Outer cyan highlight frame
    const ringGeo = new THREE.RingGeometry(0.025, 0.040, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    this.dualLockHoverPad.add(new THREE.Mesh(ringGeo, ringMat));

    // 3D Pad box preview
    const boxGeo = new THREE.BoxGeometry(0.040, 0.004, 0.040);
    const boxMat = new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.65,
      wireframe: true,
    });
    const box = new THREE.Mesh(boxGeo, boxMat);
    box.position.y = 0.002;
    this.dualLockHoverPad.add(box);

    this.scene.add(this.dualLockHoverPad);
  }

  private createRobotHitProxy(): void {
    // Generous bounding hit cylinder around the robot (diameter 32cm, height 20cm)
    const geom = new THREE.CylinderGeometry(0.16, 0.16, 0.20, 16);
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });
    this.robotHitProxy = new THREE.Mesh(geom, mat);
    this.robotHitProxy.position.set(-0.80, 0.10, 0.32);
    this.scene.add(this.robotHitProxy);
  }

  public setRobotVisualRoot(root: THREE.Object3D): void {
    this.robotVisualRoot = root;
  }

  public updateRobotHitProxy(x: number, y: number, z: number): void {
    this.robotHitProxy.position.set(x, y + 0.10, z);
  }

  public setInteractionTool(tool: any): void {
    this.interactionTool = tool;
  }

  public setMissionManager(manager: any): void {
    this.missionManager = manager;
  }

  public focusOnElement(pos: { x: number; y: number; z: number }): void {
    this.currentView = 'ISO';
    this.camera.position.set(pos.x, pos.y + 0.32, pos.z + 0.38);
    this.camera.lookAt(pos.x, pos.y + 0.04, pos.z);
    this.controls.target.set(pos.x, pos.y + 0.04, pos.z);
    this.controls.update();
  }

  public updateReticleYaw(yawDegrees: number): void {
    this.robotYawDegrees = yawDegrees;
    if (this.dropReticle) {
      this.dropReticle.rotation.y = (yawDegrees * Math.PI) / 180;
    }
  }

  public setRobotYaw(yawDegrees: number): void {
    this.robotYawDegrees = yawDegrees;
    this.updateReticleYaw(yawDegrees);
  }

  public getRobotYaw(): number {
    return this.robotYawDegrees;
  }

  public selectMissionElement(id: string | null): void {
    if (!id || !this.missionManager) {
      this.selectedElement = null;
      if (this.elementReticle) this.elementReticle.visible = false;
      this.onElementSelected?.(null);
      return;
    }
    const elem = this.missionManager.getElement(id);
    if (elem) {
      this.selectedElement = elem;
      const pos = elem.getPosition();
      const yaw = elem.getYawDegrees ? elem.getYawDegrees() : 0;
      this.elementReticle.position.set(pos.x, 0.003, pos.z);
      this.elementReticle.rotation.y = (yaw * Math.PI) / 180;
      this.elementReticle.visible = true;
      this.onElementSelected?.(id);
    }
  }

  public getSelectedElement(): any {
    return this.selectedElement;
  }

  public updateElementTransform(id: string, pos: { x: number; y: number; z: number }, yawDegrees?: number): void {
    const elem = this.missionManager?.getElement(id);
    if (elem) {
      elem.setPosition(pos, yawDegrees);
      if (this.selectedElement === elem) {
        this.elementReticle.position.set(pos.x, 0.003, pos.z);
        if (yawDegrees !== undefined) {
          this.elementReticle.rotation.y = (yawDegrees * Math.PI) / 180;
        }
      }
    }
  }

  public setDualLockToolActive(active: boolean): void {
    this.isDualLockToolActive = active;
    if (!active && this.dualLockHoverPad) {
      this.dualLockHoverPad.visible = false;
    }
    this.container.style.cursor = active ? 'crosshair' : 'default';
  }

  public isDualLockToolActiveMode(): boolean {
    return this.isDualLockToolActive;
  }

  private setupDragAndDrop(): void {
    const dom = this.renderer.domElement;

    const getPointerCoords = (e: PointerEvent): { x: number; y: number } => {
      const rect = dom.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
      };
    };

    const isPusherHit = (coords: { x: number; y: number }): boolean => {
      if (!this.interactionTool || !this.interactionTool.isActive) return false;
      const mesh = this.interactionTool.getPusherMesh();
      if (!mesh) return false;
      this.mouse.set(coords.x, coords.y);
      this.raycaster.setFromCamera(this.mouse, this.camera);
      return this.raycaster.intersectObject(mesh, true).length > 0;
    };

    const getSpawnedBlockHit = (coords: { x: number; y: number }): any => {
      if (!this.interactionTool || !this.interactionTool.isActive) return null;
      const blocks = this.interactionTool.getSpawnedBlocks ? this.interactionTool.getSpawnedBlocks() : [];
      if (!blocks || blocks.length === 0) return null;
      this.mouse.set(coords.x, coords.y);
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const meshes = blocks.map((b: any) => b.mesh);
      const hits = this.raycaster.intersectObjects(meshes, true);
      if (hits.length > 0) {
        const hitMesh = hits[0].object;
        for (const item of blocks) {
          if (item.mesh === hitMesh || item.mesh.getObjectById(hitMesh.id)) {
            return item;
          }
        }
      }
      return null;
    };

    const getMissionMechanismHit = (coords: { x: number; y: number }): any => {
      if (!this.missionManager) return null;
      this.mouse.set(coords.x, coords.y);
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const candidates: Array<{ element: any; mesh: THREE.Object3D }> = [];
      for (const elem of this.missionManager.elements.values()) {
        if (!elem.rootGroup.visible) continue;
        const interactive = elem.getInteractiveMeshes ? elem.getInteractiveMeshes() : [];
        for (const mesh of interactive) {
          candidates.push({ element: elem, mesh });
        }
      }
      if (candidates.length === 0) return null;
      const meshes = candidates.map((c) => c.mesh);
      const hits = this.raycaster.intersectObjects(meshes, true);
      if (hits.length > 0) {
        const hitMesh = hits[0].object;
        for (const cand of candidates) {
          if (cand.mesh === hitMesh || cand.mesh.getObjectById(hitMesh.id)) {
            return cand.element;
          }
        }
      }
      return null;
    };

    const getMissionElementEntireHit = (coords: { x: number; y: number }): any => {
      if (!this.missionManager) return null;
      this.mouse.set(coords.x, coords.y);
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const groups: THREE.Object3D[] = [];
      const map = new Map<THREE.Object3D, any>();
      for (const elem of this.missionManager.elements.values()) {
        if (!elem.rootGroup.visible) continue;
        groups.push(elem.rootGroup);
        map.set(elem.rootGroup, elem);
      }
      if (groups.length === 0) return null;
      const hits = this.raycaster.intersectObjects(groups, true);
      if (hits.length > 0) {
        let curr: THREE.Object3D | null = hits[0].object;
        while (curr) {
          if (map.has(curr)) return map.get(curr);
          curr = curr.parent;
        }
      }
      return null;
    };

    const isRobotHit = (coords: { x: number; y: number }): boolean => {
      this.mouse.set(coords.x, coords.y);
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const targets: THREE.Object3D[] = [this.robotHitProxy];
      if (this.robotVisualRoot) targets.push(this.robotVisualRoot);
      const hits = this.raycaster.intersectObjects(targets, true);
      return hits.length > 0;
    };

    const getGroundIntersection = (coords: { x: number; y: number }): THREE.Vector3 | null => {
      this.mouse.set(coords.x, coords.y);
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const hit = new THREE.Vector3();
      return this.raycaster.ray.intersectPlane(this.groundPlane, hit) ? hit : null;
    };

    // 1. Mouse Wheel Rotation Listener: smoothly rotate robot or mission element
    dom.addEventListener('wheel', (e: WheelEvent) => {
      // Rotating Robot: when dragging or hovering robot
      if (this.isDragging || this.isHoveringRobot) {
        e.preventDefault();
        e.stopPropagation();
        const step = e.shiftKey ? 15 : 5;
        const delta = e.deltaY < 0 ? step : -step;
        let newYaw = (this.robotYawDegrees + delta) % 360;
        if (newYaw > 180) newYaw -= 360;
        if (newYaw < -180) newYaw += 360;
        this.robotYawDegrees = Math.round(newYaw);
        this.updateReticleYaw(this.robotYawDegrees);
        this.onRobotRotate?.(this.robotYawDegrees);
        if (this.isDragging) {
          this.onRobotDragMove?.(this.dropReticle.position.x, this.dropReticle.position.z, this.robotYawDegrees);
        }
        return;
      }

      // Rotating Mission Element: when dragging element or hovering selected element
      if (this.isDraggingElement || (this.selectedElement && this.hoveredElement === this.selectedElement)) {
        e.preventDefault();
        e.stopPropagation();
        const step = e.shiftKey ? 15 : 5;
        const delta = e.deltaY < 0 ? step : -step;
        let curYaw = this.selectedElement.getYawDegrees ? this.selectedElement.getYawDegrees() : 0;
        let newYaw = Math.round((curYaw + delta) % 360);
        if (newYaw > 180) newYaw -= 360;
        if (newYaw < -180) newYaw += 360;
        this.elementReticle.rotation.y = (newYaw * Math.PI) / 180;
        const curPos = this.selectedElement.getPosition();
        if (this.selectedElement.setRotation) {
          this.selectedElement.setRotation(newYaw);
        } else {
          this.selectedElement.setPosition(curPos, newYaw);
        }
        this.onElementDragMove?.(this.selectedElement.id, curPos.x, curPos.z, newYaw);
        return;
      }
    }, { passive: false });

    // 2. Keyboard Rotation Listener: 'R' key rotates active object by 15 degrees
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;

      if (e.key === 'r' || e.key === 'R') {
        const step = e.shiftKey ? -15 : 15;
        if (this.isDragging || this.isHoveringRobot) {
          e.preventDefault();
          let newYaw = (this.robotYawDegrees + step) % 360;
          if (newYaw > 180) newYaw -= 360;
          if (newYaw < -180) newYaw += 360;
          this.robotYawDegrees = Math.round(newYaw);
          this.updateReticleYaw(this.robotYawDegrees);
          this.onRobotRotate?.(this.robotYawDegrees);
          if (this.isDragging) {
            this.onRobotDragMove?.(this.dropReticle.position.x, this.dropReticle.position.z, this.robotYawDegrees);
          }
        } else if (this.selectedElement) {
          e.preventDefault();
          let curYaw = this.selectedElement.getYawDegrees ? this.selectedElement.getYawDegrees() : 0;
          let newYaw = Math.round((curYaw + step) % 360);
          if (newYaw > 180) newYaw -= 360;
          if (newYaw < -180) newYaw += 360;
          this.elementReticle.rotation.y = (newYaw * Math.PI) / 180;
          const curPos = this.selectedElement.getPosition();
          if (this.selectedElement.setRotation) {
            this.selectedElement.setRotation(newYaw);
          } else {
            this.selectedElement.setPosition(curPos, newYaw);
          }
          this.onElementDragMove?.(this.selectedElement.id, curPos.x, curPos.z, newYaw);
        }
      } else if (e.key === 'Escape') {
        if (this.selectedElement) {
          this.selectMissionElement(null);
        }
      }
    });

    dom.addEventListener('pointerdown', (e: PointerEvent) => {
      // Only handle left mouse click / primary pointer
      if (e.button !== 0) return;
      const coords = getPointerCoords(e);

      // 0. Check if Dual Lock Toolpoint mode is active
      if (this.isDualLockToolActive) {
        const entireElemHit = getMissionElementEntireHit(coords);
        if (entireElemHit) {
          const groundHit = getGroundIntersection(coords);
          const clickPoint = groundHit ? { x: groundHit.x, z: groundHit.z } : entireElemHit.getPosition();
          const willLock = !entireElemHit.isDualLocked;
          if (entireElemHit.setDualLocked) {
            entireElemHit.setDualLocked(willLock, clickPoint);
          }
          this.selectMissionElement(entireElemHit.id);
          this.onDualLockToggle?.(entireElemHit.id, willLock, clickPoint);
          e.stopPropagation();
          e.preventDefault();
          return;
        }
      }

      // 1. Check if clicking sandbox mouse pusher tool
      if (isPusherHit(coords)) {
        this.isDraggingTool = true;
        this.controls.enabled = false;
        this.container.style.cursor = 'grabbing';
        e.stopPropagation();
        e.preventDefault();
        return;
      }

      // 2. Check if clicking spawned LEGO test block
      const blockHit = getSpawnedBlockHit(coords);
      if (blockHit) {
        this.draggedBlock = blockHit;
        this.controls.enabled = false;
        this.container.style.cursor = 'grabbing';
        e.stopPropagation();
        e.preventDefault();
        return;
      }

      // 3. Check if clicking interactive mechanism handle (slider/rotor paddle) without Shift
      if (!e.shiftKey) {
        const mechanismHit = getMissionMechanismHit(coords);
        if (mechanismHit) {
          this.draggedMissionMechanism = mechanismHit;
          this.controls.enabled = false;
          this.container.style.cursor = 'grabbing';
          const groundHit = getGroundIntersection(coords);
          if (groundHit) {
            this.draggedMissionMechanism.applyUserDrag?.(groundHit);
          }
          e.stopPropagation();
          e.preventDefault();
          return;
        }
      }

      // 4. Check if clicking robot
      if (isRobotHit(coords)) {
        this.isDragging = true;
        this.controls.enabled = false;
        this.dropReticle.visible = true;
        this.updateReticleYaw(this.robotYawDegrees);
        this.container.style.cursor = 'grabbing';
        this.onRobotDragStart?.();

        const groundHit = getGroundIntersection(coords);
        if (groundHit) {
          this.dragOffset.set(
            this.robotHitProxy.position.x - groundHit.x,
            this.robotHitProxy.position.z - groundHit.z
          );
          const targetX = THREE.MathUtils.clamp(groundHit.x + this.dragOffset.x, -1.15, 1.15);
          const targetZ = THREE.MathUtils.clamp(groundHit.z + this.dragOffset.y, -0.65, 0.65);
          this.dropReticle.position.set(targetX, 0.003, targetZ);
          this.onRobotDragMove?.(targetX, targetZ, this.robotYawDegrees);
        }

        e.stopPropagation();
        e.preventDefault();
        return;
      }

      // 5. Check if clicking mission element body / baseplate to move and rotate it
      const entireElemHit = getMissionElementEntireHit(coords);
      if (entireElemHit) {
        this.selectedElement = entireElemHit;
        this.isDraggingElement = true;
        this.controls.enabled = false;
        this.container.style.cursor = 'grabbing';

        const elemPos = entireElemHit.getPosition();
        const elemYaw = entireElemHit.getYawDegrees ? entireElemHit.getYawDegrees() : 0;
        this.elementReticle.position.set(elemPos.x, 0.003, elemPos.z);
        this.elementReticle.rotation.y = (elemYaw * Math.PI) / 180;
        this.elementReticle.visible = true;

        const groundHit = getGroundIntersection(coords);
        if (groundHit) {
          this.elementDragOffset.set(elemPos.x - groundHit.x, elemPos.z - groundHit.z);
        } else {
          this.elementDragOffset.set(0, 0);
        }

        this.onElementSelected?.(entireElemHit.id);
        this.onElementDragStart?.(entireElemHit.id);
        e.stopPropagation();
        e.preventDefault();
        return;
      }

      // Quick Shift-Click anywhere on mat to teleport robot
      if (e.shiftKey) {
        const groundHit = getGroundIntersection(coords);
        if (groundHit) {
          const clampedX = THREE.MathUtils.clamp(groundHit.x, -1.15, 1.15);
          const clampedZ = THREE.MathUtils.clamp(groundHit.z, -0.65, 0.65);
          this.onRobotDragStart?.();
          this.onRobotDrop?.(clampedX, clampedZ, this.robotYawDegrees);
          e.stopPropagation();
        }
      }
    }, { capture: true });

    window.addEventListener('pointermove', (e: PointerEvent) => {
      const coords = getPointerCoords(e);

      if (this.isDraggingTool) {
        const groundHit = getGroundIntersection(coords);
        if (groundHit) {
          this.interactionTool?.movePusherTo(groundHit.x, groundHit.z);
        }
      } else if (this.draggedBlock) {
        const groundHit = getGroundIntersection(coords);
        if (groundHit) {
          this.interactionTool?.dragBlock(this.draggedBlock, groundHit.x, groundHit.z);
        }
      } else if (this.draggedMissionMechanism) {
        const groundHit = getGroundIntersection(coords);
        if (groundHit) {
          this.draggedMissionMechanism.applyUserDrag?.(groundHit);
        }
      } else if (this.isDragging) {
        const groundHit = getGroundIntersection(coords);
        if (groundHit) {
          const targetX = THREE.MathUtils.clamp(groundHit.x + this.dragOffset.x, -1.15, 1.15);
          const targetZ = THREE.MathUtils.clamp(groundHit.z + this.dragOffset.y, -0.65, 0.65);
          this.dropReticle.position.set(targetX, 0.003, targetZ);
          this.onRobotDragMove?.(targetX, targetZ, this.robotYawDegrees);
        }
      } else if (this.isDraggingElement && this.selectedElement) {
        const groundHit = getGroundIntersection(coords);
        if (groundHit) {
          const isArena = this.tableMesh.visible;
          const targetX = THREE.MathUtils.clamp(
            groundHit.x + this.elementDragOffset.x,
            isArena ? -1.10 : -0.45,
            isArena ? 1.10 : 0.45
          );
          const targetZ = THREE.MathUtils.clamp(
            groundHit.z + this.elementDragOffset.y,
            isArena ? -0.52 : -0.45,
            isArena ? 0.52 : 0.45
          );
          this.elementReticle.position.set(targetX, 0.003, targetZ);
          const yaw = this.selectedElement.getYawDegrees ? this.selectedElement.getYawDegrees() : 0;
          this.selectedElement.setPosition({ x: targetX, y: 0.002, z: targetZ }, yaw);
          this.onElementDragMove?.(this.selectedElement.id, targetX, targetZ, yaw);
        }
      } else {
        // Track hover state for cursor and wheel rotation targets
        this.isHoveringRobot = isRobotHit(coords);
        this.hoveredElement = getMissionElementEntireHit(coords);

        if (this.isDualLockToolActive) {
          this.container.style.cursor = 'crosshair';
          if (this.hoveredElement) {
            const groundHit = getGroundIntersection(coords);
            if (groundHit) {
              this.dualLockHoverPad.position.set(groundHit.x, 0.002, groundHit.z);
              this.dualLockHoverPad.visible = true;
            }
          } else {
            this.dualLockHoverPad.visible = false;
          }
        } else if (
          isPusherHit(coords) ||
          getSpawnedBlockHit(coords) ||
          getMissionMechanismHit(coords) ||
          this.hoveredElement ||
          this.isHoveringRobot
        ) {
          this.container.style.cursor = 'grab';
        } else {
          this.container.style.cursor = 'default';
        }
      }
    });

    const finishDrag = () => {
      if (this.isDraggingTool) {
        this.isDraggingTool = false;
        this.controls.enabled = true;
        this.container.style.cursor = 'default';
      }
      if (this.draggedBlock) {
        this.draggedBlock = null;
        this.controls.enabled = true;
        this.container.style.cursor = 'default';
      }
      if (this.draggedMissionMechanism) {
        this.draggedMissionMechanism.stopUserDrag?.();
        this.draggedMissionMechanism = null;
        this.controls.enabled = true;
        this.container.style.cursor = 'default';
      }
      if (this.isDragging) {
        this.isDragging = false;
        this.controls.enabled = true;
        this.dropReticle.visible = false;
        this.container.style.cursor = 'default';
        this.onRobotDrop?.(this.dropReticle.position.x, this.dropReticle.position.z, this.robotYawDegrees);
      }
      if (this.isDraggingElement && this.selectedElement) {
        this.isDraggingElement = false;
        this.controls.enabled = true;
        this.container.style.cursor = 'default';
        const curPos = this.selectedElement.getPosition();
        const curYaw = this.selectedElement.getYawDegrees ? this.selectedElement.getYawDegrees() : 0;
        this.onElementDrop?.(this.selectedElement.id, curPos.x, curPos.z, curYaw);
      }
    };

    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', finishDrag);
  }

  public onWindowResize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  public render(): void {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
