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

  private tableMesh!: THREE.Group;
  private container: HTMLElement;

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

    // 7. Responsive Resizing
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
    const wallH = 0.077;
    const wallThick = 0.025;
    const halfL = this.matTexture.worldLength / 2;
    const halfW = this.matTexture.worldWidth / 2;

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x475569, // Modern slate border
      roughness: 0.6,
      metalness: 0.1,
    });

    // North wall (+Z)
    const wallN = new THREE.Mesh(
      new THREE.BoxGeometry(this.matTexture.worldLength + wallThick * 2, wallH, wallThick),
      wallMat
    );
    wallN.position.set(0, wallH / 2, halfW + wallThick / 2);
    wallN.castShadow = true;
    wallN.receiveShadow = true;
    this.tableMesh.add(wallN);

    // South wall (-Z)
    const wallS = new THREE.Mesh(
      new THREE.BoxGeometry(this.matTexture.worldLength + wallThick * 2, wallH, wallThick),
      wallMat
    );
    wallS.position.set(0, wallH / 2, -halfW - wallThick / 2);
    wallS.castShadow = true;
    wallS.receiveShadow = true;
    this.tableMesh.add(wallS);

    // East wall (+X)
    const wallE = new THREE.Mesh(
      new THREE.BoxGeometry(wallThick, wallH, this.matTexture.worldWidth),
      wallMat
    );
    wallE.position.set(halfL + wallThick / 2, wallH / 2, 0);
    wallE.castShadow = true;
    wallE.receiveShadow = true;
    this.tableMesh.add(wallE);

    // West wall (-X)
    const wallW = new THREE.Mesh(
      new THREE.BoxGeometry(wallThick, wallH, this.matTexture.worldWidth),
      wallMat
    );
    wallW.position.set(-halfL - wallThick / 2, wallH / 2, 0);
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
