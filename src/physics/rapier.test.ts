import { describe, it, expect } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';

describe('Rapier Physics Engine', () => {
  it('initializes WASM and creates a rigid body world', async () => {
    await RAPIER.init();
    const gravity = { x: 0.0, y: -9.81, z: 0.0 };
    const world = new RAPIER.World(gravity);

    // Create ground
    const groundBodyDesc = RAPIER.RigidBodyDesc.fixed();
    const groundBody = world.createRigidBody(groundBodyDesc);
    const groundColliderDesc = RAPIER.ColliderDesc.cuboid(10.0, 0.1, 10.0);
    world.createCollider(groundColliderDesc, groundBody);

    // Create dynamic robot chassis
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(0.0, 1.0, 0.0);
    const body = world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(0.5, 0.2, 0.5);
    world.createCollider(colliderDesc, body);

    expect(world.bodies.len()).toBe(2);

    // Step physics
    for (let i = 0; i < 60; i++) {
      world.step();
    }

    const pos = body.translation();
    // Body should have fallen due to gravity and rested on the ground
    expect(pos.y).toBeLessThan(1.0);
    expect(pos.y).toBeGreaterThan(0.0);

    world.free();
  });
});
