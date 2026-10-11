# Design: Simulator GUI Layout, Docking Telemetry & Code UX Overhaul

## Context

See `proposal.md` for motivation. The simulator interface currently uses a left navigation drawer (driver mode, mission presets, mats), a right code/execution sidebar, and several floating modals (floating telemetry, performance profiler). This design unifies diagnostics into a dockable viewport pane, streamlines code loading and block visualization, and introduces a dedicated robot design selector and hardware port mapping inspector.

## Goals / Non-Goals

**Goals:**
- Provide a responsive telemetry pane dockable either on the **Right** (sidebar style) or on the **Bottom** (wide tray style), with smooth minimize/collapse.
- In bottom dock mode, display live sensors and motor cards on the left side and live command/physics logs on the right side.
- Relocate the bottom FPS meter into the right code bar header.
- Streamline mission selection with a compact dropdown and a unified Import Code button (.py, .llsp, .llsp3, .sb3, .json) that automatically registers imported scripts in the dropdown.
- Add pan and zoom controls to the visual Scratch block viewer.
- Add a Top Bar "Robot Design" button with a CAD upload dialog and interactive motor/sensor port mapping inspector.

**Non-Goals:**
- Modifying the existing left drawer architecture (Manual Driver WASD, Mission Elements catalog, Map selection remain unchanged).
- Re-architecting the core Three.js WebGL canvas pipeline.

## Decisions

### 1. Unified Dockable Telemetry Tray (`.hud-telemetry-dock`)
- **Decision**: Replace the absolute floating modal with a CSS-docked panel that supports `.dock-right` (width 380px) and `.dock-bottom` (height 260px), toggleable via header buttons and persisted in `localStorage`.
- **Bottom Layout**: When in `.dock-bottom`, use CSS grid (`grid-template-columns: 1fr 1fr;` or flexbox) placing Sensors & Motors in the left container and Command & Physics Logs in the right container.
- **Minimization**: Toggle `.dock-collapsed` to slide the panel down or right, showing only a 30px pill strip with quick metrics and an expand button.
- **Alternatives Considered**: Keeping floating resizable modal (obscures mat and requires frequent moving by user).

### 2. Relocation of FPS Profiler Button
- **Decision**: Place a compact FPS chip button inside the right sidebar header (`.editor-header-actions`). Clicking it opens the full performance budget modal.
- **Alternatives Considered**: Hiding profiler entirely in settings (too hard to reach during frame rate drops).

### 3. Unified Code Importer with Dynamic Dropdown Registration
- **Decision**: Provide a single `[ 📥 Import Code ]` button with a hidden file input accepting `.py,.llsp,.llsp3,.sb3,.json`.
  - On upload, identify file type: if Python, load directly into editor; if SPIKE project/Scratch, transpile via `SpikeScratchImporter`.
  - Add an `<option value="custom_imported">` to the compact `#sample-select` dropdown and select it immediately.
- **Alternatives Considered**: Separate import buttons for Python vs Scratch (clutters header).

### 4. Pan & Zoom for Visual Scratch Block Canvas
- **Decision**: Wrap the rendered Scratch block SVG in a transform container (`.block-canvas-viewport`) governed by `scale` (0.5 to 2.0) and `translate(x, y)`. Add `[ + ]`, `[ - ]`, `[ ↺ Reset ]` buttons on the canvas header and support mouse-wheel zooming (`e.ctrlKey` / wheel).
- **Alternatives Considered**: Heavy external blockly runtime iframe (too heavy, high memory overhead, doesn't match SPIKE theme).

### 5. Top Bar Robot Design & Port Mapping Inspector Modal
- **Decision**: Add a button `#btn-top-robot-design` in the top header. Clicking it opens a modal with:
  - Preset selector (Advanced Driving Base, Spike Base).
  - Custom CAD upload file input (`.io`, `.ldr`).
  - Port mapping list (Motor A, Motor B, Aux C-F, Color C/D, Ultrasonic, Gyro) allowing users to map detected model parts to virtual SPIKE ports.
- **Alternatives Considered**: Ingesting CAD only through the mission assets drawer (confused robot chassis with field mission models).

## Risks / Trade-offs

- **[Risk]** Bottom dock layout on narrow laptop screens (<1024px) might cramp horizontal split → **Mitigation**: Use media queries to automatically switch to stacked or tabbed view on screens below 1100px width.
- **[Risk]** Large Scratch block programs might render wide SVG canvases → **Mitigation**: Pan/zoom transforms allow effortless navigation across large block scripts.
