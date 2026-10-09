# Design: FLL Robot Simulator Architecture

## Context

See `proposal.md` for project background and user requirements. 
Current FLL simulation tools suffer from two extremes: either proprietary desktop abandonware (VRT) or simplistic 2D/grid visualizers lacking CAD fidelity. We need a modern, high-performance, open-source 3D robotics simulation platform that takes real BrickLink Studio / LDraw CAD models, simulates accurate physics without pin overload, runs standard SPIKE Prime code, and runs natively in WebGL/WebAssembly.

## Goals / Non-Goals

**Goals:**
* Real-time 60fps WebGL rendering and 60–120Hz physics stepping on standard laptops and Chromebooks.
* Direct ingestion of BrickLink Studio (`.io`) and LDraw (`.ldr`, `.mpd`) CAD files.
* Intelligent pin and fastener clustering: bake 90%+ of static pins and beams into compound rigid bodies, simulating only true degrees of freedom (wheels, motor shafts, attachment arms).
* Sandboxed SPIKE Prime Python API execution synchronized with the physics loop.
* Off-the-shelf, open-source foundation with clean desktop-to-web migration path.
* **Extensive Testing & Reviewability**: Automated unit, integration, and E2E test suites with zero broken tests. Clear, readable code with in-depth architectural comments and mathematical documentation.
* **Multi-Agent Coordination Model**: Modular boundary contracts allowing specialized autonomous agents to collaborate without collision.

**Non-Goals:**
* In-simulator CAD authoring or 3D brick building (users model in Studio/LeoCAD).
* Microscopic finite-element stress analysis of bending LEGO plastic.
* Direct physical gear-tooth meshing (gears are modeled as kinematic constraints/gear ratios).

---

## Decisions

### 1. Engine & Stack: Three.js + Rapier3D (Wasm) + TypeScript
* **Decision**: Use **Three.js** for WebGL rendering alongside **Rapier3D** (`@dimforge/rapier3d-compat`) for 3D physics, structured in TypeScript.
* **Rationale**:
  * *LDraw Ecosystem*: Three.js includes an official, heavily tested `LDrawLoader` capable of parsing LEGO parts, color codes, and submodels.
  * *Rapier3D Performance*: Rapier is written in Rust and compiled to WebAssembly. It is one of the fastest, most deterministic 3D physics engines available for the web, featuring native compound shapes, revolute joints, and raycasting.
  * *Zero Desktop-to-Web Friction*: The same TypeScript/Wasm codebase runs in local Node.js / Vite on a laptop and compiles to a static, zero-install WebGL bundle for GitHub Pages.
* **Alternatives Considered**:
  * *Bevy (Rust)*: Excellent native performance, but lacks an LDraw parser and web ecosystem maturity for LEGO geometry.
  * *Godot 4*: Capable desktop editor, but lacks LDraw loaders and produces large (35MB+) WebGL export binaries.

### 2. Kinematic Pre-Solver & Compound Pin Clustering
* **Decision**: Implement a graph-based topological solver that classifies parts into either the static root chassis or active kinematic links before passing them to the physics engine.
* **Heuristic Pipeline**:
  1. **Part Role Lookup**: Tag catalog parts:
     * *Fasteners*: Pins (`2780`, `3673`, `6558`), axle-pin connectors (`32054`), bushes.
     * *Motors*: SPIKE Large Motor (`45601`), Medium Motor (`45602`).
     * *Moving Elements*: Wheel rims (`56145`), tires, pulleys, output shafts.
  2. **Connection Graph**: Build an assembly graph where parts connected rigidly (e.g. beam-to-beam via friction pins) are merged into connected components.
  3. **Joint Extraction**: Axles seated inside motor output ports or freely rotating pin holes are identified as 1-DOF Revolute Joint constraints.
  4. **Compound Body Generation**: In Rapier3D, each connected component becomes a single RigidBody with an array of primitive colliders (compound shapes). A 500-part robot is reduced to 4–8 physics bodies:
     * Body 0: Main Chassis (Hub, battery, frame, sensors, fixed motor casings).
     * Body 1 & 2: Left and Right Drive Wheels.
     * Body 3: Passive Caster Wheel / Skid.
     * Body 4 & 5: Motor-actuated attachment arms.

### 3. SPIKE Prime Virtual Runtime & Sandboxing
* **Decision**: Run user scripts inside an asynchronous execution runtime exposing the standard SPIKE Prime API (`PrimeHub`, `Motor`, `MotorPair`, `ColorSensor`, `DistanceSensor`).
* **Architecture**:
  * `User Script` $\rightarrow$ calls `motors.move(20, 'cm')` or `color_sensor.get_reflected_light()`.
  * `Virtual SPIKE API` $\rightarrow$ translates centimeters into motor target degrees: $\Delta \theta = \frac{d}{\pi \cdot D} \times 360^\circ$ and configures motor controllers.
  * `Physics Controller` $\rightarrow$ sets Rapier joint motor target velocity and steps physics at 60Hz.
  * `Sensor Loop` $\rightarrow$ samples mat texture at sensor raycast UV coordinates, updates heading from chassis quaternion, and updates live telemetry.
  * `Cooperative Cancellation` $\rightarrow$ cooperative abort checking ensures user code can be stopped at any time without hanging the browser.

### 4. Competition Mat & Field Modeling
* **Decision**: Model the FLL competition mat as a high-resolution 4x8 ft plane with vinyl friction properties, bounded by 4 rigid perimeter wall colliders.
* **Color Sensor Simulation**: Use direct texture sampling at the raycast intersection point. Ambient lighting and sensor ground clearance (8–10 mm) are incorporated using an empirical Gaussian spot filter to mimic real color sensor reflection thresholds.

---

### 5. Architectural Quality, Code Documentation & Reviewability
* **Strict Layer Decoupling**:
  * `src/cad/`: Pure graph and metadata processing. Zero dependency on WebGL or physics engine. Fully runnable in test runners and headless environments.
  * `src/physics/`: Headless Rapier3D simulation. Exposes physics state and motors; knows nothing about DOM or UI.
  * `src/sensors/`: Geometric and color sampling bridge between physics position and field texture.
  * `src/runtime/`: Script sandbox and SPIKE Prime virtual APIs with cooperative abort controls.
  * `src/view/`: Three.js rendering layer; synchronizes visual node transforms to Rapier rigid bodies.
  * `src/ui/`: Presentation layer (DOM HUD, code editor, telemetry cards, mission library).
* **Code Documentation & Math Standard**:
  * Every exported class, interface, and method must have comprehensive TSDoc docstrings.
  * Coordinate transformations (LDraw coordinates $\leftrightarrow$ Three.js $\leftrightarrow$ Rapier3D) must explicitly explain axis mappings and units ($1\text{ LDU} = 0.4\text{mm}$, Three.js $= \text{meters}$).
  * Rotations and quaternions must document Euler axis conventions ($Y$-up, $+Z$-forward, $+X$-right).
  * Robotics formulas (wheel circumference $C = \pi D$, steering differentials, PID error formulas) must be documented in code comments to ensure student and mentor reviewability.

---

### 6. Rigorous Automated Test Strategy
* **Three-Tier Test Suite**:
  1. **Unit Tests (`*.test.ts`)**:
     * Pre-solver clustering tests: Verify that a 130+ part assembly (including 120 pins) reduces to $\le 5$ rigid bodies with valid revolute joints.
     * Parser tests: Verify LDraw parsing and Studio `.io` unzipping.
     * Python transpiler tests: Verify that Python loops (`while`, `for i in range`), conditionals, and async SPIKE calls are correctly translated.
  2. **Physics Integration Tests**:
     * Gravity settling test: Verify robot dropped from height settles stably on the vinyl mat without jitter.
     * Drive test: Verify that actuating motors rolls the wheels and translates the chassis across the floor.
  3. **End-to-End Mission Verification (`src/e2e/`)**:
     * Line-following mission: Headless simulation running a closed-loop P-controller against a simulated navigation line.
     * Gyro-turn mission: Verifies that a 90-degree turn script stops when yaw reaches $90^\circ \pm 3^\circ$.
* **Quality Gate**: `make test` must pass 100% of tests prior to any commit.

---

### 7. Multi-Agent Coordination System
To enable efficient multi-agent collaboration, the system defines 5 specialized agent roles with strict module ownership and interface contracts:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   Lead Architect & Coordinator                         │
│       (OpenSpec verification, system integration, quality gates)       │
└───────┬───────────────────┬───────────────────┬──────────────────┬─────┘
        │                   │                   │                  │
┌───────▼────────┐  ┌───────▼────────┐  ┌───────▼────────┐ ┌───────▼─────────┐
│ CAD / Kinematic│  │  Physics & Sim │  │  SPIKE Runtime │ │   WebGL & UI    │
│   Specialist   │  │   Specialist   │  │  VM Specialist │ │   Specialist    │
├────────────────┤  ├────────────────┤  ├────────────────┤ ├─────────────────┤
│ src/cad/*      │  │ src/physics/*  │  │ src/runtime/*  │ │ src/view/*      │
│ LDraw, Studio, │  │ Rapier3D Wasm, │  │ SPIKE API,     │ │ Three.js, HUD,  │
│ Clustering Pre-│  │ Arena, Joints, │  │ Sensors, VM,   │ │ Mat Texture,    │
│ solver, Graph  │  │ Motor Controls │  │ Cooperative    │ │ Telemetry, Code │
│                │  │                │  │ Cancellation   │ │ Editor Panels   │
└────────────────┘  └────────────────┘  └────────────────┘ └─────────────────┘
        │                   │                   │                  │
        └───────────────────┴───────────────────┴──────────────────┘
                                    │
                            ┌───────▼─────────┐
                            │ Testing & Code  │
                            │ Reviewer Agent  │
                            ├─────────────────┤
                            │ src/e2e/*,      │
                            │ Vitest Suites,  │
                            │ Math & TSDoc    │
                            │ Doc Integrity   │
                            └─────────────────┘
```

* **Interface Contracts**:
  * CAD $\to$ Physics: Passes immutable `RobotAssemblySpec` (clusters, colliders, joints, sensors).
  * Physics $\to$ Sensors / Runtime: Exposes `getPosition()`, `getYawDegrees()`, `motors.get(port)`.
  * Physics $\to$ Renderer: Read-only access to rigid body translation and quaternion for frame synchronization.
  * Runtime $\to$ UI: Emits `TelemetryState` and `ExecutionState`, accepts user script string.

---

## Risks / Trade-offs

* **[Risk] Missing LDraw parts in custom models**  
  *Mitigation*: Pre-package the top 300 FLL/SPIKE Technic parts in the simulator assets, with on-demand fallback to the official LDraw.org parts library CDN.
* **[Risk] Discrepancy in wheel friction between sim and physical mats**  
  *Mitigation*: Provide an interactive "Calibration" panel where teams can tune tire friction and motor acceleration curves to match their physical robot's timed runs.
* **[Risk] High part count in visual rendering**  
  *Mitigation*: Three.js `InstancedMesh` and geometry merging for static structural parts within each compound body, ensuring <10 draw calls per robot.
