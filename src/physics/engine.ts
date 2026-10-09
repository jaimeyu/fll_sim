import RAPIER from '@dimforge/rapier3d-compat';
import { FllArenaPhysics } from './arena';
import { RobotPhysicsBody, SpawnPose } from './robot-body';
import { RobotAssemblySpec } from '../cad/types';
import { getFllAdvanceDrivingBaseSpec } from '../cad/models/advance-driving-base';

export interface PhysicsEngineOptions {
  fixedTimestepSeconds?: number; // Default 1/60 (60Hz)
  substeps?: number;
}

export class SimulationPhysicsEngine {
  public world!: RAPIER.World;
  public arena!: FllArenaPhysics;
  public robot!: RobotPhysicsBody;
  public isInitialized = false;

  private fixedDt: number;
  private accumulator: number = 0;
  public onSanityReset?: (reason: string) => void;

  private defaultPose: SpawnPose = {
    x: -0.8, // Start in Launch Area (Columns A-B, Red Launch Arc)
    y: 0.035, // Resting height (wheels and rear caster resting on mat)
    z: 0.32,
    yawDegrees: 90, // Facing East toward mission field
  };

  constructor(options: PhysicsEngineOptions = {}) {
    this.fixedDt = options.fixedTimestepSeconds || 1 / 60;
  }

  public async init(robotSpec?: RobotAssemblySpec, spawnPose?: SpawnPose): Promise<void> {
    await RAPIER.init();

    // Standard Earth gravity
    const gravity = { x: 0.0, y: -9.81, z: 0.0 };
    this.world = new RAPIER.World(gravity);

    // High solver accuracy for articulated robotics constraints:
    // Prevents joint compliance springing and eliminates bouncing/jitter on high-friction mats
    this.world.integrationParameters.numSolverIterations = 16;
    this.world.integrationParameters.numInternalPgsIterations = 4;

    // Create 4x8 ft competition table arena
    this.arena = new FllArenaPhysics(this.world);

    // Create robot from spec or default to FLL Advanced Driving Base
    const spec = robotSpec || getFllAdvanceDrivingBaseSpec();
    const pose = spawnPose || this.defaultPose;
    this.robot = new RobotPhysicsBody(this.world, spec, pose);

    this.isInitialized = true;
  }

  /**
   * Resets robot to starting launch pose
   */
  public resetRobot(pose?: SpawnPose): void {
    if (!this.isInitialized) return;
    const targetPose = pose || this.defaultPose;
    this.robot.reset(targetPose);
  }

  /**
   * Step physics by delta time (seconds) with accumulator and safety limits
   */
  public update(deltaSeconds: number): void {
    if (!this.isInitialized) return;

    // Clamp delta to prevent spiral of death
    const clampedDelta = Math.min(deltaSeconds, 0.1);
    this.accumulator += clampedDelta;

    while (this.accumulator >= this.fixedDt) {
      // 1. Update motor joint drives
      this.robot.updateMotors(this.fixedDt);

      // 2. Step Rapier physics world
      this.world.step();

      // 3. Safety Sanity Checks: auto-restart robot if it falls outside table or enters supersonic/crazy spin
      const pos = this.robot.getPosition();
      const linvel = this.robot.chassisBody.linvel();
      const angvel = this.robot.chassisBody.angvel();
      const linearSpeed = Math.hypot(linvel.x, linvel.y, linvel.z);
      const angularSpeed = Math.hypot(angvel.x, angvel.y, angvel.z);

      let resetReason: string | null = null;
      if (pos.y < -0.1 || Math.abs(pos.x) > 1.35 || Math.abs(pos.z) > 0.75) {
        resetReason = `Robot fell outside competition table boundary (x=${pos.x.toFixed(2)}, y=${pos.y.toFixed(2)}, z=${pos.z.toFixed(2)})`;
      } else if (linearSpeed > 5.0) {
        resetReason = `Safety limit: Runaway linear velocity exceeded maximum allowable speed (${linearSpeed.toFixed(1)} m/s > 5.0 m/s)`;
      } else if (angularSpeed > 50.0) {
        resetReason = `Safety limit: Runaway rotational velocity exceeded maximum allowable spin (${angularSpeed.toFixed(1)} rad/s > 50.0 rad/s)`;
      }

      if (resetReason) {
        this.resetRobot();
        if (this.onSanityReset) {
          this.onSanityReset(resetReason);
        }
      }

      this.accumulator -= this.fixedDt;
    }
  }
}
