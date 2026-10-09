# Design: Mission Elements, Interactive Sandbox Mode & Attachment Dyno Jig

## Context

See [proposal.md](proposal.md) for background and motivation.
The simulator currently possesses a 60Hz Rapier3D physics engine, 3D Three.js viewport with OrbitControls, and a virtual SPIKE Prime runtime. We need to introduce interactive season mission models, an isolated sandbox inspection mode, mouse-driven physical interaction, and an attachment dyno mode.

## Goals / Non-Goals

**Goals:**
- Provide a clean `MissionElement` interface managing Rapier rigid bodies, joints, and Three.js meshes.
- Implement the **4-Axle Toggle Riser** mechanism with 4 revolving joints, sliding push plate, and friction hold.
- Implement the **Rotary Gear Turnstile** mechanism with rotatable paddle, gear coupling, and indicator dial.
- Build an isolated **Sandbox Mode** with close camera framing and test workbench.
- Implement an interactive **Mouse Pusher Tool** (kinematic physics body moved by cursor) and free test blocks for probing mechanisms.
- Implement **Robot Dyno Mode** (`setRobotStationary(true)`), pinning the chassis while allowing motors and attachments to actuate.
- Allow populating elements either on the competition field or in isolated sandbox view.

**Non-Goals:**
- In-app interactive CAD brick snap editor for building attachments piece-by-piece; attachments are loaded via CAD model swaps.
- Full CAD parsing of all 15 FIRST LEGO League mission models at once; start with representative mechanical archetypes (toggle riser and rotary gear).

## Decisions

### 1. Mission Element Architecture
- **Decision**: Create an explicit `MissionElement` interface in `src/missions/types.ts` with lifecycle methods `init(world, basePos)`, `update(dt)`, `syncVisuals()`, and `reset()`.
- **Rationale**: Isolates mission logic from robot physics and arena walls, allowing elements to be placed either on the competition field or isolated on the sandbox workbench.
- **Alternatives Considered**: Hardcoding models into `engine.ts` (rejected: would bloat the core physics engine and hinder adding more mission models).

### 2. 4-Axle Riser Mechanism Kinematics & Friction Hold
- **Decision**: Model the 4-axle toggle mechanism using Rapier:
  - Base Anchor: `Fixed` rigid body bolted to the mat.
  - Link 1 (lower arm): `Dynamic` body connected to Anchor with a revolute joint around Z.
  - Middle Riser: `Dynamic` body connected to Link 1 with a revolute joint around Z.
  - Link 2 (upper push arm): `Dynamic` body connected to Middle Riser with a revolute joint around Z.
  - Pusher Slider: `Dynamic` body connected to Link 2 with a revolute joint around Z, and constrained to slide along X via a prismatic joint or linear guide.
  - Friction: Joint motors configured with `targetVelocity = 0` and `setMotorMaxForce(frictionTorque)` to simulate physical joint pin friction, holding the riser up once elevated.
- **Rationale**: Replicates genuine LEGO Technic toggle linkages and friction pins.

### 3. Interactive Mouse Pusher Tool
- **Decision**: Implement a kinematic position-based rigid body (`RAPIER.RigidBodyType.KinematicPositionBased`) in `src/sandbox/interaction-tool.ts`.
- **Rationale**: A kinematic body actively pushes dynamic bodies (sliders, levers, free blocks) with realistic physical impulses without being pushed back or clipping through the floor.
- **Interaction**: In Sandbox Mode, Left-Click and dragging the tool moves it across the workbench surface; Right-Click or Left-Click on empty space orbits the camera.

### 4. Robot Attachment Dyno Mode
- **Decision**: Toggle the robot chassis body type via `chassisBody.setBodyType(RAPIER.RigidBodyType.Fixed, true)`.
- **Rationale**: In Rapier, wheel bodies attached via revolute joints continue to rotate and respond to motor drives when the parent body is Fixed. When disabled, reverting to `Dynamic` immediately restores normal driving.

## Risks / Trade-offs

- **[Risk] High-speed mouse dragging could cause kinematic tool tunneling through thin links**
  → *Mitigation*: Clamp mouse tool velocity / delta per physics tick and use continuous collision detection (CCD) on dynamic sliders.
- **[Risk] OrbitControls vs Mouse Tool input conflicts**
  → *Mitigation*: Raycast against the pusher tool on `pointerdown`; if the tool is hit, grab it and pause OrbitControls. Right-click is always reserved for camera orbit.
