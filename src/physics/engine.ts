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
  private defaultPose: SpawnPose = {
    x: -0.8, // Start in Launch Area (Left side)
    y: 0.035, // Seated directly at resting height (wheels touching mat)
    z: -0.3,
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
   * Step physics by delta time (seconds) with accumulator
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

      this.accumulator -= this.fixedDt;
    }
  }
}
