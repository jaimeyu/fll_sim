# Design: FLL Robot Simulator Architecture

## Context

See `proposal.md` for project background and user requirements. 
Current FLL simulation tools suffer from two extremes: either proprietary desktop abandonware (VRT) or simplistic 2D/grid visualizers lacking CAD fidelity. We need a modern, high-performance, open-source 3D robotics simulation platform that takes real BrickLink Studio / LDraw CAD models, simulates accurate physics without pin overload, runs standard SPIKE Prime code, and runs natively in WebGL/WebAssembly.

## Goals / Non-Goals

**Goals:**
* Real-time 60fps WebGL rendering and 60–120Hz physics stepping on standard laptops and Chromebooks.
* Direct ingestion of BrickLink Studio (`.io`) and LDraw (`.ldr`, `.mpd`) CAD files.
* Intelligent pin and fastener clustering: bake 90%+ of static pins and beams into compound rigid bodies, simulating only true degrees of freedom (wheels, motor shafts, attachment arms).
* Sandboxed SPIKE Prime Python API execution in a Web Worker synchronized with the physics loop.
* Off-the-shelf, open-source foundation with clean desktop-to-web migration path.

**Non-Goals:**
* In-simulator CAD authoring or 3D brick building (users model in Studio/LeoCAD).
* Microscopic finite-element stress analysis of bending LEGO plastic.
* Direct physical gear-tooth meshing (gears are modeled as kinematic constraints/gear ratios).

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
* **Decision**: Run user scripts inside a dedicated Web Worker using a WebAssembly Python interpreter (Pyodide or MicroPython-Wasm) communicating via asynchronous message passing.
* **Architecture**:
  * `User Script (Worker)` $\rightarrow$ calls `hub.port.A.motor.run_for_degrees(360)`
  * `RPC Message Channel` $\rightarrow$ sends `{ cmd: "motor_step", port: "A", degrees: 360, speed: 500 }`
  * `Physics Controller (Main Thread)` $\rightarrow$ sets Rapier joint motor target velocity.
  * `Sensor Loop` $\rightarrow$ every physics tick, sample mat texture at sensor raycast UV coordinates, update heading from chassis quaternion, and post telemetry back to the worker.

### 4. Competition Mat & Field Modeling
* **Decision**: Model the FLL competition mat as a high-resolution 4x8 ft plane with vinyl friction properties, bounded by 4 rigid perimeter wall colliders.
* **Color Sensor Simulation**: Use direct texture sampling at the raycast intersection point. Ambient lighting and sensor ground clearance (8–10 mm) are incorporated using an empirical Gaussian spot filter to mimic real color sensor reflection thresholds.

## Risks / Trade-offs

* **[Risk] Missing LDraw parts in custom models**  
  *Mitigation*: Pre-package the top 300 FLL/SPIKE Technic parts in the simulator assets, with on-demand fallback to the official LDraw.org parts library CDN.
* **[Risk] Discrepancy in wheel friction between sim and physical mats**  
  *Mitigation*: Provide an interactive "Calibration" panel where teams can tune tire friction and motor acceleration curves to match their physical robot's timed runs.
* **[Risk] High part count in visual rendering**  
  *Mitigation*: Three.js `InstancedMesh` and geometry merging for static structural parts within each compound body, ensuring <10 draw calls per robot.
