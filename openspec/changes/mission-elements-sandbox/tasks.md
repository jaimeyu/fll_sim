# Tasks

## 1. Mission Elements Core Framework

- [x] 1.1 Define `MissionElement` interface, lifecycle contracts, and state types in `src/missions/types.ts`; verify types compile
- [x] 1.2 Implement `MissionManager` in `src/missions/mission-manager.ts` to coordinate elements between Rapier world and Three.js scene; verify initialization

## 2. Mission Model Implementations

- [x] 2.1 Implement `AxleRiserMission` in `src/missions/axle-riser.ts` with fixed anchor, 4 revolute axles, riser middle blocks, sliding push plate, and friction hold; verify mechanics
- [x] 2.2 Implement `GearDialMission` in `src/missions/gear-dial.ts` with base pedestal, turnstile push paddle, indicator dial, and rotation limits; verify rotation
- [x] 2.3 Write unit and physics integration tests in `src/missions/mission-elements.test.ts` verifying joint linkages, elevation under push, friction hold, and reset behavior; run `npm run test`

## 3. Interactive Sandbox Mode & Mouse Pusher Tool

- [x] 3.1 Implement `SandboxInteractionTool` in `src/sandbox/interaction-tool.ts` with kinematic pusher block, mouse raycasting drive, and dynamic test block spawning; verify physics collisions
- [x] 3.2 Update `Viewport3D` with sandbox workbench rendering, close-up inspection camera framing, and mouse tool grab handling; verify smooth camera orbit and tool drag
- [x] 3.3 Connect mode switcher (`ARENA`, `SANDBOX_RISER`, `SANDBOX_DIAL`) and element positioning in `src/main.ts`; verify mode transitions

## 4. Robot Attachment Dyno Jig Mode

- [x] 4.1 Implement `setRobotStationary(boolean)` in `SimulationPhysicsEngine` and `RobotPhysicsBody` locking chassis while preserving motor rotation; verify state toggle
- [x] 4.2 Write unit test in `src/physics/dyno.test.ts` verifying motors and wheels actuate while chassis remains stationary; run `npm run test`

## 5. HUD Controls & End-to-End Verification

- [x] 5.1 Add mode selector, sandbox toolbar (pusher tool toggle, spawn test block, reset mechanism), and robot dyno toggle to `SimulatorHud` and `hud.css`; verify UI controls
- [x] 5.2 Run complete test suites with `make test`, build bundle with `make build`, and validate OpenSpec with `make spec-validate`
