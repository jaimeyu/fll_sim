/**
 * four-bar-kinematics.ts
 *
 * Kinematics engine and Grashof classifier for 4-bar planar linkages calibrated in
 * LEGO Technic beam sizes (hole units).
 *
 * 1 LEGO Technic hole pitch = 8.0 mm
 */

export interface FourBarLinks {
  /** Ground / base frame link length (holes between base pivots A and D) */
  ground: number;
  /** Input / crank link length (holes between pivot A and B) */
  crank: number;
  /** Coupler / bridge link length (holes between pivot B and C) */
  coupler: number;
  /** Output / follower / rocker link length (holes between pivot D and C) */
  follower: number;
}

export interface CouplerPointDef {
  /** Distance along the coupler bar BC from B in holes (default: coupler/2) */
  alongBar: number;
  /** Distance perpendicular to bar BC in holes (positive = counter-clockwise) */
  perpendicular: number;
}

export type GrashofClassification =
  | 'CRANK_ROCKER'
  | 'DOUBLE_CRANK'
  | 'DOUBLE_ROCKER'
  | 'PARALLELOGRAM'
  | 'DELTOID'
  | 'NON_GRASHOF_TRIPLE_ROCKER'
  | 'IMPOSSIBLE_GEOMETRY';

export interface GrashofAnalysis {
  classification: GrashofClassification;
  isGrashof: boolean;
  canCrankRotate360: boolean;
  shortest: number;
  longest: number;
  sumShortLong: number;
  sumOtherTwo: number;
  description: string;
  simpleExplanation: string;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface FourBarPose {
  /** Fixed base pivot A (motor axis) at (0, 0) */
  pA: Point2D;
  /** Moving crank pin B */
  pB: Point2D;
  /** Moving coupler pin C */
  pC: Point2D;
  /** Fixed base pivot D (follower axis) at (ground, 0) */
  pD: Point2D;
  /** Optional tracer / tool point on coupler */
  pP: Point2D;
  /** Crank angle in radians (from AD line) */
  theta2Rad: number;
  /** Coupler angle in radians */
  theta3Rad: number;
  /** Follower angle in radians */
  theta4Rad: number;
  /** Transmission angle mu between coupler and follower (0° to 180°) */
  transmissionAngleDeg: number;
  /** Quality of transmission angle: 'OPTIMAL' | 'GOOD' | 'WARNING' | 'CRITICAL' */
  transmissionQuality: 'OPTIMAL' | 'GOOD' | 'WARNING' | 'CRITICAL';
  /** True if links reach closure at this angle; false if jammed/locked */
  isValidClosure: boolean;
  /** Reason if closure failed */
  errorMessage?: string;
}

export interface LinkagePreset {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  links: FourBarLinks;
  couplerPoint: CouplerPointDef;
  defaultBranch: 'OPEN' | 'CROSSED';
}

/** Standard LEGO Technic straight beam sizes by hole count */
export const LEGO_STANDARD_BEAM_SIZES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 21] as const;
export const LEGO_STUD_PITCH_MM = 8.0;

/** Convert LEGO Technic holes to millimeters */
export function holesToMm(holes: number): number {
  return holes * LEGO_STUD_PITCH_MM;
}

/** Convert millimeters to LEGO Technic holes */
export function mmToHoles(mm: number): number {
  return mm / LEGO_STUD_PITCH_MM;
}

/**
 * Analyzes the 4-bar linkage using Grashof's Theorem:
 * S + L <= P + Q
 * where S is shortest link, L is longest link, and P, Q are the other two links.
 */
export function analyzeGrashof(links: FourBarLinks): GrashofAnalysis {
  const { ground, crank, coupler, follower } = links;

  // Validation: all lengths must be positive
  if (ground <= 0 || crank <= 0 || coupler <= 0 || follower <= 0) {
    return {
      classification: 'IMPOSSIBLE_GEOMETRY',
      isGrashof: false,
      canCrankRotate360: false,
      shortest: 0,
      longest: 0,
      sumShortLong: 0,
      sumOtherTwo: 0,
      description: 'Invalid dimensions: All link lengths must be greater than zero.',
      simpleExplanation: 'Bars must have a positive length to build a real mechanism!',
    };
  }

  // Geometric feasibility check: The longest link cannot be strictly greater than the sum of the other three
  const arr = [
    { name: 'ground', len: ground },
    { name: 'crank', len: crank },
    { name: 'coupler', len: coupler },
    { name: 'follower', len: follower },
  ];
  arr.sort((a, b) => a.len - b.len);

  const S = arr[0];
  const L = arr[3];
  const P = arr[1];
  const Q = arr[2];

  const sumShortLong = S.len + L.len;
  const sumOtherTwo = P.len + Q.len;

  if (L.len > S.len + P.len + Q.len) {
    return {
      classification: 'IMPOSSIBLE_GEOMETRY',
      isGrashof: false,
      canCrankRotate360: false,
      shortest: S.len,
      longest: L.len,
      sumShortLong,
      sumOtherTwo,
      description: `Impossible linkage: The longest bar (${L.len} holes) is too long to close a quadrilateral with the other three (${S.len + P.len + Q.len} holes).`,
      simpleExplanation: 'Uh oh! The bars are too short to reach across the longest bar.',
    };
  }

  // Check Parallelogram: opposite links are equal
  const isParallelogram =
    Math.abs(ground - coupler) < 1e-4 && Math.abs(crank - follower) < 1e-4;

  const isDeltoid =
    (Math.abs(ground - crank) < 1e-4 && Math.abs(coupler - follower) < 1e-4) ||
    (Math.abs(ground - follower) < 1e-4 && Math.abs(crank - coupler) < 1e-4);

  // Grashof condition: S + L <= P + Q
  const isGrashof = sumShortLong <= sumOtherTwo + 1e-6;

  if (isParallelogram) {
    return {
      classification: 'PARALLELOGRAM',
      isGrashof: true,
      canCrankRotate360: true,
      shortest: S.len,
      longest: L.len,
      sumShortLong,
      sumOtherTwo,
      description: 'Parallelogram Linkage (Opposite bars are identical in length).',
      simpleExplanation: 'The Parallel Lifter! The floating bar stays at the exact same angle the entire time (like a forklift or desk lamp).',
    };
  }

  if (isDeltoid && isGrashof) {
    return {
      classification: 'DELTOID',
      isGrashof: true,
      canCrankRotate360: true,
      shortest: S.len,
      longest: L.len,
      sumShortLong,
      sumOtherTwo,
      description: 'Kite / Deltoid Linkage (Adjacent pairs of equal links).',
      simpleExplanation: 'A folding kite mechanism! Spins smoothly with rapid speed changes.',
    };
  }

  if (isGrashof) {
    // S is shortest
    if (S.name === 'crank') {
      return {
        classification: 'CRANK_ROCKER',
        isGrashof: true,
        canCrankRotate360: true,
        shortest: S.len,
        longest: L.len,
        sumShortLong,
        sumOtherTwo,
        description: 'Crank-Rocker Mechanism (The crank does a full 360° spin while the follower rocks back and forth).',
        simpleExplanation: 'The Windshield Wiper! Your motor can spin non-stop in circles, while the output arm wags back and forth.',
      };
    } else if (S.name === 'ground') {
      return {
        classification: 'DOUBLE_CRANK',
        isGrashof: true,
        canCrankRotate360: true,
        shortest: S.len,
        longest: L.len,
        sumShortLong,
        sumOtherTwo,
        description: 'Double-Crank / Drag Link Mechanism (Both grounded bars can make complete 360° revolutions).',
        simpleExplanation: 'The 360° Spinner! Both bars can spin in full circles at varying speeds.',
      };
    } else {
      // S is coupler or follower
      return {
        classification: 'DOUBLE_ROCKER',
        isGrashof: true,
        canCrankRotate360: false,
        shortest: S.len,
        longest: L.len,
        sumShortLong,
        sumOtherTwo,
        description: 'Grashof Double-Rocker (The coupler can rotate 360° relative to adjacent bars, but crank and follower rock).',
        simpleExplanation: 'The Playground Swing! The motor cannot spin full circles—the arms rock back and forth.',
      };
    }
  }

  // Non-Grashof (Triple-Rocker): S + L > P + Q
  return {
    classification: 'NON_GRASHOF_TRIPLE_ROCKER',
    isGrashof: false,
    canCrankRotate360: false,
    shortest: S.len,
    longest: L.len,
    sumShortLong,
    sumOtherTwo,
    description: 'Non-Grashof Triple-Rocker (S + L > P + Q: No link can make a complete 360° revolution).',
    simpleExplanation: 'The Double Swinger! No bar can do a full 360° spin. Every bar swings back and forth between two walls.',
  };
}

/**
 * Solves the position of all 4 joints for a given crank angle theta2 (in radians).
 *
 * Coordinate system:
 * Joint A (motor pivot): (0, 0)
 * Joint D (follower pivot): (ground, 0)
 * Joint B (crank pin): (crank * cos(theta2), crank * sin(theta2))
 * Joint C (coupler pin): intersection of circle(B, coupler) and circle(D, follower)
 */
export function solveFourBarPose(
  links: FourBarLinks,
  theta2Rad: number,
  branch: 'OPEN' | 'CROSSED' = 'OPEN',
  couplerPoint?: CouplerPointDef,
  prevPointC?: Point2D
): FourBarPose {
  const { ground, crank, coupler, follower } = links;

  const pA: Point2D = { x: 0, y: 0 };
  const pD: Point2D = { x: ground, y: 0 };

  const bx = crank * Math.cos(theta2Rad);
  const by = crank * Math.sin(theta2Rad);
  const pB: Point2D = { x: bx, y: by };

  // Special exact case for Parallelogram in OPEN branch
  const isParallelogram =
    Math.abs(ground - coupler) < 1e-4 && Math.abs(crank - follower) < 1e-4;

  if (isParallelogram && branch === 'OPEN') {
    const cx = bx + ground;
    const cy = by;
    const pC: Point2D = { x: cx, y: cy };
    const theta3Rad = 0; // Coupler stays perfectly horizontal
    const theta4Rad = theta2Rad; // Follower angle matches crank angle
    const muDeg = 90; // Parallelogram transmission angle is well-behaved
    const transmissionQuality = 'OPTIMAL';

    let pP: Point2D = { x: (bx + cx) / 2, y: (by + cy) / 2 };
    if (couplerPoint) {
      const alongFrac = coupler > 0 ? couplerPoint.alongBar / coupler : 0.5;
      const perpLen = couplerPoint.perpendicular;
      pP = {
        x: bx + alongFrac * ground,
        y: by + perpLen,
      };
    }

    return {
      pA,
      pB,
      pC,
      pD,
      pP,
      theta2Rad,
      theta3Rad,
      theta4Rad,
      transmissionAngleDeg: muDeg,
      transmissionQuality,
      isValidClosure: true,
    };
  }

  // Distance from B to D
  const dx = ground - bx;
  const dy = -by;
  const dBD = Math.hypot(dx, dy);

  // Check triangle closure between B, C, D
  if (dBD > coupler + follower + 1e-5) {
    return createFailedPose(
      pA,
      pB,
      pD,
      theta2Rad,
      `Linkage cannot close: Distance BD (${dBD.toFixed(2)}h) exceeds coupler + follower (${(coupler + follower).toFixed(2)}h).`
    );
  }

  if (dBD < Math.abs(coupler - follower) - 1e-5) {
    return createFailedPose(
      pA,
      pB,
      pD,
      theta2Rad,
      `Linkage cannot close: Distance BD (${dBD.toFixed(2)}h) is less than |coupler - follower| (${Math.abs(coupler - follower).toFixed(2)}h).`
    );
  }

  if (dBD < 1e-5) {
    return createFailedPose(pA, pB, pD, theta2Rad, 'Singularity: Pivot B coincides with Pivot D.');
  }

  // Circle intersection:
  // a1 is distance along line BD from B to the chord connecting intersection points
  const a1 = (coupler * coupler - follower * follower + dBD * dBD) / (2 * dBD);
  const hSq = coupler * coupler - a1 * a1;
  const h = Math.sqrt(Math.max(0, hSq));

  // Unit vector along BD
  const ux = dx / dBD;
  const uy = dy / dBD;

  // Normal vector perpendicular to BD (+90 deg counter-clockwise)
  const vx = -uy;
  const vy = ux;

  // Candidate solutions
  const cand1 = { x: bx + a1 * ux + h * vx, y: by + a1 * uy + h * vy };
  const cand2 = { x: bx + a1 * ux - h * vx, y: by + a1 * uy - h * vy };

  let pC: Point2D;
  if (prevPointC) {
    // Continuity tracking: Pick candidate closest to previous pose
    const dist1 = Math.hypot(cand1.x - prevPointC.x, cand1.y - prevPointC.y);
    const dist2 = Math.hypot(cand2.x - prevPointC.x, cand2.y - prevPointC.y);
    pC = dist1 <= dist2 ? cand1 : cand2;
  } else {
    // Branch 1 (OPEN): +h * v
    // Branch 2 (CROSSED): -h * v
    pC = branch === 'OPEN' ? cand1 : cand2;
  }

  const cx = pC.x;
  const cy = pC.y;

  // Calculate angles
  const theta3Rad = Math.atan2(cy - by, cx - bx);
  const theta4Rad = Math.atan2(cy - 0, cx - ground);

  // Calculate Transmission Angle mu (angle between coupler BC and follower DC)
  // Vector BC = (cx - bx, cy - by)
  // Vector DC = (cx - ground, cy - 0)
  const vBCx = cx - bx;
  const vBCy = cy - by;
  const vDCx = cx - ground;
  const vDCy = cy;

  const dot = vBCx * vDCx + vBCy * vDCy;
  const magBC = Math.hypot(vBCx, vBCy);
  const magDC = Math.hypot(vDCx, vDCy);
  const cosMu = Math.max(-1.0, Math.min(1.0, dot / (magBC * magDC)));
  let muDeg = (Math.acos(cosMu) * 180) / Math.PI;
  // Standard transmission angle is acute angle between lines (0 to 90) or 0 to 180
  // In mechanism design, mu is defined as angle between BC and DC (ideal = 90 deg)
  let transmissionQuality: 'OPTIMAL' | 'GOOD' | 'WARNING' | 'CRITICAL' = 'GOOD';
  const devFrom90 = Math.abs(muDeg - 90);
  if (devFrom90 <= 20) {
    transmissionQuality = 'OPTIMAL';
  } else if (devFrom90 <= 45) {
    transmissionQuality = 'GOOD';
  } else if (devFrom90 <= 60) {
    transmissionQuality = 'WARNING';
  } else {
    transmissionQuality = 'CRITICAL';
  }

  // Calculate coupler point P
  let pP: Point2D = { x: (bx + cx) / 2, y: (by + cy) / 2 };
  if (couplerPoint) {
    const alongFrac = coupler > 0 ? couplerPoint.alongBar / coupler : 0.5;
    const perpLen = couplerPoint.perpendicular;
    // Base point along BC
    const basePx = bx + alongFrac * (cx - bx);
    const basePy = by + alongFrac * (cy - by);
    // Perpendicular unit vector to BC
    const uBCx = (cx - bx) / magBC;
    const uBCy = (cy - by) / magBC;
    const normBCx = -uBCy;
    const normBCy = uBCx;
    pP = {
      x: basePx + perpLen * normBCx,
      y: basePy + perpLen * normBCy,
    };
  }

  return {
    pA,
    pB,
    pC,
    pD,
    pP,
    theta2Rad,
    theta3Rad,
    theta4Rad,
    transmissionAngleDeg: muDeg,
    transmissionQuality,
    isValidClosure: true,
  };
}

function createFailedPose(
  pA: Point2D,
  pB: Point2D,
  pD: Point2D,
  theta2Rad: number,
  errorMessage: string
): FourBarPose {
  return {
    pA,
    pB,
    pC: { x: pB.x, y: pB.y },
    pD,
    pP: { x: pB.x, y: pB.y },
    theta2Rad,
    theta3Rad: 0,
    theta4Rad: 0,
    transmissionAngleDeg: 0,
    transmissionQuality: 'CRITICAL',
    isValidClosure: false,
    errorMessage,
  };
}

/**
 * Precomputes the trajectory path (coupler curve) traced by point P over a full 360 degree sweep.
 */
export function generateCouplerPath(
  links: FourBarLinks,
  branch: 'OPEN' | 'CROSSED' = 'OPEN',
  couplerPoint?: CouplerPointDef,
  steps: number = 180
): Point2D[] {
  const points: Point2D[] = [];
  const dTheta = (2 * Math.PI) / steps;

  let prevC: Point2D | undefined = undefined;
  for (let i = 0; i < steps; i++) {
    const theta = i * dTheta;
    const pose = solveFourBarPose(links, theta, branch, couplerPoint, prevC);
    if (pose.isValidClosure) {
      points.push(pose.pP);
      prevC = pose.pC;
    }
  }
  return points;
}

/**
 * Curated FLL and LEGO Technic mechanism presets for students.
 */
export const POPULAR_FLL_LINKAGE_PRESETS: LinkagePreset[] = [
  {
    id: 'parallel_lifter',
    name: 'Parallel Forklift / Cargo Lifter',
    subtitle: 'Keeps attachment perfectly level while lifting',
    description:
      'Opposite bars have identical lengths (9 holes and 5 holes). As the motor arm swings up, the cargo tray stays perfectly level without tipping your game pieces!',
    links: { ground: 9, crank: 5, coupler: 9, follower: 5 },
    couplerPoint: { alongBar: 4.5, perpendicular: 3 },
    defaultBranch: 'OPEN',
  },
  {
    id: 'windshield_wiper',
    name: 'Windshield Wiper / Flipper (Crank-Rocker)',
    subtitle: 'Spins 360° continuously while sweeping back & forth',
    description:
      'A compact 3-hole motor crank drives a 7-hole follower arm through an 8-hole coupler. The motor can spin non-stop in circles, sweeping an attachment back and forth to clear obstacles!',
    links: { ground: 9, crank: 3, coupler: 8, follower: 7 },
    couplerPoint: { alongBar: 4, perpendicular: 0 },
    defaultBranch: 'OPEN',
  },
  {
    id: 'chebyshev_walker',
    name: 'Chebyshev Walking Leg (Straight-Line Motion)',
    subtitle: 'Converts rotary motor spin into flat walking steps',
    description:
      'Famous 4-bar linkage invented by mathematician Pafnuty Chebyshev. The midpoint of the coupler moves in a near-perfect flat straight line along the floor, then lifts up and steps forward!',
    links: { ground: 8, crank: 4, coupler: 10, follower: 10 },
    couplerPoint: { alongBar: 5, perpendicular: -4 },
    defaultBranch: 'OPEN',
  },
  {
    id: 'high_reach_dumper',
    name: 'High-Reach Dumping Bucket',
    subtitle: 'Reaches up and tilts to dump mission elements',
    description:
      'The coupler extends past the follower. When the motor lifts the arm, the bucket stays upright during the climb, then suddenly tilts sharply at the top to dump cargo into a mission tray!',
    links: { ground: 10, crank: 5, coupler: 12, follower: 8 },
    couplerPoint: { alongBar: 12, perpendicular: 4 },
    defaultBranch: 'OPEN',
  },
  {
    id: 'quick_return_shifter',
    name: 'Quick-Return Snap Lever',
    subtitle: 'Moves forward with high power, returns quickly',
    description:
      'The forward push stroke takes more time than the return snap. Great for high-torque pushing of mission levers followed by a fast reset to save competition match time!',
    links: { ground: 11, crank: 4, coupler: 10, follower: 7 },
    couplerPoint: { alongBar: 5, perpendicular: 0 },
    defaultBranch: 'OPEN',
  },
  {
    id: 'double_rocker_swing',
    name: 'Double-Rocker Swing Gate',
    subtitle: 'Large swing arc without full continuous spin',
    description:
      'Non-Grashof linkage where neither arm can spin all the way around. Both arms swing through wide protective arcs to open and close gate barriers.',
    links: { ground: 13, crank: 8, coupler: 7, follower: 9 },
    couplerPoint: { alongBar: 3.5, perpendicular: 2 },
    defaultBranch: 'OPEN',
  },
];
