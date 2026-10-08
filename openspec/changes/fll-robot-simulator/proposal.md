# Proposal: Open-Source WebGL FLL Robot Simulator

## Why

Existing FIRST LEGO League (FLL) simulation platforms are either obsolete legacy desktop products (like Virtual Robotics Toolkit, designed over a decade ago for EV3 with proprietary paywalls) or lightweight grid toys that lack realistic 3D CAD fidelity and mechanical modularity. Teams cannot easily take their physical robot design from BrickLink Studio or LeoCAD and test autonomous SPIKE Prime programs in a high-performance, physics-backed environment.

We need a modern, open-source, web-first FLL robot simulator that:
1. Ingests standard LEGO CAD models (`.ldr`, `.mpd`, `.io` from Studio or LeoCAD).
2. Optimizes simulation performance by automatically clustering non-moving structural pins and beams into compound rigid bodies, simulating only true kinematic degrees of freedom.
3. Executes real LEGO SPIKE Prime programs (Python & visual block AST) against virtual motors and sensors.
4. Runs on laptops today with a clean, zero-friction compilation path to WebGL and WebAssembly for browser deployment.

## What Changes

* **New CAD Ingestion Pipeline**: Ingest standard LDraw (`.ldr`, `.mpd`) and BrickLink Studio (`.io`) models.
* **Kinematic Pin Pre-Solver & Rigid Body Clustering**: Analyze connection topologies to differentiate static structural pins (fixed chassis elements) from moving joints (motor shafts, wheels, hinges, gears), fusing static components into optimized compound collision hulls.
* **Physics & Simulation Engine Integration**: Leverage an off-the-shelf, WebAssembly-ready physics engine (Rapier3D) to simulate robot mass, wheel friction, tire grip, inertia, and field surface interactions.
* **Virtual SPIKE Prime Hub & Code Runtime**: Execute SPIKE Prime Python / Pybricks scripts and block programs in a sandbox, mapping virtual Port calls to simulated motor velocity/torque and reading virtual sensor data (dual color reflection, gyro heading, distance).
* **WebGL Hardware-Accelerated 3D Viewport**: Render the robot and official competition mats with Three.js / WebGL, providing full 60fps interactive orbit camera and sensor overlays.

## Capabilities

### New Capabilities
- `cad-ingestion-and-clustering`: Ingest LDraw/Studio CAD models and pre-solve static structural clusters vs dynamic kinematic joints.
- `physics-and-simulation-engine`: 3D rigid-body kinematics and contact dynamics using Rapier3D (Wasm-ready).
- `spike-program-runtime`: Sandboxed execution of SPIKE Prime programs (Python and block AST) linked to simulated motors and sensors.
- `webgl-rendering-and-ui`: Hardware-accelerated 3D field viewer, robot visualization, sensor raycast overlays, and run controls.

### Modified Capabilities
<!-- None: This is a greenfield project initializing the simulator. -->

## Impact

* **New Project Repository**: Standalone repository (`fll-sim`) managed with `mise`, `make`, and `openspec`.
* **Tooling & Dependencies**: Node.js 22, Python 3.12, TypeScript, Three.js, `@dimforge/rapier3d-compat`, Pyodide/Skulpt, Vite.
* **Performance Impact**: Static clustering reduces a 500-part LEGO model from 500 individual rigid bodies to 4–8 compound bodies, reducing per-frame physics computation by >90%.
