/**
 * FIRST LEGO League (FLL) Model Physics & Kinematics Specification (FllPhysicsSpec)
 * Version 1.1.0
 * 
 * Provides lossless metadata for Studio 2.0 (.io) models:
 * - Mechanical joints (revolute, prismatic, spherical) with friction, damping & angle limits
 * - 3M Dual-Lock field mat anchor pads to guarantee static stability
 * - Multi-entity mission decomposition (stations vs. loose carts/payloads)
 * - Start/Scored pose capture and motion demo trajectories
 */

export interface FllEntityDef {
  id: string;                         // e.g. "m01_base", "m01_cart", "m01_payload"
  name: string;                       // e.g. "Drone Survey Base", "Release Cart"
  type: 'anchored_station' | 'dynamic_payload' | 'loose_vehicle';
  clusterIds: string[];               // Cluster IDs assigned to this physical body
  defaultFixed: boolean;              // If true, root cluster is static in Rapier3D
  collisionFilterGroup?: number;
}

export interface FllDualLockAnchor {
  id: string;                         // e.g. "dl_pad_front_left"
  clusterId: string;                  // Cluster this tape adheres to (usually base)
  localStudCoordinates: [number, number, number]; // [x, y, z] in mm or stud units
  dimensionsMm: [number, number];     // e.g. [25.4, 25.4] (1x1 inch standard pad)
}

export interface FllJointDynamics {
  preset?: 'free' | 'medium_bush' | 'tight_friction_pin' | 'heavy_clutch' | 'custom';
  holdingTorqueNm: number;          // Static breakout torque (e.g. 0.065 Nm prevents sag under gravity)
  viscousDamping: number;           // Velocity damping (e.g. 0.60 prevents flutter)
  springStiffness?: number;         // Return-to-center spring if elastic
}

export interface FllJointDef {
  id: string;                         // e.g. "joint_main_lever"
  name: string;                       // e.g. "Survey Flag Swing Arm"
  type: 'revolute' | 'prismatic' | 'spherical' | 'fixed';
  parentClusterId: string;
  childClusterId: string;
  
  // Anchor and Axis in parent-local coordinates (meters)
  anchor: [number, number, number];
  axis: [number, number, number];     // Normalized direction vector (e.g. [1, 0, 0])

  // Motion limits
  limits?: {
    minDegrees?: number;              // e.g. 0 degrees
    maxDegrees?: number;              // e.g. 85 degrees
    minMeters?: number;               // for prismatic slide
    maxMeters?: number;
    restitution?: number;             // bounce at limit stops (default 0.05)
  };

  // Physical joint resistance & holding clutch power
  dynamics: FllJointDynamics;
}

export interface FllPoseConfiguration {
  description?: string;
  jointPositions: Record<string, number>; // jointId -> degrees or meters
}

export interface FllMotionTrajectory {
  durationSeconds: number;            // e.g. 2.0s
  keyframes: Array<{
    normalizedTime: number;           // 0.0 to 1.0
    jointPositions: Record<string, number>;
  }>;
}

export interface FllScoredPoseDefinition {
  id: string;                         // e.g. "state_fully_raised"
  label: string;                      // e.g. "Survey Target In Highest Position (20 pts)"
  points: number;
  evaluator: {
    type: 'joint_threshold' | 'cluster_zone' | 'payload_transfer';
    jointId?: string;
    targetAngleMin?: number;
    targetAngleMax?: number;
    targetClusterId?: string;
  };
}

export interface FllPhysicsSpec {
  schemaVersion: '1.1.0';
  modelId: string;
  name: string;
  author?: string;

  /** Multi-entity decomposition */
  entities?: FllEntityDef[];

  /** 3M Dual-Lock fastener anchor pads */
  dualLockAnchors?: FllDualLockAnchor[];

  /** Mechanical joints */
  joints?: FllJointDef[];

  /** Match setup poses, motion capture, and scoring criteria */
  states?: {
    initialPose?: FllPoseConfiguration;
    scoredPoses?: FllScoredPoseDefinition[];
    motionTrajectory?: FllMotionTrajectory;
  };
}

/**
 * Standard LEGO pin and axle friction presets
 */
export const LEGO_PIN_FRICTION_PRESETS: Record<string, { label: string; holdingTorqueNm: number; viscousDamping: number; description: string }> = {
  free: {
    label: 'Frictionless (Free)',
    holdingTorqueNm: 0.001,
    viscousDamping: 0.05,
    description: 'Free-spinning axle or frictionless pin (Part 3673)',
  },
  medium_bush: {
    label: 'Standard Bushing',
    holdingTorqueNm: 0.018,
    viscousDamping: 0.25,
    description: 'Axle guided through smooth beam hole with bushing (Part 3713)',
  },
  tight_friction_pin: {
    label: 'Tight Friction Pin',
    holdingTorqueNm: 0.065,
    viscousDamping: 0.60,
    description: 'Authentic LEGO Technic friction pin (Part 2780/6558) - holds starting pose against gravity',
  },
  heavy_clutch: {
    label: 'Heavy Drag / Clutch',
    holdingTorqueNm: 0.140,
    viscousDamping: 1.20,
    description: 'High-resistance friction mechanism or clutch gear (Part 60c01)',
  },
};

/**
 * Helper to validate a parsed object against the FllPhysicsSpec shape
 */
export function isValidPhysicsSpec(obj: unknown): obj is FllPhysicsSpec {
  if (!obj || typeof obj !== 'object') return false;
  const s = obj as Record<string, unknown>;
  return (
    typeof s.modelId === 'string' &&
    typeof s.name === 'string' &&
    (s.schemaVersion === '1.0.0' || s.schemaVersion === '1.1.0' || typeof s.schemaVersion === 'string')
  );
}
