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
   * Alias getter/setter for targetVelocityDegPerSec used by test suites and telemetry
   */
  public get targetVelocityDegPerSec(): number {
    return this.targetSpeedDegPerSec;
  }

  public set targetVelocityDegPerSec(v: number) {
    this.targetSpeedDegPerSec = v;
  }

  /**
   * Set continuous speed (-100% to 100% or absolute deg/s)
   */
  public start(speedPercent: number = 50): void {
    const clamped = Math.max(-100, Math.min(100, isNaN(speedPercent) ? 0 : speedPercent));
    const degPerSec = (clamped / 100) * this.maxSpeedDegPerSec;
    this.targetSpeedDegPerSec = degPerSec;
    this.activeTarget = {
      type: 'CONTINUOUS',
      targetSpeedDegPerSec: degPerSec,
      stopAction: 'BRAKE',
    };
  }

  /**
   * Run for specified degrees with callback on finish.
   * Preserves speed direction: negative speed produces reverse rotation.
   */
  public runForDegrees(degrees: number, speedPercent: number = 50, onComplete?: () => void): void {
    // Check for near-zero or non-finite degrees / speed to prevent hanging
    if (
      !Number.isFinite(degrees) ||
      Math.abs(degrees) < 1e-4 ||
      !Number.isFinite(speedPercent) ||
      Math.abs(speedPercent) < 1e-4
    ) {
      this.targetSpeedDegPerSec = 0;
      this.activeTarget = null;
      if (onComplete) onComplete();
      return;
    }

    const clampedSpeed = Math.max(-100, Math.min(100, speedPercent));
    const totalDir = (degrees >= 0 ? 1 : -1) * (clampedSpeed >= 0 ? 1 : -1);
    const absDeg = Math.abs(degrees);
    const speed = Math.abs((clampedSpeed / 100) * this.maxSpeedDegPerSec) * totalDir;

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
    const clampedSpeed = Math.max(-100, Math.min(100, isNaN(speedPercent) ? 0 : speedPercent));
    const speed = (clampedSpeed / 100) * this.maxSpeedDegPerSec;
    const safeSeconds = Math.max(0, isNaN(seconds) || !Number.isFinite(seconds) ? 0 : seconds);

    if (safeSeconds <= 0 || Math.abs(clampedSpeed) < 1e-4) {
      this.targetSpeedDegPerSec = 0;
      this.activeTarget = null;
      if (onComplete) onComplete();
      return;
    }

    this.activeTarget = {
      type: 'TIME',
      targetSpeedDegPerSec: speed,
      remainingSeconds: safeSeconds,
      stopAction: 'BRAKE',
      onComplete,
    };
  }

  public stop(action: StopAction = 'BRAKE'): void {
    this.stopAction = action;
    const cb = this.activeTarget?.onComplete;
    this.activeTarget = null;
    this.targetSpeedDegPerSec = 0;
    if (action !== 'COAST') {
      this.velocityDegPerSec = 0;
    }
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
    } else if (this.activeTarget) {
      this.velocityDegPerSec = this.activeTarget.targetSpeedDegPerSec;
    }

    if (!this.activeTarget) {
      if (this.stopAction === 'COAST') {
        this.targetSpeedDegPerSec = 0;
        this.velocityDegPerSec *= 0.95;
        if (Math.abs(this.velocityDegPerSec) < 0.1) this.velocityDegPerSec = 0;
      } else {
        this.targetSpeedDegPerSec = 0;
        this.velocityDegPerSec = 0;
      }
      return 0;
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
