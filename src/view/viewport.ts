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

  public onRobotDrop?: (x: number, z: number) => void;
  public onRobotDragMove?: (x: number, z: number) => void;
  public onRobotDragStart?: () => void;

  private tableMesh!: THREE.Group;
  private container: HTMLElement;

  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private isDragging = false;
  private dragOffset = new THREE.Vector2(0, 0);
  private robotHitProxy!: THREE.Mesh;
  private dropReticle!: THREE.Group;
  private robotVisualRoot: THREE.Object3D | null = null;

  // Sandbox Mode Mouse Tool
  private interactionTool: any = null;
  private isDraggingTool = false;

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

    // 6. 4x8 ft Competition Table Arena
    this.matTexture = new CompetitionMatTexture();
    this.buildTableArena();

    // 7. Interactive Drag-and-Drop Placement Support
    this.createDropReticle();
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

  public focusOnElement(pos: { x: number; y: number; z: number }): void {
    this.currentView = 'ISO';
    this.camera.position.set(pos.x, pos.y + 0.32, pos.z + 0.38);
    this.camera.lookAt(pos.x, pos.y + 0.04, pos.z);
    this.controls.target.set(pos.x, pos.y + 0.04, pos.z);
    this.controls.update();
  }

  public updateReticleYaw(yawDegrees: number): void {
    if (this.dropReticle) {
      this.dropReticle.rotation.y = (yawDegrees * Math.PI) / 180;
    }
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

    dom.addEventListener('pointerdown', (e: PointerEvent) => {
      // Only handle left mouse click / primary pointer
      if (e.button !== 0) return;
      const coords = getPointerCoords(e);

      // Check if clicking sandbox mouse pusher tool
      if (isPusherHit(coords)) {
        this.isDraggingTool = true;
        this.controls.enabled = false;
        this.container.style.cursor = 'grabbing';
        e.stopPropagation();
        e.preventDefault();
        return;
      }

      // Check if clicking robot
      if (isRobotHit(coords)) {
        this.isDragging = true;
        this.controls.enabled = false;
        this.dropReticle.visible = true;
        this.container.style.cursor = 'grabbing';
        this.onRobotDragStart?.();

        const groundHit = getGroundIntersection(coords);
        if (groundHit) {
          // Store offset from robot center to initial ground intersection
          this.dragOffset.set(
            this.robotHitProxy.position.x - groundHit.x,
            this.robotHitProxy.position.z - groundHit.z
          );
          const targetX = THREE.MathUtils.clamp(groundHit.x + this.dragOffset.x, -1.15, 1.15);
          const targetZ = THREE.MathUtils.clamp(groundHit.z + this.dragOffset.y, -0.65, 0.65);
          this.dropReticle.position.set(targetX, 0.003, targetZ);
          this.onRobotDragMove?.(targetX, targetZ);
        }

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
          this.onRobotDrop?.(clampedX, clampedZ);
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
      } else if (this.isDragging) {
        const groundHit = getGroundIntersection(coords);
        if (groundHit) {
          const targetX = THREE.MathUtils.clamp(groundHit.x + this.dragOffset.x, -1.15, 1.15);
          const targetZ = THREE.MathUtils.clamp(groundHit.z + this.dragOffset.y, -0.65, 0.65);
          this.dropReticle.position.set(targetX, 0.003, targetZ);
          this.onRobotDragMove?.(targetX, targetZ);
        }
      } else {
        // Hover indicator over pusher tool or robot
        if (isPusherHit(coords) || isRobotHit(coords)) {
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
      if (this.isDragging) {
        this.isDragging = false;
        this.controls.enabled = true;
        this.dropReticle.visible = false;
        this.container.style.cursor = 'default';
        this.onRobotDrop?.(this.dropReticle.position.x, this.dropReticle.position.z);
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
