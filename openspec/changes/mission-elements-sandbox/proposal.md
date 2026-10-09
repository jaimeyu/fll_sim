# Proposal: Mission Elements, Interactive Sandbox Mode & Attachment Dyno Jig

## Why

FIRST LEGO League teams develop complex attachments and strategies to solve season mission models. Testing attachments on the full mat can be cumbersome when tuning mechanical interactions, as robots drive off or mechanisms reset unpredictably. By providing realistic physics-driven mission elements (such as 4-axle toggle risers and rotary gear models), an isolated single-element **Sandbox Mode** with mouse interaction tools, and a **Stationary Robot Dyno Jig Mode**, teams can rapidly prototype, physically poke and test mechanisms, and verify attachment Python code in place before full mission runs.

## What Changes

- **Physical Mission Elements Framework**: Extensible architecture for field mission models combining static anchor bases, rigid link bodies, revolute/prismatic Rapier joints, friction holding torques, and Three.js visual synchronization.
- **4-Axle Riser Mechanism**: Realistic multi-axle linkage model with an anchored fixed base, 4 revolving axles, a middle target block assembly that rises vertically, a sliding push plate, and physical joint friction that holds the riser in the elevated position when pushed.
- **Rotary Gear / Turnstile Mechanism**: Pedestal-mounted rotary mission element with paddle teeth and coupled indicator flag/dial demonstrating geared rotation and limit latching.
- **Interactive Sandbox / Focus Mode**: Dedicated isolated workbench mode focused on a single mission element, featuring OrbitControls camera framing, instant model reset, and an interactive **Mouse Pusher Tool** (kinematic/dynamic test block controlled by mouse raycasting to push, poke, and lift mechanisms).
- **Robot Dyno Jig Mode**: Toggleable stationary attachment testing mode where the robot chassis is locked in place while drive and attachment motors freely actuate and execute SPIKE Python scripts.
- **Arena Field Population**: Automatic population of mission elements on the official competition mat at designated field coordinates.
- **HUD Controls & Mode Selector**: Topbar switcher between Competition Arena and Sandbox elements, Sandbox physics tools toolbar, and mission state indicator.

## Capabilities

### New Capabilities
- `mission-elements`: Modeling of LEGO Technic mission mechanisms with Rapier physics joints, friction detents, collision geometries, and solved-state evaluation.
- `sandbox-mode`: Isolated mechanism inspection bench with mouse-driven pusher tools, dynamic test blocks, camera focus, and independent mechanism resets.
- `robot-dyno-mode`: Lockable robot chassis jig allowing SPIKE Prime motor execution and attachment debugging without driving off the bench.

### Modified Capabilities
None.

## Impact

- **Physics Engine**: `SimulationPhysicsEngine` gains support for registering dynamic mission element bodies and locking the chassis for dyno mode.
- **Viewport**: `Viewport3D` supports sandbox camera presets, workbench rendering, and mouse pusher tool raycasting.
- **UI HUD**: Added mode switcher, sandbox action bar, and dyno mode toggle.
- **Dependencies**: No external dependencies added; utilizes existing Rapier3D and Three.js capabilities.
