# FLL Robot Simulator — Architecture & Multi-Agent System

This document outlines the system architecture, testing standards, mathematical foundations, and multi-agent coordination contracts for the FLL Robot Simulator.

---

## 1. System Overview & Core Philosophy

The simulator provides an open-source, web-first 3D physics and code execution environment for FIRST LEGO League (FLL) robotics teams:
1. **Direct CAD Model Ingestion**: Parses BrickLink Studio (`.io`) and LDraw (`.ldr`, `.mpd`) models.
2. **Topological Pin & Fastener Clustering**: Automatically merges 90%+ of static Technic beams, frames, and friction pins into single compound rigid bodies, simulating only true kinematic degrees of freedom (e.g. drive wheels, attachment arms).
3. **Deterministic 3D Physics**: Powered by **Rapier3D** compiled to WebAssembly, running at fixed 60Hz.
4. **Virtual SPIKE Prime Python Runtime**: Runs real asynchronous SPIKE Prime Python programs (motor pairs, gyro turns, P-controller line followers) with cooperative cancellation.
5. **Real-time WebGL Visualization**: Three.js viewport rendering a 4x8 ft competition table with vinyl mat friction and dynamic sensor ground projection spots.

---

## 2. Layered Architecture & Modularity

The codebase is organized into strict, decoupled layers:

```
src/
├── cad/          # CAD parsing, Technic part catalog, topological pin clustering pre-solver
│   ├── types.ts
│   ├── part-catalog.ts
│   ├── clustering-solver.ts
│   ├── ldraw-importer.ts
│   └── models/advance-driving-base.ts
├── physics/      # Headless Rapier3D physics engine (zero DOM/browser dependencies)
│   ├── engine.ts
│   ├── arena.ts
│   ├── robot-body.ts
│   └── motor-controller.ts
├── sensors/      # Virtual sensor sampling (Gyro IMU, Color Sensors, Ultrasonic)
│   └── sensor-manager.ts
├── runtime/      # Virtual SPIKE Prime API & Python execution sandbox
│   ├── types.ts
│   ├── spike-api.ts
│   └── python-runner.ts
├── view/         # Three.js WebGL viewport & visual node synchronization
│   ├── viewport.ts
│   ├── mat-texture.ts
│   └── robot-renderer.ts
├── ui/           # DOM HUD, Python code editor, missions, live telemetry
│   ├── hud.ts
│   └── hud.css
├── e2e/          # Automated end-to-end mission verification
│   └── line-follow.test.ts
└── main.ts       # Application orchestrator
```

### Unidirectional Data Flow

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

---

## 3. Mathematical & Kinematic Foundations

### 3.1 Coordinate Systems
* **Three.js / Rapier3D**: Right-handed Cartesian coordinate system:
  * $+X$: Right (Lateral)
  * $+Y$: Up (Vertical)
  * $+Z$: Forward (Longitudinal)
* **LDraw (LDU)**:
  * $1\text{ LDU} = 0.4\text{ mm}$ (1 Technic stud = $20\text{ LDU} = 8\text{ mm}$).
  * $+Y$ points downwards in raw LDraw files; the importer flips $Y$ to align with Three.js.

### 3.2 Distance to Motor Degrees
A standard FLL drive wheel has diameter $D = 56\text{ mm} = 5.6\text{ cm}$.
The wheel circumference is:
$$C = \pi \cdot D \approx 17.593\text{ cm}$$

To drive a linear distance $d$ in centimeters:
$$\Delta \theta_{\text{wheel}} = \left(\frac{d}{C}\right) \times 360^\circ$$

For example, moving $30\text{ cm}$ requires $\approx 613.9^\circ$ of motor rotation.

### 3.3 Gyro / IMU Yaw Extraction
Heading yaw angle $\theta_{\text{yaw}}$ is computed from the chassis rigid body quaternion $q = (x, y, z, w)$ around the vertical $Y$-up axis:
$$\theta_{\text{yaw}} = \text{atan2}\left(2(wy - zx),\, 1 - 2(y^2 + x^2)\right) \times \frac{180}{\pi}$$

### 3.4 Color Sensor Ground UV Projection & Reflected Light
The downward-facing color sensors at local offsets $(x_{\text{local}}, z_{\text{local}})$ are transformed into table world coordinates using the chassis yaw:
$$\begin{pmatrix} X_{\text{world}} \\ Z_{\text{world}} \end{pmatrix} = \begin{pmatrix} X_{\text{chassis}} \\ Z_{\text{chassis}} \end{pmatrix} + \begin{pmatrix} \cos\theta & \sin\theta \\ -\sin\theta & \cos\theta \end{pmatrix} \begin{pmatrix} x_{\text{local}} \\ z_{\text{local}} \end{pmatrix}$$

The world coordinate is mapped to the mat's normalized UV coordinates $u, v \in [0, 1]$.
The reflected light percentage is computed using standard luminance weighting:
$$L = 0.299 \cdot R + 0.587 \cdot G + 0.114 \cdot B$$
$$\text{Reflected Light \%} = \text{round}\left(\frac{L}{255} \times 100\right)$$

---

## 4. Multi-Agent Coordination Contracts

To facilitate multiple autonomous agents and pair programming, tasks and code ownership are divided across specialized agent roles:

| Agent Role | Owned Modules | Key Responsibilities | Verification Command |
|---|---|---|---|
| **CAD & Kinematics Specialist** | `src/cad/*` | LDraw parser, Studio `.io` unzipper, Technic catalog, clustering pre-solver | `npx vitest run src/cad/` |
| **Physics Specialist** | `src/physics/*` | Rapier3D Wasm world, compound colliders, motor revolute joints, arena walls, friction | `npx vitest run src/physics/` |
| **SPIKE Runtime Specialist** | `src/runtime/*`, `src/sensors/*` | SPIKE Python API, async runner, raycasting, cooperative cancellation | `npx vitest run src/runtime/` |
| **WebGL & UI Specialist** | `src/view/*`, `src/ui/*` | Three.js viewport, procedural mat canvas, HUD, code editor, telemetry cards | `npm run build` |
| **Verification & Review Specialist** | `src/e2e/*`, specs | Automated E2E test suites, quality gates, documentation integrity, OpenSpec sync | `make test && make spec-validate` |

---

## 5. Automated Testing & Review Standards

Every pull request or major change must satisfy:
1. **Zero broken tests**: `make test` runs all unit, physics, and E2E tests cleanly.
2. **Strict type safety**: `make build` compiles TypeScript with `strict: true` and `noUnusedLocals: true`.
3. **Spec Alignment**: `make spec-validate` validates OpenSpec change artifacts with 0 errors.
4. **Code Comments**: Every public function and class contains clear TSDoc comments and explains the non-obvious math.
