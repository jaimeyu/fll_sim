import * as THREE from 'three';

/**
 * 3M Dual Lock Reclosable Fastener 3D Visual Marker
 * Renders an authentic polyolefin backing, mushroom-stem interlocking head array,
 * and a floating high-contrast anchor beacon visible from all camera perspectives.
 */
export class DualLockMarker {
  public readonly group: THREE.Group;
  private beaconMaterial: THREE.MeshStandardMaterial;
  private ringMaterial: THREE.MeshBasicMaterial;
  private basePlate: THREE.Mesh;
  private beaconMesh: THREE.Mesh;
  private ringMesh: THREE.Mesh;
  public elementId: string;

  constructor(elementId: string) {
    this.elementId = elementId;
    this.group = new THREE.Group();
    this.group.name = 'dual-lock-pad';
    this.group.userData = { elementId, isDualLockMarker: true };

    // 1. Lower 3M Base Plate (black polyolefin backing)
    const baseGeo = new THREE.BoxGeometry(0.042, 0.003, 0.042);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.85,
      metalness: 0.2,
    });
    this.basePlate = new THREE.Mesh(baseGeo, baseMat);
    this.basePlate.position.y = 0.0015;
    this.basePlate.castShadow = true;
    this.basePlate.receiveShadow = true;
    this.group.add(this.basePlate);

    // 2. Interlocking Mushroom Grid Top (textured look)
    const gridGeo = new THREE.BoxGeometry(0.038, 0.0015, 0.038);
    const gridMat = new THREE.MeshStandardMaterial({
      color: 0x27272a,
      roughness: 0.9,
      metalness: 0.3,
    });
    const gridMesh = new THREE.Mesh(gridGeo, gridMat);
    gridMesh.position.y = 0.0035;
    this.group.add(gridMesh);

    // 3. Official 3M Dual Lock peel tab accent
    const tabGeo = new THREE.BoxGeometry(0.012, 0.0008, 0.006);
    const tabMat = new THREE.MeshBasicMaterial({ color: 0xdc2626 });
    const tabMesh = new THREE.Mesh(tabGeo, tabMat);
    tabMesh.position.set(0.016, 0.0045, 0.016);
    this.group.add(tabMesh);

    // 4. Vibrant 3D Visual Beacon (High-contrast anchor pin floating above mat)
    this.ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x06b6d4, // Cyan
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75,
    });
    const ringGeo = new THREE.RingGeometry(0.014, 0.024, 24);
    ringGeo.rotateX(-Math.PI / 2);
    this.ringMesh = new THREE.Mesh(ringGeo, this.ringMaterial);
    this.ringMesh.position.y = 0.004;
    this.group.add(this.ringMesh);

    // Floating pin shaft & spherical head
    const pinShaftGeo = new THREE.CylinderGeometry(0.002, 0.002, 0.018, 12);
    const pinShaftMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.8,
      roughness: 0.2,
    });
    const pinShaft = new THREE.Mesh(pinShaftGeo, pinShaftMat);
    pinShaft.position.y = 0.012;
    this.group.add(pinShaft);

    this.beaconMaterial = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x0891b2,
      emissiveIntensity: 0.8,
      roughness: 0.3,
      metalness: 0.1,
    });
    const beaconGeo = new THREE.SphereGeometry(0.006, 16, 16);
    this.beaconMesh = new THREE.Mesh(beaconGeo, this.beaconMaterial);
    this.beaconMesh.position.y = 0.022;
    this.group.add(this.beaconMesh);

    // Tag group and children with marker metadata for raycasting
    this.group.userData = { isDualLockMarker: true, elementId };
    this.basePlate.userData = { isDualLockMarker: true, elementId };
    this.beaconMesh.userData = { isDualLockMarker: true, elementId };
  }

  public setPosition(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
  }

  public setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  public isVisible(): boolean {
    return this.group.visible;
  }

  public setHoverHighlight(isHovered: boolean, isEraseMode: boolean = false): void {
    if (!this.group.visible) return;

    if (isHovered) {
      if (isEraseMode) {
        // Red Erase Mode
        this.beaconMaterial.color.setHex(0xef4444);
        this.beaconMaterial.emissive.setHex(0xdc2626);
        this.beaconMaterial.emissiveIntensity = 1.6;
        this.ringMaterial.color.setHex(0xef4444);
        this.ringMaterial.opacity = 0.95;
      } else {
        // Cyan Highlight Mode
        this.beaconMaterial.color.setHex(0x38bdf8);
        this.beaconMaterial.emissive.setHex(0x0284c7);
        this.beaconMaterial.emissiveIntensity = 1.4;
        this.ringMaterial.color.setHex(0x38bdf8);
        this.ringMaterial.opacity = 0.95;
      }
    } else {
      // Normal Idle State
      this.beaconMaterial.color.setHex(0x06b6d4);
      this.beaconMaterial.emissive.setHex(0x0891b2);
      this.beaconMaterial.emissiveIntensity = 0.8;
      this.ringMaterial.color.setHex(0x06b6d4);
      this.ringMaterial.opacity = 0.75;
    }
  }

  public getRaycastTargets(): THREE.Object3D[] {
    return [this.basePlate, this.beaconMesh, this.ringMesh];
  }

  public destroy(): void {
    this.group.clear();
  }
}
