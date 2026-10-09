import * as THREE from 'three';

/**
 * Authentic LEGO Dimensions & Constants (in meters)
 * 1 LDU (LDraw Unit) = 0.4 mm
 * 1 LEGO Stud pitch = 8.0 mm = 0.008 m
 * 1 LEGO Plate height = 3.2 mm = 0.0032 m
 * 1 LEGO Brick height = 9.6 mm = 0.0096 m
 * Technic hole diameter = 4.8 mm (radius = 2.4 mm = 0.0024 m)
 * Technic pin diameter = 4.8 mm = 0.0048 m
 * LEGO Stud diameter = 4.8 mm (radius = 2.4 mm), height = 1.8 mm (0.0018 m)
 */

export const LEGO_COLORS = {
  YELLOW: 0xfacc15,       // SPIKE Prime Hub & Rim Yellow
  AZURE: 0x06b6d4,        // SPIKE Prime Motor & Frame Teal / Medium Azure
  RED: 0xef4444,          // Bright Red Push Plates & Accents
  LIGHT_GRAY: 0x94a3b8,   // Light Bluish Gray Technic Beams & Gears
  DARK_GRAY: 0x334155,    // Dark Bluish Gray Baseplates & Chassis
  BLACK: 0x18181b,        // Technic Friction Pins & Rubber Tires
  WHITE: 0xf8fafc,        // White Hub Display, Sensors & Chevrons
  GREEN: 0x10b981,        // High-Vis Green Scoring Indicators & Flags
  ORANGE: 0xf97316,       // Orange Interaction & Tool Accents
  DARK_BLUE: 0x1e3a8a,    // Anchor Brackets
} as const;

// Shared Material Cache for Peak Rendering Performance
const materialCache = new Map<number, THREE.MeshStandardMaterial>();

export function getLegoMaterial(color: number, roughness = 0.32, metalness = 0.02): THREE.MeshStandardMaterial {
  const key = color * 100 + Math.round(roughness * 10);
  let mat = materialCache.get(key);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
    });
    materialCache.set(key, mat);
  }
  return mat;
}

// Reusable Shared Stud Geometry
const studGeom = new THREE.CylinderGeometry(0.0024, 0.0024, 0.0018, 16);
studGeom.translate(0, 0.0009, 0); // Origin at base of stud

/**
 * Creates an authentic LEGO Technic Liftarm Beam with rounded semicircular ends
 * and punched Technic holes at exact 8mm LEGO pitch.
 */
export function createTechnicBeamGroup(
  lengthHoles: number,
  color: number = LEGO_COLORS.LIGHT_GRAY,
  options: { thickness?: number; width?: number; withPinsAt?: number[] } = {}
): THREE.Group {
  const group = new THREE.Group();
  const pitch = 0.008; // 8mm hole-to-hole spacing
  const beamWidth = options.width ?? 0.0076; // ~7.6mm width
  const beamThick = options.thickness ?? 0.0078; // ~7.8mm height
  const holeRadius = 0.0024; // 4.8mm diameter
  const beamMat = getLegoMaterial(color);
  const holeMat = getLegoMaterial(LEGO_COLORS.BLACK, 0.8, 0.0);
  const pinMat = getLegoMaterial(LEGO_COLORS.BLACK, 0.5, 0.1);

  const spanLength = (lengthHoles - 1) * pitch;

  // 1. Center rectangular bar
  if (spanLength > 0.0001) {
    const centerGeom = new THREE.BoxGeometry(spanLength, beamThick, beamWidth);
    const centerMesh = new THREE.Mesh(centerGeom, beamMat);
    centerMesh.castShadow = true;
    centerMesh.receiveShadow = true;
    group.add(centerMesh);
  }

  // 2. Rounded semicircular ends
  const endCapGeom = new THREE.CylinderGeometry(beamWidth / 2, beamWidth / 2, beamThick, 16);
  endCapGeom.rotateX(Math.PI / 2);

  const endLeft = new THREE.Mesh(endCapGeom, beamMat);
  endLeft.position.set(-spanLength / 2, 0, 0);
  endLeft.castShadow = true;
  group.add(endLeft);

  const endRight = new THREE.Mesh(endCapGeom, beamMat);
  endRight.position.set(spanLength / 2, 0, 0);
  endRight.castShadow = true;
  group.add(endRight);

  // 3. Technic cylindrical through-holes along beam
  const holeGeom = new THREE.CylinderGeometry(holeRadius, holeRadius, beamThick + 0.0004, 12);
  const pinHeadGeom = new THREE.CylinderGeometry(holeRadius * 1.25, holeRadius * 1.25, beamThick * 1.3, 12);

  for (let i = 0; i < lengthHoles; i++) {
    const holeX = -spanLength / 2 + i * pitch;
    const isPin = options.withPinsAt?.includes(i);

    if (isPin) {
      // Realistic Technic friction pin inserted into hole
      const pinMesh = new THREE.Mesh(pinHeadGeom, pinMat);
      pinMesh.position.set(holeX, 0, 0);
      pinMesh.castShadow = true;
      group.add(pinMesh);
    } else {
      // Contrasting inner hole cylinder showing through-hole
      const holeMesh = new THREE.Mesh(holeGeom, holeMat);
      holeMesh.position.set(holeX, 0, 0);
      group.add(holeMesh);
    }
  }

  return group;
}

/**
 * Creates a LEGO Studded Plate or Brick with genuine embossed cylindrical studs on top.
 */
export function createLegoPlateGroup(
  widthStuds: number,
  lengthStuds: number,
  color: number = LEGO_COLORS.DARK_GRAY,
  heightPlates: number = 1
): THREE.Group {
  const group = new THREE.Group();
  const pitch = 0.008; // 8mm per stud
  const totalW = widthStuds * pitch;
  const totalL = lengthStuds * pitch;
  const totalH = heightPlates * 0.0032; // 3.2mm per plate

  const bodyMat = getLegoMaterial(color);

  // Base Plate body
  const bodyGeom = new THREE.BoxGeometry(totalW, totalH, totalL);
  const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
  bodyMesh.position.set(0, totalH / 2, 0);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  group.add(bodyMesh);

  // Array of LEGO Studs on top face
  const totalStuds = widthStuds * lengthStuds;
  if (totalStuds > 0) {
    const studMat = getLegoMaterial(color, 0.28);
    const instancedStuds = new THREE.InstancedMesh(studGeom, studMat, totalStuds);
    instancedStuds.castShadow = true;

    const dummy = new THREE.Object3D();
    let idx = 0;
    const startX = -totalW / 2 + pitch / 2;
    const startZ = -totalL / 2 + pitch / 2;

    for (let wx = 0; wx < widthStuds; wx++) {
      for (let lz = 0; lz < lengthStuds; lz++) {
        dummy.position.set(startX + wx * pitch, totalH, startZ + lz * pitch);
        dummy.updateMatrix();
        instancedStuds.setMatrixAt(idx++, dummy.matrix);
      }
    }
    instancedStuds.instanceMatrix.needsUpdate = true;
    group.add(instancedStuds);
  }

  return group;
}

/**
 * Creates an authentic LEGO Technic Gear with gear teeth, hub flange, and cross-axle hole.
 */
export function createTechnicGearGroup(
  teeth: number = 24,
  radius: number = 0.020,
  color: number = LEGO_COLORS.LIGHT_GRAY,
  thickness: number = 0.006
): THREE.Group {
  const group = new THREE.Group();
  const gearMat = getLegoMaterial(color, 0.35);
  const holeMat = getLegoMaterial(LEGO_COLORS.BLACK, 0.7);

  // 1. Gear main disc
  const discGeom = new THREE.CylinderGeometry(radius * 0.88, radius * 0.88, thickness, 32);
  const discMesh = new THREE.Mesh(discGeom, gearMat);
  discMesh.castShadow = true;
  group.add(discMesh);

  // 2. Individual teeth around perimeter
  const toothW = (2 * Math.PI * radius) / (teeth * 2.2);
  const toothH = radius * 0.18;
  const toothGeom = new THREE.BoxGeometry(toothW, thickness * 0.95, toothH);

  for (let i = 0; i < teeth; i++) {
    const angle = (i * 2 * Math.PI) / teeth;
    const toothMesh = new THREE.Mesh(toothGeom, gearMat);
    toothMesh.position.set(
      Math.sin(angle) * (radius * 0.94),
      0,
      Math.cos(angle) * (radius * 0.94)
    );
    toothMesh.rotation.y = angle;
    toothMesh.castShadow = true;
    group.add(toothMesh);
  }

  // 3. Central Technic cross-axle hole (+)
  const crossGeom1 = new THREE.BoxGeometry(0.0048, thickness + 0.0006, 0.0016);
  const crossGeom2 = new THREE.BoxGeometry(0.0016, thickness + 0.0006, 0.0048);
  const crossMesh1 = new THREE.Mesh(crossGeom1, holeMat);
  const crossMesh2 = new THREE.Mesh(crossGeom2, holeMat);
  group.add(crossMesh1);
  group.add(crossMesh2);

  // 4. Weight-reduction lightening holes around hub (Technic 24T gear style)
  const holeRadius = 0.0024;
  const hubHoleGeom = new THREE.CylinderGeometry(holeRadius, holeRadius, thickness + 0.0004, 12);
  const numHubHoles = teeth >= 20 ? 4 : 3;
  for (let h = 0; h < numHubHoles; h++) {
    const ang = (h * 2 * Math.PI) / numHubHoles + Math.PI / numHubHoles;
    const dist = radius * 0.52;
    const hMesh = new THREE.Mesh(hubHoleGeom, holeMat);
    hMesh.position.set(Math.sin(ang) * dist, 0, Math.cos(ang) * dist);
    group.add(hMesh);
  }

  return group;
}
