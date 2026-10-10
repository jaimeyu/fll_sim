import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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

  // 1. Center rectangular bar & rounded ends (merged into 1 mesh)
  const beamGeoms: THREE.BufferGeometry[] = [];
  if (spanLength > 0.0001) {
    beamGeoms.push(new THREE.BoxGeometry(spanLength, beamThick, beamWidth));
  }
  const endCapLeft = new THREE.CylinderGeometry(beamWidth / 2, beamWidth / 2, beamThick, 16);
  endCapLeft.rotateX(Math.PI / 2);
  endCapLeft.translate(-spanLength / 2, 0, 0);
  beamGeoms.push(endCapLeft);

  const endCapRight = new THREE.CylinderGeometry(beamWidth / 2, beamWidth / 2, beamThick, 16);
  endCapRight.rotateX(Math.PI / 2);
  endCapRight.translate(spanLength / 2, 0, 0);
  beamGeoms.push(endCapRight);

  const mergedBeamGeom = BufferGeometryUtils.mergeGeometries(beamGeoms, false);
  if (mergedBeamGeom) {
    const beamMesh = new THREE.Mesh(mergedBeamGeom, beamMat);
    beamMesh.castShadow = true;
    beamMesh.receiveShadow = true;
    group.add(beamMesh);
  }
  for (const g of beamGeoms) g.dispose();

  // 2. Technic holes & pins (merged per material)
  const holeGeoms: THREE.BufferGeometry[] = [];
  const pinGeoms: THREE.BufferGeometry[] = [];

  for (let i = 0; i < lengthHoles; i++) {
    const holeX = -spanLength / 2 + i * pitch;
    const isPin = options.withPinsAt?.includes(i);

    if (isPin) {
      const pinGeom = new THREE.CylinderGeometry(holeRadius * 1.25, holeRadius * 1.25, beamThick * 1.3, 12);
      pinGeom.translate(holeX, 0, 0);
      pinGeoms.push(pinGeom);
    } else {
      const hGeom = new THREE.CylinderGeometry(holeRadius, holeRadius, beamThick + 0.0004, 12);
      hGeom.translate(holeX, 0, 0);
      holeGeoms.push(hGeom);
    }
  }

  if (pinGeoms.length > 0) {
    const mergedPins = BufferGeometryUtils.mergeGeometries(pinGeoms, false);
    if (mergedPins) {
      const pinMesh = new THREE.Mesh(mergedPins, pinMat);
      pinMesh.castShadow = true;
      group.add(pinMesh);
    }
    for (const g of pinGeoms) g.dispose();
  }

  if (holeGeoms.length > 0) {
    const mergedHoles = BufferGeometryUtils.mergeGeometries(holeGeoms, false);
    if (mergedHoles) {
      const holeMesh = new THREE.Mesh(mergedHoles, holeMat);
      group.add(holeMesh);
    }
    for (const g of holeGeoms) g.dispose();
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
  heightPlates: number = 1,
  hasStuds: boolean = true
): THREE.Group {
  const group = new THREE.Group();
  const pitch = 0.008; // 8mm per stud
  // In LDraw, length (L) is along X axis, width (W) is along Z axis
  const totalX = lengthStuds * pitch;
  const totalZ = widthStuds * pitch;
  const totalH = heightPlates * 0.0032; // 3.2mm per plate (9.6mm for brick)

  const bodyMat = getLegoMaterial(color);

  // In LDraw convention, origin (0,0,0) is at the top face where studs connect.
  // The plate/brick body extends downwards from Y = 0 to Y = -totalH.
  const bodyGeom = new THREE.BoxGeometry(totalX, totalH, totalZ);
  const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
  bodyMesh.position.set(0, -totalH / 2, 0);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  group.add(bodyMesh);

  // Array of LEGO Studs on top face (Y = 0)
  const totalStuds = widthStuds * lengthStuds;
  if (hasStuds && totalStuds > 0) {
    const studMat = getLegoMaterial(color, 0.28);
    const instancedStuds = new THREE.InstancedMesh(studGeom, studMat, totalStuds);
    instancedStuds.castShadow = true;

    const dummy = new THREE.Object3D();
    let idx = 0;
    const startX = -totalX / 2 + pitch / 2;
    const startZ = -totalZ / 2 + pitch / 2;

    for (let lx = 0; lx < lengthStuds; lx++) {
      for (let wz = 0; wz < widthStuds; wz++) {
        dummy.position.set(startX + lx * pitch, 0, startZ + wz * pitch);
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

  // 1. Gear disc & perimeter teeth (merged into 1 mesh)
  const gearGeoms: THREE.BufferGeometry[] = [];
  const discGeom = new THREE.CylinderGeometry(radius * 0.88, radius * 0.88, thickness, 32);
  gearGeoms.push(discGeom);

  const toothW = (2 * Math.PI * radius) / (teeth * 2.2);
  const toothH = radius * 0.18;

  for (let i = 0; i < teeth; i++) {
    const angle = (i * 2 * Math.PI) / teeth;
    const toothGeom = new THREE.BoxGeometry(toothW, thickness * 0.95, toothH);
    toothGeom.rotateY(angle);
    toothGeom.translate(Math.sin(angle) * (radius * 0.94), 0, Math.cos(angle) * (radius * 0.94));
    gearGeoms.push(toothGeom);
  }

  const mergedGearGeom = BufferGeometryUtils.mergeGeometries(gearGeoms, false);
  if (mergedGearGeom) {
    const gearMesh = new THREE.Mesh(mergedGearGeom, gearMat);
    gearMesh.castShadow = true;
    gearMesh.receiveShadow = true;
    group.add(gearMesh);
  }
  for (const g of gearGeoms) g.dispose();

  // 2. Cross axle hole and lightening hub holes (merged into 1 hole mesh)
  const holeGeoms: THREE.BufferGeometry[] = [];
  const crossGeom1 = new THREE.BoxGeometry(0.0048, thickness + 0.0006, 0.0016);
  const crossGeom2 = new THREE.BoxGeometry(0.0016, thickness + 0.0006, 0.0048);
  holeGeoms.push(crossGeom1, crossGeom2);

  const holeRadius = 0.0024;
  const numHubHoles = teeth >= 20 ? 4 : 3;
  for (let h = 0; h < numHubHoles; h++) {
    const ang = (h * 2 * Math.PI) / numHubHoles + Math.PI / numHubHoles;
    const dist = radius * 0.52;
    const hubHoleGeom = new THREE.CylinderGeometry(holeRadius, holeRadius, thickness + 0.0004, 12);
    hubHoleGeom.translate(Math.sin(ang) * dist, 0, Math.cos(ang) * dist);
    holeGeoms.push(hubHoleGeom);
  }

  const mergedHoles = BufferGeometryUtils.mergeGeometries(holeGeoms, false);
  if (mergedHoles) {
    const holesMesh = new THREE.Mesh(mergedHoles, holeMat);
    group.add(holesMesh);
  }
  for (const g of holeGeoms) g.dispose();

  return group;
}

/**
 * Standard LDraw Color ID to Hex Color Mapping
 */
export const LDRAW_COLOR_MAP: Record<number, number> = {
  0: 0x18181b,   // Black
  1: 0x2563eb,   // Blue
  2: 0x16a34a,   // Green
  4: 0xdc2626,   // Red
  5: 0xf43f5e,   // Dark Pink
  6: 0x78350f,   // Brown
  7: 0x94a3b8,   // Light Gray
  8: 0x475569,   // Dark Gray
  9: 0x38bdf8,   // Light Blue
  10: 0x86efac,  // Bright Green
  14: 0xfacc15,  // Yellow
  15: 0xf8fafc,  // White
  16: 0x94a3b8,  // Main Colour (Default Fallback)
  19: 0xd4b996,  // Tan
  24: 0x18181b,  // Edge Colour
  27: 0x84cc16,  // Lime
  28: 0xd97706,  // Dark Tan
  33: 0x0284c7,  // Trans-Dark Blue
  34: 0x10b981,  // Trans-Green
  36: 0xef4444,  // Trans-Red
  40: 0x000000,  // Trans-Black
  41: 0x38bdf8,  // Trans-Medium Blue
  42: 0xa3e635,  // Trans-Neon Green
  47: 0xf1f5f9,  // Trans-Clear
  70: 0x94a3b8,  // Medium Bluish Gray
  71: 0x94a3b8,  // Light Bluish Gray (Official LDraw 71)
  72: 0x334155,  // Dark Bluish Gray (Official LDraw 72)
  78: 0x86efac,  // Light Green
  84: 0xec4899,  // Medium Dark Pink
  85: 0x475569,  // Dark Bluish Gray
  86: 0x94a3b8,  // Light Bluish Gray
  212: 0x67e8f9, // Bright Light Blue
  288: 0x14532d, // Dark Green
  297: 0xdf9b00, // Warm Gold / Pearl Gold
  320: 0x991b1b, // Dark Red
  321: 0x0284c7, // Dark Azure
  322: 0x06b6d4, // Medium Azure
  323: 0x6ee7b7, // Light Aqua
  326: 0xd9f99d, // Yellowish Green
  484: 0xb45309, // Dark Orange
};

/**
 * Returns true if the part is recognized with custom 3D geometry
 * rather than the generic 2x2 fallback plate.
 */
export function isKnownLegoPart(partNumber: string, role?: string): boolean {
  const clean = partNumber.toLowerCase().replace(/\.dat$/, '').replace(/^bl_/, '');
  if (role === 'WHEEL_RIM' || role === 'TIRE_RUBBER' || role === 'CHASSIS_CORE' || role === 'MOTOR_STATOR') return true;
  if (clean.includes('57539') || clean.includes('ribbed') || clean.includes('hose')) return true;
  if (clean === '50450') return true;
  if (role === 'FASTENER_PIN' || role === 'FASTENER_BUSH' || /^(2780|3673|6558|32054|43093|3713|4265c|26287|4304|3749|11214)$/.test(clean)) return true;
  if (role === 'FASTENER_AXLE' || /^370[4-9]/.test(clean) || clean === '32062' || clean === '18654' || clean === '4519' || clean === '32073' || clean === '44294' || clean === '3737') return true;
  if (clean === '64179' || clean === '39794' || clean === '32531') return true;
  if (/^(32555|32556|32556b|32348|80431)$/.test(clean)) return true;
  if (role === 'STRUCTURAL_BEAM' || /^(3252[3-6]|32316|40490|60483|32009|32271|87618)/.test(clean)) return true;
  if (/^(32013|32014|32015|32016|89678|32034|32184|62462|25214|1750|42003|59443)$/.test(clean)) return true;
  if (/^(4740|43898)$/.test(clean)) return true;
  if (clean === '4079') return true;
  if (clean.includes('970') || clean.includes('973') || clean.includes('3626') || /^(30124b|53118|2447b|64644)$/.test(clean)) return true;
  if (clean === '64782') return true;
  if (/^(32607|24866|209|2417|33183)$/.test(clean)) return true;
  if (/^(3039|3040|3040b|15068|11477|14719|85984|28192)$/.test(clean)) return true;
  if (/^(2654|15535|4032|4032a|2447|85861|18674|30340|11213|61485|98138|6141)$/.test(clean)) return true;
  if (/^(18980|77850|68568|35480|88072|74611)$/.test(clean)) return true;
  if (/^(2431|3069|3069b|3068|3068b|6636|87079)$/.test(clean)) return true;
  if (/^(3024|3005|3023|3023b|3004|3700|3022|3003|3021|3002|3020|3001|3710|3010|3666|3009|3460|3008|3795|3034|3832|3031|3032|3035|3030|3036|3028)$/.test(clean)) return true;
  return false;
}

/**
 * Creates an authentic 3D visual mesh for a specific LEGO element,
 * with embossed cylindrical studs, hollow pin holes, or curved surfaces.
 */
export function createLegoBrickMesh(
  partNumber: string,
  colorHex: number,
  role?: string
): THREE.Object3D {
  const clean = partNumber.toLowerCase().replace(/\.dat$/, '').replace(/^bl_/, '');
  const mat = getLegoMaterial(colorHex);

  // 1. Flexible Hose / Ribbed tube segments (e.g. 57539k02, 57539k01)
  if (clean.includes('57539') || clean.includes('ribbed') || clean.includes('hose')) {
    const geom = new THREE.CylinderGeometry(0.0035, 0.0035, 0.005, 12);
    const m = new THREE.Mesh(geom, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  // 2. Flexible Technic Axle 32L / 256mm (50450)
  // Must be checked before standard axles to avoid 4-stud fallback truncation!
  if (clean === '50450') {
    const len = 0.256; // 640 LDU = 256mm (32L)
    const geom = new THREE.CylinderGeometry(0.0024, 0.0024, len, 16);
    geom.rotateZ(Math.PI / 2); // Aligned along X axis
    geom.translate(len / 2, 0, 0); // Origin in LDraw 50450 is at one end
    const m = new THREE.Mesh(geom, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  // 3. Pins & Bushings (e.g. 2780, 3673, 6558, 32054, 43093, 3713, 4265c, 26287, 4304, 3749, 11214)
  if (role === 'FASTENER_PIN' || role === 'FASTENER_BUSH' || /^(2780|3673|6558|32054|43093|3713|4265c|26287|4304|3749|11214)$/.test(clean)) {
    if (clean === '3713' || clean === '4265c') {
      // Technic Bushing
      const h = clean === '4265c' ? 0.004 : 0.0078;
      const geom = new THREE.CylinderGeometry(0.0036, 0.0036, h, 14);
      geom.rotateZ(Math.PI / 2);
      const m = new THREE.Mesh(geom, mat);
      m.castShadow = true;
      return m;
    }
    const is3L = clean === '6558' || clean === '32054' || clean === '4304' || clean === '11214';
    const len = is3L ? 0.024 : 0.016;
    const geom = new THREE.CylinderGeometry(0.0024, 0.0024, len, 12);
    geom.rotateZ(Math.PI / 2);
    const m = new THREE.Mesh(geom, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  // 4. Standard Technic Axles (e.g. 3704=2L, 3705=4L, 3706=6L, 3707=8L, 3708=10L, 3737=12L, 4519=3L, 32073=5L, 44294=7L, 32062=2L, 18654)
  if (role === 'FASTENER_AXLE' || /^370[4-9]/.test(clean) || clean === '32062' || clean === '18654' || clean === '4519' || clean === '32073' || clean === '44294' || clean === '3737') {
    let lengthStuds = 4;
    if (clean === '32062' || clean === '3704') lengthStuds = 2;
    else if (clean === '4519') lengthStuds = 3;
    else if (clean === '3705') lengthStuds = 4;
    else if (clean === '32073') lengthStuds = 5;
    else if (clean === '3706') lengthStuds = 6;
    else if (clean === '44294') lengthStuds = 7;
    else if (clean === '3707') lengthStuds = 8;
    else if (clean === '3708') lengthStuds = 10;
    else if (clean === '3737') lengthStuds = 12;
    else {
      const lMatch = clean.match(/^370(\d)/);
      if (lMatch) lengthStuds = parseInt(lMatch[1], 10);
    }
    const len = lengthStuds * 0.008;
    const geom = new THREE.CylinderGeometry(0.0024, 0.0024, len, 8);
    geom.rotateZ(Math.PI / 2);
    const m = new THREE.Mesh(geom, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  // 5. Technic Rectangular & Open Center Frames (e.g. 64179 5x7 frame, 39794 7x11 frame, 32531 4x6 frame)
  if (clean === '64179' || clean === '39794' || clean === '32531') {
    const wHoles = clean === '64179' ? 5 : clean === '32531' ? 4 : 7;
    const lHoles = clean === '64179' ? 7 : clean === '32531' ? 6 : 11;
    const pitch = 0.008;
    const totalW = wHoles * pitch;
    const totalL = lHoles * pitch;
    const frameGroup = new THREE.Group();

    // Top beam
    const bTop = createTechnicBeamGroup(wHoles, colorHex);
    bTop.position.set(0, 0, -totalL / 2 + pitch / 2);
    frameGroup.add(bTop);

    // Bottom beam
    const bBottom = createTechnicBeamGroup(wHoles, colorHex);
    bBottom.position.set(0, 0, totalL / 2 - pitch / 2);
    frameGroup.add(bBottom);

    // Left beam
    const bLeft = createTechnicBeamGroup(lHoles - 2, colorHex);
    bLeft.rotation.y = Math.PI / 2;
    bLeft.position.set(-totalW / 2 + pitch / 2, 0, 0);
    frameGroup.add(bLeft);

    // Right beam
    const bRight = createTechnicBeamGroup(lHoles - 2, colorHex);
    bRight.rotation.y = Math.PI / 2;
    bRight.position.set(totalW / 2 - pitch / 2, 0, 0);
    frameGroup.add(bRight);

    return frameGroup;
  }

  // 6. Bent / L-Shape Liftarms (e.g. 32555, 32556, 32556b, 32348, 80431)
  if (/^(32555|32556|32556b|32348|80431)$/.test(clean)) {
    if (clean === '80431') {
      const g = new THREE.Group();
      const body = createLegoPlateGroup(1, 2, colorHex, 3, false);
      g.add(body);
      const socket = new THREE.Mesh(new THREE.SphereGeometry(0.005, 12, 10), mat);
      socket.position.set(0.008, 0, 0);
      socket.castShadow = true;
      g.add(socket);
      return g;
    }
    const lGroup = new THREE.Group();
    const is4x4 = clean === '32348';
    const arm1Holes = is4x4 ? 4 : 3;
    const arm2Holes = is4x4 ? 4 : 5;
    const pitch = 0.008;

    const beam1 = createTechnicBeamGroup(arm1Holes, colorHex);
    beam1.position.set(0, 0, 0);
    lGroup.add(beam1);

    const beam2 = createTechnicBeamGroup(arm2Holes, colorHex);
    if (is4x4) {
      beam2.rotation.y = Math.PI * 0.3;
      beam2.position.set((arm1Holes - 1) * pitch * 0.4, 0, pitch);
    } else {
      beam2.rotation.y = Math.PI / 2;
      beam2.position.set((arm1Holes - 1) * pitch / 2, 0, (arm2Holes - 1) * pitch / 2);
    }
    lGroup.add(beam2);
    return lGroup;
  }

  // 7. Technic Beams / Liftarms (e.g. 32523, 32316, 32524, 32525, 40490, 60483, 32009, 32271, 87618)
  if (role === 'STRUCTURAL_BEAM' || /^(3252[3-6]|32316|40490|60483|32009|32271|87618)/.test(clean)) {
    let holes = 5;
    if (clean === '32523' || clean === '32271') holes = 3;
    else if (clean === '60483') holes = 2;
    else if (clean === '32316' || clean === '87618') holes = 5;
    else if (clean === '32524' || clean === '32009') holes = 7;
    else if (clean === '40490') holes = 9;
    else if (clean === '32525') holes = 11;
    else if (clean === '32526') holes = 13;
    return createTechnicBeamGroup(holes, colorHex);
  }

  // 8. Connectors (e.g. 32013, 32014, 32015, 32016, 89678, 32034, 32184, 62462, 25214, 1750, 42003, 59443)
  if (/^(32013|32014|32015|32016|89678|32034|32184|62462|25214|1750|42003|59443)$/.test(clean)) {
    const group = new THREE.Group();
    const c1 = new THREE.CylinderGeometry(0.0036, 0.0036, 0.012, 12);
    const m1 = new THREE.Mesh(c1, mat);
    m1.castShadow = true;
    group.add(m1);
    const c2 = new THREE.CylinderGeometry(0.0036, 0.0036, 0.012, 12);
    c2.rotateX(Math.PI / 2);
    const m2 = new THREE.Mesh(c2, mat);
    m2.position.set(0, 0.004, 0.004);
    m2.castShadow = true;
    group.add(m2);
    return group;
  }

  // 9. Radar Dishes (e.g. 4740 2x2 dish, 43898 3x3 dish)
  if (/^(4740|43898)$/.test(clean)) {
    const radius = clean === '43898' ? 0.012 : 0.008;
    const height = clean === '43898' ? 0.006 : 0.0048;
    const dishGeom = new THREE.ConeGeometry(radius, height, 20, 1, true);
    dishGeom.rotateX(Math.PI);
    const m = new THREE.Mesh(dishGeom, mat);
    m.position.set(0, -height / 2, 0);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  // 10. Minifigure Utensil Seat 2x2 (4079)
  if (clean === '4079') {
    const chairGroup = new THREE.Group();
    const seat = createLegoPlateGroup(2, 2, colorHex, 1, false);
    chairGroup.add(seat);
    const back = createLegoPlateGroup(2, 2, colorHex, 1, false);
    back.rotation.x = Math.PI / 2;
    back.position.set(0, 0.008, -0.008);
    chairGroup.add(back);
    return chairGroup;
  }

  // 11. Minifigure Body Elements & Accessories
  if (clean.includes('970') || clean.includes('973') || clean.includes('3626') || /^(30124b|53118|2447b|64644)$/.test(clean)) {
    if (clean.includes('3626')) {
      const headGeom = new THREE.CylinderGeometry(0.005, 0.005, 0.010, 14);
      const m = new THREE.Mesh(headGeom, mat);
      m.castShadow = true;
      return m;
    } else if (clean.includes('973')) {
      const torsoGeom = new THREE.BoxGeometry(0.016, 0.014, 0.008);
      const m = new THREE.Mesh(torsoGeom, mat);
      m.castShadow = true;
      return m;
    } else if (clean.includes('970')) {
      const legGeom = new THREE.BoxGeometry(0.015, 0.016, 0.008);
      const m = new THREE.Mesh(legGeom, mat);
      m.castShadow = true;
      return m;
    } else {
      const accGeom = new THREE.CylinderGeometry(0.003, 0.003, 0.012, 10);
      const m = new THREE.Mesh(accGeom, mat);
      m.castShadow = true;
      return m;
    }
  }

  // 12. Technic Panels (e.g. 64782)
  if (clean === '64782') {
    const geom = new THREE.BoxGeometry(0.024, 0.088, 0.003);
    const m = new THREE.Mesh(geom, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  // 13. Foliage / Flowers / Plants / Coral (e.g. 32607, 24866, 209, 2417, 33183)
  if (/^(32607|24866|209|2417|33183)$/.test(clean)) {
    const plantGroup = new THREE.Group();
    const count = clean === '2417' ? 5 : 3;
    for (let i = 0; i < count; i++) {
      const angle = (i * 2 * Math.PI) / count;
      const leafGeom = new THREE.ConeGeometry(0.005, 0.014, 6);
      leafGeom.rotateZ(Math.PI / 4);
      const leaf = new THREE.Mesh(leafGeom, mat);
      leaf.position.set(Math.cos(angle) * 0.007, 0.006, Math.sin(angle) * 0.007);
      leaf.rotation.y = angle;
      leaf.castShadow = true;
      plantGroup.add(leaf);
    }
    return plantGroup;
  }

  // 14. Slope Bricks & Curved Slopes (e.g. 3039, 3040, 3040b, 15068, 11477, 14719, 85984, 28192)
  if (/^(3039|3040|3040b|15068|11477|14719|85984|28192)$/.test(clean)) {
    const is1x2 = clean === '3040' || clean === '3040b' || clean === '11477';
    const widthStuds = is1x2 ? 1 : 2;
    const lengthStuds = 2;
    const totalW = widthStuds * 0.008;
    const totalL = lengthStuds * 0.008;
    const totalH = 0.0096;

    const geom = new THREE.CylinderGeometry(0.0001, totalW / 2, totalH, 4);
    geom.rotateY(Math.PI / 4);
    geom.scale(totalL / totalW, 1, 1);
    const m = new THREE.Mesh(geom, mat);
    m.position.set(0, -totalH / 2, 0);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  // 15. Round Plates & Discs (e.g. 2654, 15535, 4032, 4032a, 2447, 85861, 18674, 30340, 11213, 61485, 98138, 6141)
  if (/^(2654|15535|4032|4032a|2447|85861|18674|30340|11213|61485|98138|6141)$/.test(clean)) {
    let radius = 0.008;
    if (clean === '11213') radius = 0.024;
    else if (clean === '85861' || clean === '98138' || clean === '6141') radius = 0.004;
    const height = 0.0032;
    const geom = new THREE.CylinderGeometry(radius, radius, height, 18);
    const m = new THREE.Mesh(geom, mat);
    m.position.set(0, -height / 2, 0);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  // 16. Brackets & Modified Plates (e.g. 18980, 77850, 68568, 35480, 88072, 74611)
  if (/^(18980|77850|68568|35480|88072|74611)$/.test(clean)) {
    return createLegoPlateGroup(1, 2, colorHex, 1, true);
  }

  // 17. Smooth Tiles (without studs, e.g. 2431 1x4, 3069/3069b 1x2, 3068b 2x2, 6636 1x6, 87079 2x4)
  if (/^(2431|3069|3069b|3068|3068b|6636|87079)$/.test(clean)) {
    let tw = 1, tl = 2;
    if (clean.startsWith('2431')) { tw = 1; tl = 4; }
    else if (clean.startsWith('3068')) { tw = 2; tl = 2; }
    else if (clean.startsWith('6636')) { tw = 1; tl = 6; }
    else if (clean.startsWith('87079')) { tw = 2; tl = 4; }
    return createLegoPlateGroup(tw, tl, colorHex, 1, false);
  }

  // 18. Standard Bricks & Plates with Genuine Studs (e.g. 3001 2x4, 3003 2x2, 3004 1x2, 3005 1x1, 3010 1x4, 3020 2x4, 3035 4x8, etc.)
  let w = 2, l = 2, hPlates = 1;
  if (/^(3024|3005)$/.test(clean)) { w = 1; l = 1; }
  else if (/^(3023|3023b|3004|3700)$/.test(clean)) { w = 1; l = 2; }
  else if (/^(3022|3003)$/.test(clean)) { w = 2; l = 2; }
  else if (/^(3021|3002)$/.test(clean)) { w = 2; l = 3; }
  else if (/^(3020|3001)$/.test(clean)) { w = 2; l = 4; }
  else if (/^(3710|3010)$/.test(clean)) { w = 1; l = 4; }
  else if (/^(3666|3009)$/.test(clean)) { w = 1; l = 6; }
  else if (/^(3460|3008)$/.test(clean)) { w = 1; l = 8; }
  else if (/^(3795)$/.test(clean)) { w = 2; l = 6; }
  else if (/^(3034)$/.test(clean)) { w = 2; l = 8; }
  else if (/^(3832)$/.test(clean)) { w = 2; l = 10; }
  else if (/^(3031)$/.test(clean)) { w = 4; l = 4; }
  else if (/^(3032)$/.test(clean)) { w = 4; l = 6; }
  else if (/^(3035)$/.test(clean)) { w = 4; l = 8; }
  else if (/^(3030)$/.test(clean)) { w = 4; l = 10; }
  else if (/^(3036)$/.test(clean)) { w = 6; l = 8; }
  else if (/^(3028)$/.test(clean)) { w = 6; l = 12; }

  // Bricks are 3 plates high (9.6mm)
  if (/^(3001|3002|3003|3004|3005|3010|3009|3008|3700)$/.test(clean)) {
    hPlates = 3;
  }

  return createLegoPlateGroup(w, l, colorHex, hPlates, true);
}

