# 🤖 FLL Robot Simulator

Welcome to the documentation for **FLL Robot Simulator (`fll-sim`)**, an open-source, web-first 3D physics robotics simulator designed specifically for **FIRST LEGO League (FLL)** teams, coaches, mentors, and students.

```
       ┌────────────────────────────────────────────────────────┐
       │               FLL Robot Simulator (WebGL)              │
       │                                                        │
       │   BrickLink Studio (.io) / LDraw (.ldr) CAD Models     │
       │                           ▼                            │
       │         Topological Pin Clustering Pre-Solver          │
       │                           ▼                            │
       │         Rapier3D Physics Engine (Wasm, 60Hz)           │
       │                           ▼                            │
       │          Asynchronous SPIKE Prime Python VM            │
       │                           ▼                            │
       │           Three.js 3D Viewport & HUD Telemetry         │
       └────────────────────────────────────────────────────────┘
```

---

## Why FLL Robot Simulator?

FIRST LEGO League teams commonly face major hurdles when preparing competition robots:
* **Hardware Bottlenecks**: Only one physical robot is available per team, forcing students to wait in line for testing time.
* **Lack of Modern Simulators**: Legacy desktop simulators (such as Virtual Robotics Toolkit) are proprietary desktop abandonware with closed ecosystems. Web alternatives either lack physics or are restricted to rigid 2D grid worlds.
* **Physics Engine Overload**: Simulating hundreds of individual Technic friction pins and beams in real-time crashes standard physics solvers.

**FLL Robot Simulator solves these challenges:**
1. **Zero-Install WebGL**: Runs directly in Chrome, Edge, Safari, or Firefox on laptops and Chromebooks.
2. **True LEGO CAD Integration**: Ingests real models from BrickLink Studio (`.io`) and LeoCAD (`.ldr`).
3. **Compound Pin Clustering**: Pre-solves static pin-and-beam connections, fusing 120+ static parts into compound rigid bodies while preserving active 1-DOF joints (wheels, attachment arms).
4. **Authentic SPIKE Prime Python Runtime**: Write standard Python using `PrimeHub`, `MotorPair`, and `ColorSensor`. Run line followers, gyro turns, and precision drive missions in simulation before touching the real robot!

---

## Quick Start

### 1. Launch Development Server
```bash
make setup
make dev
```
Open [http://localhost:3000](http://localhost:3000) to view the 3D competition table and robot.

### 2. Run Test Suites
```bash
make test
```
Executes all unit tests, physics stability checks, and end-to-end mission verification tests.

### 3. Build WebGL Production Bundle
```bash
make build
```
Creates a zero-install static bundle in `dist/`.

---

## Table of Contents

* [**Architecture Overview**](architecture.md): Deep dive into the layered architecture, Rapier3D physics integration, and data flow.
* [**Advance Driving Base Guide**](guides/advance_driving_base.md): Detailed specifications of the official FLL competition robot.
* [**SPIKE Python API Reference**](guides/spike_python.md): Python syntax, motor pair movement, gyro turns, and P-controller line following.
* [**CAD Import Guide**](guides/cad_import.md): How to export models from BrickLink Studio and LeoCAD into the simulator.
* [**Development & Multi-Agent**](development.md): How the codebase is structured for team collaboration and autonomous agents.
