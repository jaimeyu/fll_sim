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

  it('tests revolute joint motor', async () => {
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 }); // zero gravity
    const bodyA = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0));
    const bodyB = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(1, 0, 0));
    world.createCollider(RAPIER.ColliderDesc.ball(0.1), bodyB);

    const jointData = RAPIER.JointData.revolute({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    const joint = world.createImpulseJoint(jointData, bodyA, bodyB, true) as RAPIER.RevoluteImpulseJoint;
    joint.configureMotorVelocity(5.0, 10.0);
    joint.setMotorMaxForce(100.0);

    for (let i = 0; i < 60; i++) {
      world.step();
    }
    const angvel = bodyB.angvel();
    console.log('Isolated Revolute joint angvel:', angvel);
    expect(Math.abs(angvel.y)).toBeGreaterThan(1.0);
    world.free();
  });

  it('tests RobotPhysicsBody wheels in the air', async () => {
    await RAPIER.init();
    const { getFllAdvanceDrivingBaseSpec } = await import('../cad/models/advance-driving-base');
    const { RobotPhysicsBody } = await import('./robot-body');
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 }); // zero gravity, no floor
    const spec = getFllAdvanceDrivingBaseSpec();
    const robot = new RobotPhysicsBody(world, spec, { x: 0, y: 1.0, z: 0, yawDegrees: 0 });

    const motorA = robot.motors.get('A');
    const motorB = robot.motors.get('B');
    motorA?.start(50);
    motorB?.start(50);

    for (let i = 0; i < 60; i++) {
      robot.updateMotors(1 / 60);
      world.step();
    }

    for (const [id, wb] of robot.wheelBodies.entries()) {
      console.log(`In-air Wheel ${id} angvel:`, wb.angvel(), 'linvel:', wb.linvel());
      expect(Math.abs(wb.angvel().x)).toBeGreaterThan(1.0);
    }
    world.free();
  });

  it('tests RobotPhysicsBody driving on competition floor with joint motor', async () => {
    await RAPIER.init();
    const { getFllAdvanceDrivingBaseSpec } = await import('../cad/models/advance-driving-base');
    const { RobotPhysicsBody } = await import('./robot-body');
    const { FllArenaPhysics } = await import('./arena');
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.integrationParameters.numSolverIterations = 16;
    world.integrationParameters.numInternalPgsIterations = 4;
    new FllArenaPhysics(world);

    const spec = getFllAdvanceDrivingBaseSpec();
    const robot = new RobotPhysicsBody(world, spec, { x: 0, y: 0.035, z: 0, yawDegrees: 90 });

    // Settle first
    for (let i = 0; i < 30; i++) {
      world.step();
    }

    const p0 = robot.getPosition();

    // Start motors A and B at 50% speed
    robot.motors.get('A')?.start(50);
    robot.motors.get('B')?.start(50);

    for (let i = 0; i < 60; i++) {
      robot.updateMotors(1 / 60);
      world.step();
    }

    const p1 = robot.getPosition();
    const dist = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    expect(dist).toBeGreaterThan(0.04); // Drives at least 4cm in 1s
    world.free();
  });

  it('tests idle stillness with 16 iters and 4 pgs', async () => {
    const { getFllAdvanceDrivingBaseSpec } = await import('../cad/models/advance-driving-base');
    const { RobotPhysicsBody } = await import('./robot-body');
    const { FllArenaPhysics } = await import('./arena');

    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.integrationParameters.numSolverIterations = 16;
    world.integrationParameters.numInternalPgsIterations = 4;
    new FllArenaPhysics(world);
    const spec = getFllAdvanceDrivingBaseSpec();
    const robot = new RobotPhysicsBody(world, spec, { x: 0, y: 0.035, z: 0, yawDegrees: 0 });

    // Settle for 40 steps
    for (let i = 0; i < 40; i++) {
      robot.updateMotors(1 / 60);
      world.step();
    }

    const initialY = robot.getPosition().y;

    // Run 60 steps idle
    let maxVy = 0;
    let maxAngSpeed = 0;
    for (let i = 0; i < 60; i++) {
      robot.updateMotors(1 / 60);
      world.step();
      const vy = Math.abs(robot.chassisBody.linvel().y);
      const angvel = robot.chassisBody.angvel();
      const angSpeed = Math.hypot(angvel.x, angvel.y, angvel.z);
      if (vy > maxVy) maxVy = vy;
      if (angSpeed > maxAngSpeed) maxAngSpeed = angSpeed;
    }
    expect(maxVy).toBeLessThan(0.005);
    expect(maxAngSpeed).toBeLessThan(0.05);

    const finalY = robot.getPosition().y;
    expect(Math.abs(finalY - initialY)).toBeLessThan(0.0005);
    world.free();
  });
});
