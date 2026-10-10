export type MotorPort = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type StopAction = 'COAST' | 'BRAKE' | 'HOLD';

export interface MotorTarget {
  type: 'CONTINUOUS' | 'DEGREES' | 'TIME';
  targetSpeedDegPerSec: number;
  remainingDegrees?: number;
  remainingSeconds?: number;
  stopAction: StopAction;
  onComplete?: () => void;
}

export class VirtualMotor {
  public port: MotorPort;
  public degrees: number = 0; // Accumulated encoder angle
  public velocityDegPerSec: number = 0; // Current velocity
  public targetSpeedDegPerSec: number = 0;
  public maxSpeedDegPerSec: number = 1000; // ~166 RPM
  public maxTorqueNm: number = 0.25;

  private activeTarget: MotorTarget | null = null;
  private stopAction: StopAction = 'BRAKE';

  constructor(port: MotorPort) {
    this.port = port;
  }

  /**
   * Set continuous speed (-100% to 100% or absolute deg/s)
   */
  public start(speedPercent: number = 50): void {
    const degPerSec = (speedPercent / 100) * this.maxSpeedDegPerSec;
    this.targetSpeedDegPerSec = degPerSec;
    this.activeTarget = {
      type: 'CONTINUOUS',
      targetSpeedDegPerSec: degPerSec,
      stopAction: 'BRAKE',
    };
  }

  /**
   * Run for specified degrees with callback on finish
   */
  public runForDegrees(degrees: number, speedPercent: number = 50, onComplete?: () => void): void {
    const dir = degrees >= 0 ? 1 : -1;
    const absDeg = Math.abs(degrees);
    const speed = Math.abs((speedPercent / 100) * this.maxSpeedDegPerSec) * dir;

    this.activeTarget = {
      type: 'DEGREES',
      targetSpeedDegPerSec: speed,
      remainingDegrees: absDeg,
      stopAction: 'BRAKE',
      onComplete,
    };
  }

  /**
   * Run for duration in seconds
   */
  public runForTime(seconds: number, speedPercent: number = 50, onComplete?: () => void): void {
    const speed = (speedPercent / 100) * this.maxSpeedDegPerSec;
    this.activeTarget = {
      type: 'TIME',
      targetSpeedDegPerSec: speed,
      remainingSeconds: seconds,
      stopAction: 'BRAKE',
      onComplete,
    };
  }

  public stop(action: StopAction = 'BRAKE'): void {
    this.stopAction = action;
    const cb = this.activeTarget?.onComplete;
    this.activeTarget = null;
    this.targetSpeedDegPerSec = 0;
    if (cb) cb();
  }

  public resetDegrees(): void {
    this.degrees = 0;
  }

  /**
   * Physics step update (dt in seconds)
   */
  public step(dt: number, actualAngularVelocityRadPerSec?: number): number {
    if (actualAngularVelocityRadPerSec !== undefined) {
      // Convert rad/s to deg/s
      this.velocityDegPerSec = (actualAngularVelocityRadPerSec * 180) / Math.PI;
    }

    if (!this.activeTarget) {
      if (this.stopAction === 'COAST') {
        this.targetSpeedDegPerSec = 0;
        this.velocityDegPerSec *= 0.95;
      } else {
        this.targetSpeedDegPerSec = 0;
        this.velocityDegPerSec = 0;
      }
      return this.targetSpeedDegPerSec;
    }

    const { type, targetSpeedDegPerSec } = this.activeTarget;
    this.targetSpeedDegPerSec = targetSpeedDegPerSec;

    // Simulate movement
    const stepDeltaDeg = Math.abs(targetSpeedDegPerSec * dt);
    this.degrees += targetSpeedDegPerSec * dt;

    if (type === 'DEGREES' && this.activeTarget.remainingDegrees !== undefined) {
      this.activeTarget.remainingDegrees -= stepDeltaDeg;
      if (this.activeTarget.remainingDegrees <= 0) {
        this.stop(this.activeTarget.stopAction);
      }
    } else if (type === 'TIME' && this.activeTarget.remainingSeconds !== undefined) {
      this.activeTarget.remainingSeconds -= dt;
      if (this.activeTarget.remainingSeconds <= 0) {
        this.stop(this.activeTarget.stopAction);
      }
    }

    return this.targetSpeedDegPerSec;
  }
}
