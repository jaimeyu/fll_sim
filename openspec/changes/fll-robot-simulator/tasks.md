# Tasks

## 1. Project Scaffolding & Core Dependencies

- [ ] 1.1 Initialize `package.json` with TypeScript, Vite, and testing dependencies; verify `npm install` runs cleanly
- [ ] 1.2 Install `three` and `@dimforge/rapier3d-compat`; verify a minimal script initializes the Rapier WebAssembly physics engine
- [ ] 1.3 Configure Vite for WebGL build and Web Worker bundling; verify development server runs via `make dev`

## 2. CAD Ingestion & Pin Clustering Pre-Solver

- [ ] 2.1 Integrate Three.js `LDrawLoader` and Studio `.io` unzipper to parse hierarchical CAD models into visual scene graphs
- [ ] 2.2 Build Technic part metadata catalog identifying fasteners (pins 2780/3673/6558), actuators (motors 45601/45602), and wheel hubs
- [ ] 2.3 Implement the topological connectivity solver to cluster static beams/pins into compound bodies and extract active 1-DOF joints
- [ ] 2.4 Write unit tests verifying that a standard 400+ piece SPIKE Driving Base decomposes into $\le 6$ rigid bodies with valid joint constraints

## 3. Physics Simulation Engine (Rapier3D Integration)

- [ ] 3.1 Construct Rapier compound rigid bodies and colliders from the clustered CAD geometry with estimated part masses
- [ ] 3.2 Implement motor revolute joint actuators with target velocity, PID control, and SPIKE motor torque limits
- [ ] 3.3 Construct the 4x8 ft competition table arena with vinyl mat friction, floor colliders, and perimeter boundary walls
- [ ] 3.4 Implement fixed-timestep 60Hz physics stepping loop and verify stability during robot drop and acceleration tests

## 4. Virtual SPIKE Prime Program Runtime

- [ ] 4.1 Set up WebAssembly Python runtime (Pyodide / MicroPython Wasm) inside a Web Worker communicating via message passing
- [ ] 4.2 Implement SPIKE Python API shims for `motor.run_for_degrees()`, `motor_pair.move()`, and velocity setpoints
- [ ] 4.3 Implement virtual sensor raycasts: color sensor mat texture UV sampling and gyro IMU quaternion heading extraction
- [ ] 4.4 Implement execution lifecycle controls (Start, Pause, Abort, and 2:30 match timer) with thread-safe stop synchronization

## 5. WebGL 3D Viewport & Interactive HUD

- [ ] 5.1 Implement Three.js WebGL scene with orbit controls, realistic lighting, and competition mat vinyl texturing
- [ ] 5.2 Implement transform interpolation synchronizing Three.js mesh visual nodes with Rapier rigid body states each frame
- [ ] 5.3 Add debug sensor overlays showing color sensor ground projection spots and ultrasonic distance cones
- [ ] 5.4 Build interactive UI panel with CAD file loader (`.io`/`.ldr`), Python script editor, telemetry dashboard, and run controls

## 6. End-to-End Verification & WebGL Deployment

- [ ] 6.1 Create automated test verifying a line-following Python script drives the virtual robot along a mat line in simulation
- [ ] 6.2 Configure static WebGL export build and verify zero-install execution in a standard web browser via `make build`
