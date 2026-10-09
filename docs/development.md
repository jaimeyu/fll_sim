# Development & Multi-Agent Coordination

This guide explains how to develop, test, and contribute to `fll-sim`, as well as how autonomous agents collaborate using strict modular boundaries.

---

## 1. Prerequisites & Environment

* **Node.js**: v20 or v22 LTS
* **Python**: 3.10+ with `uv`
* **Mise** (optional, recommended): Manages tool versions from `mise.toml`

Install tools and dependencies:
```bash
make setup
```

---

## 2. Development Commands

| Command | Action |
|---|---|
| `make dev` | Starts Vite local development server on port 3000 |
| `make test` | Runs the multi-tier Vitest test suite |
| `make build` | Compiles TypeScript and creates production WebGL bundle in `dist/` |
| `make docs-serve` | Starts local MkDocs documentation server |
| `make docs-build` | Builds strict MkDocs documentation site |
| `make spec-status` | Displays OpenSpec artifact completion status |
| `make spec-validate`| Validates OpenSpec change specifications |

---

## 3. Multi-Agent Coordination System

`fll-sim` is architected for collaborative multi-agent development. Each agent role operates on designated modules with explicit interface contracts:

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

### Module Boundaries & Invariants
1. **`src/cad/`**: Pure data structures and graph algorithms. Must not import from `three`, Rapier, or DOM APIs.
2. **`src/physics/`**: Pure physics engine logic. Must run in headless Node/Vitest environments without a browser window.
3. **`src/runtime/`**: Pure asynchronous execution logic. Exposes promises that resolve when physical movement completes.
4. **`src/view/`**: WebGL rendering layer. Synchronizes Three.js visual meshes from read-only physics state.

---

## 4. Quality Gates & Testing Standards

Every change must pass:
```bash
make test && make build && make spec-validate && make docs-build
```
No broken tests, type errors, or spec validation issues are permitted.
