import RAPIER from '@dimforge/rapier3d-compat';

export interface ArenaConfig {
  lengthMeters: number; // Table length (X or Z axis): standard FLL is 93 inches = 2.362m
  widthMeters: number;  // Table width: standard FLL is 45 inches = 1.143m
  wallHeightMeters: number; // 77mm = ~3 inches
  wallThicknessMeters: number;
  matFriction: number;
}

export const DEFAULT_FLL_ARENA_CONFIG: ArenaConfig = {
  lengthMeters: 2.362,
  widthMeters: 1.143,
  wallHeightMeters: 0.077,
  wallThicknessMeters: 0.025,
  matFriction: 0.75, // Standard competition vinyl mat friction
};

export class FllArenaPhysics {
  public floorBody: RAPIER.RigidBody;
  public wallBodies: RAPIER.RigidBody[] = [];

  constructor(world: RAPIER.World, config: ArenaConfig = DEFAULT_FLL_ARENA_CONFIG) {
    const halfL = config.lengthMeters / 2;
    const halfW = config.widthMeters / 2;
    const halfH = config.wallHeightMeters / 2;
    const thick = config.wallThicknessMeters;

    // 1. Vinyl Mat Floor Collider (At Y = 0)
    const floorBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.05, 0);
    this.floorBody = world.createRigidBody(floorBodyDesc);
    const floorColliderDesc = RAPIER.ColliderDesc.cuboid(halfL + 0.1, 0.05, halfW + 0.1)
      .setFriction(config.matFriction)
      .setRestitution(0.05);
    world.createCollider(floorColliderDesc, this.floorBody);

    // 2. Perimeter Boundary Walls (North, South, East, West)
    // North wall (+Z)
    const northDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, halfH, halfW + thick / 2);
    const northBody = world.createRigidBody(northDesc);
    world.createCollider(RAPIER.ColliderDesc.cuboid(halfL + thick, halfH, thick / 2).setFriction(0.3), northBody);
    this.wallBodies.push(northBody);

    // South wall (-Z)
    const southDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, halfH, -halfW - thick / 2);
    const southBody = world.createRigidBody(southDesc);
    world.createCollider(RAPIER.ColliderDesc.cuboid(halfL + thick, halfH, thick / 2).setFriction(0.3), southBody);
    this.wallBodies.push(southBody);

    // East wall (+X)
    const eastDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(halfL + thick / 2, halfH, 0);
    const eastBody = world.createRigidBody(eastDesc);
    world.createCollider(RAPIER.ColliderDesc.cuboid(thick / 2, halfH, halfW).setFriction(0.3), eastBody);
    this.wallBodies.push(eastBody);

    // West wall (-X)
    const westDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(-halfL - thick / 2, halfH, 0);
    const westBody = world.createRigidBody(westDesc);
    world.createCollider(RAPIER.ColliderDesc.cuboid(thick / 2, halfH, halfW).setFriction(0.3), westBody);
    this.wallBodies.push(westBody);
  }
}
