export type PartRole =
  | 'FASTENER_PIN'        // e.g. 2780 friction pin, 3673 frictionless pin, 6558 3L pin
  | 'FASTENER_AXLE'       // e.g. cross axles, axle pins
  | 'FASTENER_BUSH'       // e.g. 3713, 4265c bushes
  | 'STRUCTURAL_BEAM'     // e.g. technic liftarms, frames 5x7, 11x15
  | 'CHASSIS_CORE'        // e.g. SPIKE Prime Hub 45601
  | 'MOTOR_STATOR'        // Fixed motor housing (mounts rigidly to frame)
  | 'MOTOR_ROTOR'         // Active rotating output disc
  | 'WHEEL_RIM'           // Wheel hub
  | 'WHEEL_TIRE'          // Rubber tire
  | 'CASTER_SKID'         // Passive ball caster or skid
  | 'SENSOR_COLOR'        // Downward facing color sensor
  | 'SENSOR_DISTANCE'     // Ultrasonic sensor
  | 'GENERIC_RIGID';

export interface PartDefinition {
  partNumber: string;
  name: string;
  role: PartRole;
  massGrams: number;
  dimensions: { x: number; y: number; z: number }; // In mm
  colorHex?: number;
}

export interface PlacedPart {
  id: string;
  partNumber: string;
  position: [number, number, number]; // [x, y, z] in mm or LDU
  rotation: [number, number, number, number]; // Quaternion [x, y, z, w]
  role: PartRole;
  colorHex?: number;
  submodel?: string;
  submodelInstance?: string;
  parentClusterId?: string;
  meta?: Record<string, unknown>;
}

export interface ConnectionLink {
  fromPartId: string;
  toPartId: string;
  connectionType: 'RIGID_PIN' | 'RIGID_FRAME' | 'REVOLUTE_AXLE' | 'FREE_ROTATION';
  jointAxis?: [number, number, number];
  anchor?: [number, number, number];
}

export interface ClusteredCompoundBody {
  clusterId: string;
  name: string;
  isRootChassis: boolean;
  partIds: string[];
  totalMassKg: number;
  parts?: PlacedPart[];
  // Bounding or compound colliders
  colliders: Array<{
    shape: 'box' | 'cylinder' | 'sphere';
    halfExtents?: [number, number, number];
    radius?: number;
    halfHeight?: number;
    offset: [number, number, number];
    rotation: [number, number, number, number];
    friction: number;
    restitution: number;
  }>;
}

export interface ExtractedJoint {
  jointId: string;
  name: string;
  type: 'REVOLUTE';
  parentClusterId: string;
  childClusterId: string;
  anchorParent: [number, number, number];
  anchorChild: [number, number, number];
  axis: [number, number, number];
  motorPort?: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  maxTorqueNm: number;
  maxVelocityDegPerSec: number;
}

export interface PartBomEntry {
  partNumber: string;
  name: string;
  count: number;
  role: string;
  colorHex?: number;
  hasAccurateMesh: boolean;
}

export interface RobotAssemblySpec {
  name: string;
  clusters: ClusteredCompoundBody[];
  joints: ExtractedJoint[];
  parts?: PlacedPart[];
  bom?: PartBomEntry[];
  sensors: Array<{
    id: string;
    type: 'COLOR' | 'DISTANCE' | 'GYRO';
    port?: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
    relativePosition: [number, number, number]; // relative to root chassis in meters
    relativeOrientation: [number, number, number, number];
  }>;
}
