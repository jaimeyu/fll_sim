import { RobotPhysicsBody } from '../physics/robot-body';

export type DetectedColorName = 'black' | 'white' | 'red' | 'green' | 'blue' | 'yellow' | 'none';

export interface ColorSensorReading {
  port: 'C' | 'D' | 'E' | 'F';
  reflectedLight: number; // 0 to 100%
  color: DetectedColorName;
  rgb: [number, number, number]; // 0-255
  worldPosition: [number, number, number];
}

export interface MatColorSampler {
  sampleAt(worldX: number, worldZ: number): { r: number; g: number; b: number };
}

export class VirtualSensorManager {
  private robot: RobotPhysicsBody;
  private matSampler: MatColorSampler | null = null;
  private yawOffset = 0;

  constructor(robot: RobotPhysicsBody) {
    this.robot = robot;
  }

  public setMatSampler(sampler: MatColorSampler): void {
    this.matSampler = sampler;
  }

  /**
   * Reset Gyro yaw to 0
   */
  public resetYaw(): void {
    this.yawOffset = this.robot.getYawDegrees();
  }

  /**
   * Get calibrated Yaw angle (-180 to 180 degrees)
   * Follows LEGO SPIKE Prime specification: Clockwise turn is positive (0 to 180), Counter-clockwise is negative
   */
  public getYaw(): number {
    let raw = this.robot.getYawDegrees() - this.yawOffset;
    while (raw > 180) raw -= 360;
    while (raw < -180) raw += 360;
    return Math.round(raw * 10) / 10;
  }

  /**
   * Sample downward color sensor at port
   */
  public sampleColorSensor(port: 'C' | 'D'): ColorSensorReading {
    const chassisPos = this.robot.getPosition();
    const yawDeg = this.robot.getYawDegrees();
    const yawRad = (yawDeg * Math.PI) / 180;

    // Relative offset from chassis center:
    // C is Left (-0.024m), D is Right (+0.024m), Front (+0.075m)
    const localX = port === 'C' ? -0.024 : 0.024;
    const localZ = 0.075;

    // Rotate local offset by robot yaw
    // (Three.js/Rapier coord: forward is +Z, right is +X)
    const cosY = Math.cos(yawRad);
    const sinY = Math.sin(yawRad);

    const worldX = chassisPos.x + (localX * cosY + localZ * sinY);
    const worldZ = chassisPos.z + (-localX * sinY + localZ * cosY);
    const worldY = chassisPos.y;

    let r = 255, g = 255, b = 255;
    if (this.matSampler) {
      const sampled = this.matSampler.sampleAt(worldX, worldZ);
      r = sampled.r;
      g = sampled.g;
      b = sampled.b;
    }

    // Reflected light intensity calculation (grayscale luminance)
    // 0 = completely black (e.g. line), 100 = bright white mat
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    const reflectedLight = Math.round((luminance / 255) * 100);

    // Color classification
    let color: DetectedColorName = 'white';
    if (reflectedLight < 25) {
      color = 'black';
    } else if (r > 180 && g < 100 && b < 100) {
      color = 'red';
    } else if (g > 160 && r < 120 && b < 120) {
      color = 'green';
    } else if (b > 180 && r < 120 && g < 120) {
      color = 'blue';
    } else if (r > 200 && g > 200 && b < 100) {
      color = 'yellow';
    } else if (reflectedLight > 75) {
      color = 'white';
    }

    return {
      port,
      reflectedLight,
      color,
      rgb: [r, g, b],
      worldPosition: [worldX, worldY, worldZ],
    };
  }

  /**
   * Distance sensor (in cm) to front wall or obstacle
   */
  public sampleDistanceSensor(): number {
    const pos = this.robot.getPosition();
    const yawDeg = this.robot.getYawDegrees();
    const yawRad = (yawDeg * Math.PI) / 180;

    // Forward unit vector
    const dirX = Math.sin(yawRad);
    const dirZ = Math.cos(yawRad);

    // Approximate distance to 4x8 ft perimeter walls (halfL = 1.181m, halfW = 0.571m)
    const halfL = 1.181;
    const halfW = 0.571;

    let minDist = 250; // max 250 cm
    // Intersect with X walls (+halfL, -halfL)
    if (Math.abs(dirX) > 0.001) {
      const d1 = (halfL - pos.x) / dirX;
      if (d1 > 0) minDist = Math.min(minDist, d1 * 100);
      const d2 = (-halfL - pos.x) / dirX;
      if (d2 > 0) minDist = Math.min(minDist, d2 * 100);
    }
    // Intersect with Z walls (+halfW, -halfW)
    if (Math.abs(dirZ) > 0.001) {
      const d3 = (halfW - pos.z) / dirZ;
      if (d3 > 0) minDist = Math.min(minDist, d3 * 100);
      const d4 = (-halfW - pos.z) / dirZ;
      if (d4 > 0) minDist = Math.min(minDist, d4 * 100);
    }

    return Math.max(2, Math.round(minDist));
  }
}
