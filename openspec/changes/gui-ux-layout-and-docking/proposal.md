# Proposal: Simulator GUI Layout, Docking Telemetry & Code UX Overhaul

## Why

As the simulator's feature set has matured, the floating modal approach for telemetry and profiler controls obscures the 3D mat and robot interaction area. Students and coaches need an ergonomic, space-efficient interface that maximizes 3D viewport real estate, provides flexible docking (right pane or bottom split-screen), simplifies code loading with a compact mission selector and direct Python/SPIKE Scratch importer, supports pan/zoom in block code, and enables visual robot design inspection and port mapping directly from the top navigation bar.

## What Changes

- **Dockable & Minimizable Telemetry Pane**:
  - Transform the telemetry and diagnostics system from a floating modal into a flexible dockable pane with two docking modes: **Right Sidebar** or **Bottom Tray**.
  - Provide a quick minimize/collapse button to instantly clear the 3D viewport.
  - When docked at the bottom, arrange the UI horizontally with **Sensors & Motors on the left** and **Command & Physics Logs on the right** to maximize horizontal widescreen efficiency.
- **Streamlined Code Panel & Profiler Button on Right Bar**:
  - Relocate the bottom FPS meter / performance profiler button into the right sidebar action header.
  - Replace the bulky mission preset container with a compact dropdown selector.
  - Add a dedicated **Import Code** button supporting both Python (`.py`) and SPIKE App Word Blocks / Scratch projects (`.llsp`, `.llsp3`, `.sb3`, `.json`).
  - Automatically append imported files into the mission selector dropdown so users can immediately select and switch between programs.
  - Add smooth **Zoom In / Zoom Out / Reset** controls and mouse-wheel canvas zooming to the visual Scratch block viewer.
- **Top Bar Robot Design Selector & Port Mapping Inspector**:
  - Add a **Robot Design** button on the top navigation bar.
  - Modal/sheet allowing users to switch between preset robot models or upload a custom CAD model (`.io`, `.ldr`).
  - Interactive robot inspection view to inspect clustered geometry and verify/remap hardware port assignments (Drive Wheels A/B, Attachments C/D/E/F, Color Sensors, Ultrasonic Sonar, IMU).
- **Preserved Left Navigation Bar**: Keep the existing left sidebar drawer (Manual Driver Mode, Mission Elements, Field Mat selector) clean and stable.

## Capabilities

### New Capabilities
- `dockable-telemetry-pane`: Configurable right/bottom docking pane with collapse toggle and side-by-side sensors/logs horizontal layout.
- `code-panel-and-importer-ux`: Compact mission dropdown, unified Python & SPIKE Scratch importer with auto-updating list, pan/zoom block viewer, and relocated FPS profiler button.
- `robot-design-and-port-inspector`: Top bar robot selector with CAD model upload and interactive hardware port mapping verification.

### Modified Capabilities
<!-- None: Reorganizes and enhances frontend HUD and editor UI -->

## Impact

- **Affected Files**: `src/ui/hud.ts`, `src/ui/hud.css`, `src/main.ts`, `src/importers/spike-scratch-importer.ts`, `src/ui/cad-inspector.ts`
- **UI State**: Persists docking preference (`right` vs `bottom`) and pane collapsed states in `localStorage`.
- **Dependencies**: Reuses existing Three.js, Blockly/Scratch SVG rendering, and CAD clustering solver.
