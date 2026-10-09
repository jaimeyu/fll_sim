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

  // 2. Pins & Bushings (e.g. 2780, 3673, 6558, 32054, 43093, 3713, 4265c, 26287)
  if (role === 'FASTENER_PIN' || role === 'FASTENER_BUSH' || /^(2780|3673|6558|32054|43093|3713|4265c|26287)$/.test(clean)) {
    if (clean === '3713' || clean === '4265c') {
      // Technic Bushing
      const h = clean === '4265c' ? 0.004 : 0.0078;
      const geom = new THREE.CylinderGeometry(0.0036, 0.0036, h, 14);
      geom.rotateZ(Math.PI / 2);
      const m = new THREE.Mesh(geom, mat);
      m.castShadow = true;
      return m;
    }
    const is3L = clean === '6558' || clean === '32054';
    const len = is3L ? 0.024 : 0.016;
    const geom = new THREE.CylinderGeometry(0.0024, 0.0024, len, 12);
    geom.rotateZ(Math.PI / 2);
    const m = new THREE.Mesh(geom, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  // 3. Axles & Axle Connectors (e.g. 3704, 3705, 3706, 3707, 3708, 3737, 50450, 32062, 18654)
  if (role === 'FASTENER_AXLE' || /^370[4-9]/.test(clean) || clean === '32062' || clean === '18654') {
    const lMatch = clean.match(/^370(\d)/);
    const lengthStuds = lMatch ? parseInt(lMatch[1], 10) : clean === '32062' ? 2 : 4;
    const len = lengthStuds * 0.008;
    const geom = new THREE.CylinderGeometry(0.0024, 0.0024, len, 8);
    geom.rotateZ(Math.PI / 2);
    const m = new THREE.Mesh(geom, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  // 4. Technic Rectangular Frames (e.g. 64179 5x7 frame, 39794 7x11 frame)
  if (clean === '64179' || clean === '39794') {
    const wHoles = clean === '64179' ? 5 : 7;
    const lHoles = clean === '64179' ? 7 : 11;
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

  // 5. Technic Beams / Liftarms (e.g. 32523, 32316, 32524, 32525, 40490, 60483, 32009, 32271)
  if (role === 'STRUCTURAL_BEAM' || /^(3252[3-6]|32316|40490|60483|32009|32271)/.test(clean)) {
    let holes = 5;
    if (clean === '32523') holes = 3;
    else if (clean === '32316') holes = 5;
    else if (clean === '32524') holes = 7;
    else if (clean === '40490') holes = 9;
    else if (clean === '32525') holes = 11;
    else if (clean === '32526') holes = 13;
    else if (clean === '60483' || clean === '32271') holes = 3;
    else if (clean === '32009') holes = 7;
    return createTechnicBeamGroup(holes, colorHex);
  }

  // 6. Connectors (e.g. 32013, 32014, 89678, 32034, 32184, 62462, 25214)
  if (/^(32013|32014|32015|32016|89678|32034|32184|62462|25214)$/.test(clean)) {
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

  // 6b. Flexible Technic Axle 19L (50450)
  if (clean === '50450') {
    const len = 0.264; // 660 LDU = 264mm spanning between guide track anchors
    const geom = new THREE.CylinderGeometry(0.0024, 0.0024, len, 16);
    geom.rotateZ(Math.PI / 2); // Aligned along X axis
    const m = new THREE.Mesh(geom, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  // 7. Technic Panels (e.g. 64782)
  if (clean === '64782') {
    const geom = new THREE.BoxGeometry(0.024, 0.088, 0.003);
    const m = new THREE.Mesh(geom, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  // 8. Foliage / Flowers / Plants (e.g. 32607, 24866, 209)
  if (/^(32607|24866|209)$/.test(clean)) {
    const plantGroup = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const angle = (i * 2 * Math.PI) / 3;
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

  // 9. Slope Bricks & Curved Slopes (e.g. 3039, 3040, 3040b, 15068, 11477, 14719, 85984, 28192)
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

  // 10. Round Plates & Discs (e.g. 2654, 15535, 4032, 2447, 85861, 18674, 30340)
  if (/^(2654|15535|4032|2447|85861|18674|30340)$/.test(clean)) {
    const radius = clean === '85861' ? 0.004 : 0.008;
    const height = 0.0032;
    const geom = new THREE.CylinderGeometry(radius, radius, height, 16);
    const m = new THREE.Mesh(geom, mat);
    m.position.set(0, -height / 2, 0);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  // 11. Smooth Tiles (without studs, e.g. 2431 1x4, 3069/3069b 1x2, 3068b 2x2, 6636 1x6)
  if (/^(2431|3069|3069b|3068|3068b|6636)$/.test(clean)) {
    let tw = 1, tl = 2;
    if (clean.startsWith('2431')) { tw = 1; tl = 4; }
    else if (clean.startsWith('3068')) { tw = 2; tl = 2; }
    else if (clean.startsWith('6636')) { tw = 1; tl = 6; }
    return createLegoPlateGroup(tw, tl, colorHex, 1, false);
  }

  // 12. Standard Bricks & Plates with Genuine Studs (e.g. 3001 2x4, 3003 2x2, 3004 1x2, 3005 1x1, 3010 1x4, 3020 2x4, 3035 4x8, etc.)
  let w = 2, l = 2, hPlates = 1;
  if (/^(3024|3005)$/.test(clean)) { w = 1; l = 1; }
  else if (/^(3023|3023b|3004|3700|35480)$/.test(clean)) { w = 1; l = 2; }
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

