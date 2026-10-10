import { PartDefinition, PartRole } from './types';

export const TECHNIC_PART_CATALOG: Record<string, PartDefinition> = {
  // Fastener Pins
  '2780': {
    partNumber: '2780',
    name: 'Technic Pin with Friction Ridges Lengthwise and Center Slots',
    role: 'FASTENER_PIN',
    massGrams: 0.35,
    dimensions: { x: 8, y: 8, z: 16 },
  },
  '3673': {
    partNumber: '3673',
    name: 'Technic Pin without Friction Ridges',
    role: 'FASTENER_PIN',
    massGrams: 0.34,
    dimensions: { x: 8, y: 8, z: 16 },
  },
  '6558': {
    partNumber: '6558',
    name: 'Technic Pin 3L with Friction Ridges',
    role: 'FASTENER_PIN',
    massGrams: 0.52,
    dimensions: { x: 8, y: 8, z: 24 },
  },
  '32054': {
    partNumber: '32054',
    name: 'Technic Pin 3L with Stop Bush',
    role: 'FASTENER_PIN',
    massGrams: 0.60,
    dimensions: { x: 8, y: 8, z: 24 },
  },
  '3713': {
    partNumber: '3713',
    name: 'Technic Bush 1/1',
    role: 'FASTENER_BUSH',
    massGrams: 0.45,
    dimensions: { x: 8, y: 8, z: 8 },
  },
  '50450': {
    partNumber: '50450',
    name: 'Technic Axle 19L Flexible with Soft Ends',
    role: 'FASTENER_AXLE',
    massGrams: 3.2,
    dimensions: { x: 264, y: 6, z: 6 },
  },

  // Beams & Structural Frames
  '32523': {
    partNumber: '32523',
    name: 'Technic Beam 3L',
    role: 'STRUCTURAL_BEAM',
    massGrams: 1.1,
    dimensions: { x: 8, y: 8, z: 24 },
  },
  '32316': {
    partNumber: '32316',
    name: 'Technic Beam 5L',
    role: 'STRUCTURAL_BEAM',
    massGrams: 1.8,
    dimensions: { x: 8, y: 8, z: 40 },
  },
  '32524': {
    partNumber: '32524',
    name: 'Technic Beam 7L',
    role: 'STRUCTURAL_BEAM',
    massGrams: 2.5,
    dimensions: { x: 8, y: 8, z: 56 },
  },
  '40344': {
    partNumber: '40344',
    name: 'Technic Beam 11L',
    role: 'STRUCTURAL_BEAM',
    massGrams: 3.9,
    dimensions: { x: 8, y: 8, z: 88 },
  },
  '64179': {
    partNumber: '64179',
    name: 'Technic Frame 5x7 Open',
    role: 'STRUCTURAL_BEAM',
    massGrams: 8.5,
    dimensions: { x: 40, y: 8, z: 56 },
  },
  '39793': {
    partNumber: '39793',
    name: 'Technic Frame 11x15 Open',
    role: 'STRUCTURAL_BEAM',
    massGrams: 28.0,
    dimensions: { x: 88, y: 8, z: 120 },
  },

  // Hub & Electronics
  '45601': {
    partNumber: '45601',
    name: 'SPIKE Prime Large Hub (incl battery & 6-axis gyro)',
    role: 'CHASSIS_CORE',
    massGrams: 215.0,
    dimensions: { x: 56, y: 40, z: 88 },
  },
  '45602': {
    partNumber: '45602',
    name: 'SPIKE Prime Large Angular Motor',
    role: 'MOTOR_STATOR',
    massGrams: 90.0,
    dimensions: { x: 40, y: 48, z: 72 },
  },
  '45603': {
    partNumber: '45603',
    name: 'SPIKE Prime Medium Angular Motor',
    role: 'MOTOR_STATOR',
    massGrams: 65.0,
    dimensions: { x: 40, y: 40, z: 64 },
  },
  '45605': {
    partNumber: '45605',
    name: 'SPIKE Prime Color Sensor',
    role: 'SENSOR_COLOR',
    massGrams: 22.0,
    dimensions: { x: 24, y: 24, z: 40 },
  },
  '45604': {
    partNumber: '45604',
    name: 'SPIKE Prime Ultrasonic Distance Sensor',
    role: 'SENSOR_DISTANCE',
    massGrams: 35.0,
    dimensions: { x: 48, y: 24, z: 40 },
  },

  // Wheels, Rims, Tires, Casters
  '56145': {
    partNumber: '56145',
    name: 'Wheel 30.4mm D. x 20mm with Balloon Tire 56x26',
    role: 'WHEEL_RIM',
    massGrams: 18.0,
    dimensions: { x: 56, y: 26, z: 56 },
  },
  '49283': {
    partNumber: '49283',
    name: 'Technic Ball Caster Housing & Metal Ball 16mm',
    role: 'CASTER_SKID',
    massGrams: 15.0,
    dimensions: { x: 24, y: 24, z: 24 },
  },
};

export function isChainPart(partNumber: string, submodel?: string): boolean {
  const cleanPart = partNumber.replace(/\.dat$/i, '').trim().toLowerCase();
  const sub = (submodel || '').trim().toLowerCase();
  if (
    /^(208|209|30104|3711|60447|57518|57539|3873|92338|63141|14696|14226|14210|24869|88323)$/i.test(cleanPart) ||
    /chain|tread/i.test(cleanPart) ||
    /chain|tread|30104/i.test(sub)
  ) {
    return true;
  }
  return false;
}

/**
 * Checks whether a part is any LEGO Technic pin, axle, bush, or connector.
 */
export function isFastenerPart(partNumber: string): boolean {
  const clean = partNumber.replace(/\.dat$/i, '').replace(/^bl_/, '').trim().toLowerCase();
  return (
    /^(2780|3673|6558|32054|32556|32556b|43093|11214|3749|4274|32002|4304|6562|18651|18654|3713|32123|32123a|32123b|4265|4265c|2736|3704|3705|3706|3707|3708|32062|4519|32073|44294|23948|50450|15462|87083|55013|59443|6538|6538c|32013|32014|32015|32016|32034|32039|41678|6536|32184|32291)$/i.test(
      clean
    ) || /pin|axle|bush|connector/i.test(clean)
  );
}

/**
 * Checks whether a fastener specifically acts as a mechanical pivot / rotation axle
 * (e.g. cross axles, frictionless pins) rather than a rigid locking friction pin.
 */
export function isPivotFastener(partNumber: string): boolean {
  const clean = partNumber.replace(/\.dat$/i, '').replace(/^bl_/, '').trim().toLowerCase();
  return /^(3673|3749|43093|3704|3705|3706|3707|3708|32062|4519|32073|44294|23948|50450)$/i.test(
    clean
  );
}

export function lookupPartRole(partNumber: string): PartRole {
  const cleanPart = partNumber.replace(/\.dat$/i, '').replace(/^bl_/, '').trim();
  const entry = TECHNIC_PART_CATALOG[cleanPart];
  if (entry) return entry.role;

  // Chain and flexible linkages
  if (isChainPart(cleanPart)) return 'CHAIN_LINK';

  // Fasteners
  if (
    /axle/i.test(cleanPart) ||
    /^(3704|3705|3706|3707|3708|32062|4519|32073|44294|23948|50450|15462|87083|55013|59443|6538|6538c)$/i.test(cleanPart)
  ) {
    return 'FASTENER_AXLE';
  }
  if (
    /bush/i.test(cleanPart) ||
    /^(3713|32123|32123a|32123b|4265|4265c)$/i.test(cleanPart)
  ) {
    return 'FASTENER_BUSH';
  }
  if (isFastenerPart(cleanPart)) {
    return 'FASTENER_PIN';
  }

  // Fallback heuristics based on common naming / numbering
  if (/motor/i.test(cleanPart)) return 'MOTOR_STATOR';
  if (/wheel|tire|rim/i.test(cleanPart)) return 'WHEEL_RIM';
  if (/beam|liftarm|frame/i.test(cleanPart)) return 'STRUCTURAL_BEAM';
  if (/sensor.*color/i.test(cleanPart)) return 'SENSOR_COLOR';
  if (/sensor.*dist/i.test(cleanPart)) return 'SENSOR_DISTANCE';
  return 'GENERIC_RIGID';
}
