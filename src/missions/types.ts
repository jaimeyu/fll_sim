import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

/**
 * Common lifecycle interface for all FLL Mission Elements
 */
export interface MissionElement {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly rootGroup: THREE.Group;

  /**
   * Initializes Rapier physics bodies and Three.js visual meshes at target world position
   */
  init(world: RAPIER.World, basePosition: { x: number; y: number; z: number }): void;

  /**
   * Steps internal physics/logic each tick
   */
  update(dt: number): void;

  /**
   * Synchronizes Three.js visual transforms with Rapier rigid bodies
   */
  syncVisuals(): void;

  /**
   * Resets the mission element to its initial un-solved state
   */
  reset(): void;

  /**
   * Repositions the base anchor of the mission model
   */
  setPosition(pos: { x: number; y: number; z: number }): void;

  /**
   * Returns current world position of base anchor
   */
  getPosition(): { x: number; y: number; z: number };

  /**
   * Evaluates if mission criteria are met
   */
  isSolved(): boolean;

  /**
   * Current mission score percentage (0 to 100)
   */
  getScore(): number;

  /**
   * Cleans up physics bodies and visual meshes
   */
  destroy(): void;
}
