# 🤖 FLL Robot Simulator (`fll-sim`)

[![Deploy Simulator to GitHub Pages](https://github.com/jaimeyu/fll_sim/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/jaimeyu/fll_sim/actions/workflows/deploy-pages.yml)
[![Tests: 580 Passing](https://img.shields.io/badge/Tests-580%20passing-brightgreen?style=flat&logo=vitest&logoColor=white)](https://github.com/jaimeyu/fll_sim/actions)
[![Code Coverage](https://img.shields.io/endpoint?url=https://jaimeyu.github.io/fll_sim/coverage/badge.json)](https://jaimeyu.github.io/fll_sim/coverage/)
[![Live Simulator](https://img.shields.io/badge/Live%20Simulator-Launch%20in%20Browser-2ea043?style=flat&logo=googlechrome&logoColor=white)](https://jaimeyu.github.io/fll_sim/)
[![Documentation](https://img.shields.io/badge/Documentation-MkDocs%20Portal-526cfe?style=flat&logo=materialformkdocs&logoColor=white)](https://jaimeyu.github.io/fll_sim/docs/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Physics: Rapier3D](https://img.shields.io/badge/Physics-Rapier3D%20(Wasm)-orange.svg?logo=webassembly&logoColor=white)](https://rapier.rs/)
[![Rendering: Three.js](https://img.shields.io/badge/Rendering-Three.js%20(WebGL)-black.svg?logo=threedotjs&logoColor=white)](https://threejs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-339933.svg?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![FLL Season](https://img.shields.io/badge/FLL%20Season-2026%20BIOGLOW-388bfd?style=flat)](https://www.firstlegoleague.org/)

> 🎮 **Live Web Simulator & Online Resources (GitHub Pages):**  
> ### 👉 **[Launch FLL Robot Simulator Live](https://jaimeyu.github.io/fll_sim/)** 👈  
> *Zero-install, browser-based 3D physics simulation platform with full LEGO SPIKE Prime Python & Word Blocks programming!*  
>  
> * 📖 **[Simulator Documentation & Student Tutorials](https://jaimeyu.github.io/fll_sim/docs/)**  
> * 📊 **[Interactive Code Coverage Report](https://jaimeyu.github.io/fll_sim/coverage/)**  
> * 🌐 **[FLL Team 76265 "Lego Legends" Engineering Notebook](https://jaimeyu.github.io/FLL_76265_2026_BIOGLOW/)**

Unlike 2D grid visualizers or discontinued proprietary desktop simulators, `fll-sim` combines **real CAD model ingestion** (BrickLink Studio `.io` / LDraw `.ldr`), **intelligent topological pin clustering**, **deterministic WebAssembly 3D physics** (Rapier3D), and an **asynchronous SPIKE Prime Python runtime** capable of running in standard web browsers.

---

## 🌟 Key Features

* **🏎️ Pre-Configured FLL Advance Driving Base**: Ready-to-drive procedural model of the official competition driving base featuring dual angular drive motors (Ports A & B), 56mm rubber wheels, rear frictionless caster skid, and dual downward color sensors (Ports C & D).
* **🧩 Direct CAD Ingestion (`.io` / `.ldr`)**: Drag-and-drop BrickLink Studio (`.io`) or LeoCAD / LDraw (`.ldr`, `.mpd`) models directly into the simulator.
* **⚡ Topological Pin & Fastener Clustering**: Eliminates physics engine slowdown by fusing 120+ static friction pins, beams, frames, and motor stators into compound rigid bodies, simulating only true 1-DOF kinematic joints (drive wheels, motor shafts).
* **🎯 4x8 ft Competition Table Arena**: Modeled to official FIRST LEGO League specifications with vinyl mat friction ($\mu = 0.75$), floor colliders, and perimeter boundary walls.
* **🐍 Real SPIKE Prime Python API**: Execute Python scripts in-browser with shims for `PrimeHub` (`motion_sensor` 6-axis gyro yaw), `MotorPair` (`move(distance, 'cm')`, `move_tank()`), `ColorSensor` (reflected light % and color classification), and `wait_for_seconds()`.
* **🔍 Real-Time Sensor Visualizer**: Dynamic ground projection discs underneath color sensors change color and reflection intensity in real time based on the mat surface.
* **🎥 Multi-Angle Camera Presets**: Toggle between **3D Isometric Orbit**, **Top-Down Field Overview**, and **Third-Person Follow Robot** camera modes.
* **⏱️ Match Timer & Telemetry Dashboard**: Official 2:30 match countdown timer with live readouts for coordinates $(X, Z)$, heading yaw, motor tachometers, and sensor reflection.
* **📜 Preloaded FLL Missions**:
  1. *Mission 1: Drive Straight (30 cm)*
  2. *Mission 2: Gyro 90° Turn*
  3. *Mission 3: Proportional Line Follower (P-Controller)*
  4. *Mission 4: Dual-Sensor Line Squaring*

---

## 🚀 Quick Start

### Prerequisites
* [Node.js](https://nodejs.org/) v20+ (Node 22 recommended)
* [Python](https://www.python.org/) 3.10+ with [`uv`](https://docs.astral.sh/uv/) (for MkDocs documentation)

### 1. Installation
```bash
git clone git@github.com:jaimeyu/fll_sim.git
cd fll_sim
make setup
```

### 2. Development Server
Start the local WebGL development server:
```bash
make dev
```
Open **[http://localhost:3000](http://localhost:3000)** in Chrome, Edge, Safari, or Firefox.

### 3. Running Automated Tests
Run the complete multi-tier test suite (clustering solver, Rapier3D Wasm, motor actuation, Python runner, and end-to-end line following):
```bash
make test
```

### 4. Production WebGL Build
Compile the static, zero-install WebGL bundle to `dist/`:
```bash
make build
```

### 5. Documentation Site (MkDocs)
Launch the documentation server locally:
```bash
make docs-serve
```
Or build the strict documentation bundle:
```bash
make docs-build
```

---

## 🏛️ System Architecture

```
User Python Script
       │
       ▼
[Virtual SPIKE API] ──(Target speed & distance)──► [Motor Controller]
                                                           │
                                                           ▼
[Sensor Raycasts] ◄──(Rigid body transforms)── [Rapier3D Physics (60Hz)]
       │                                                   │
       ▼                                                   ▼
[Live Telemetry]                                   [Three.js Viewport]
       │                                                   │
       └────────────────► [HUD DOM Dashboard] ◄───────────┘
```

For complete architectural details, mathematical derivations (quaternion yaw formulas, wheel radius ratios, coordinate transformations), and multi-agent coordination contracts, see [`ARCHITECTURE.md`](ARCHITECTURE.md).

---

## 🤝 Multi-Agent Development & Roles

The codebase is organized into strict, decoupled layers to facilitate collaborative multi-agent development:

| Role | Directory | Responsibility |
|---|---|---|
| **CAD & Kinematics Specialist** | `src/cad/` | LDraw parser, Studio `.io` unzipper, Technic catalog, clustering pre-solver |
| **Physics Specialist** | `src/physics/` | Rapier3D Wasm world, compound colliders, motor revolute joints, arena walls |
| **SPIKE Runtime Specialist** | `src/runtime/`, `src/sensors/` | SPIKE Python API, async runner, raycasting, cooperative cancellation |
| **WebGL & UI Specialist** | `src/view/`, `src/ui/` | Three.js viewport, procedural mat canvas, HUD, code editor, telemetry cards |
| **Verification Specialist** | `src/e2e/`, specs | Automated E2E test suites, quality gates, documentation integrity, OpenSpec sync |

---

## 🙏 Acknowledgements & Attribution

### 3D Mission Models (BrickLink Studio `.io` Files)
* **Source:** [Komurobo FLL 3D Models](https://komurobo.com/fll/3d-models/)
* **Project:** [Komurobo.com](https://komurobo.com/)
* **Contact:** `info@komurobo.com`
* **Description:** 3D digital CAD models (`.io`) and rendered previews of FIRST LEGO League challenge missions across multiple seasons (Bioglow, Unearthed, Submerged, Masterpiece, Superpowered) were created by the independent community initiative **Komurobo**.
* **Attribution Notice:** We gratefully acknowledge the creators and community at Komurobo for meticulously modeling and sharing these 3D BrickLink Studio assets with the robotics education community. Komurobo is an independent initiative and is not affiliated with, sponsored by, or endorsed by FIRST® or Robotique FIRST Québec.
* **Fair Use & Non-Commercial Notice:** These models are used strictly for non-commercial educational robotics simulation, strategy planning, and student learning. LEGO®, Technic™, and SPIKE™ are trademarks of the LEGO Group. FIRST® and FIRST® LEGO® League are trademarks of FIRST and the LEGO Group.

---

## 📜 License

This project is licensed under the **GNU General Public License v3.0 (GPL-3.0)**. See the [LICENSE](LICENSE) file for details.
