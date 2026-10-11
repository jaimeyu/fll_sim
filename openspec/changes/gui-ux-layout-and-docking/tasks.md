# Tasks

## 1. Dockable & Minimizable Telemetry Pane

- [ ] 1.1 Implement `.hud-telemetry-dock` container with `.dock-right`, `.dock-bottom`, and `.dock-collapsed` modes in `hud.css` and `hud.ts` and verify rendering
- [ ] 1.2 Implement bottom-docked 2-column split layout with Sensors & Motors on left and Command/Physics Logs on right and verify layout
- [ ] 1.3 Add minimize/expand toggle and dock position controls with `localStorage` persistence and verify state restoration
- [ ] 1.4 Configure default camera initialization to centered overhead top-down view in main.ts and verify camera orientation

## 2. Right Sidebar Code Panel & Profiler Integration

- [ ] 2.1 Relocate FPS meter and performance profiler button into the right sidebar header and verify profiler modal launches properly
- [ ] 2.2 Redesign sample mission selector into a compact dropdown menu and verify mission loading
- [ ] 2.3 Implement unified `Import Code` button supporting Python (.py) and SPIKE App / Scratch (.llsp, .llsp3, .sb3, .json) and verify file parsing
- [ ] 2.4 Auto-register imported project names into the mission dropdown selector and verify immediate switching

## 3. Visual Block Viewer Pan & Zoom

- [ ] 3.1 Implement Pan & Zoom transform container with Zoom In, Zoom Out, and Reset buttons for the visual Scratch block SVG and verify scaling
- [ ] 3.2 Add mouse-wheel canvas zoom and drag-pan interactions to the block viewer canvas and verify smooth panning

## 4. Top Bar Robot Design & Port Mapping Inspector

- [ ] 4.1 Add `Robot Design` button to the top navigation bar and create the design selection modal with preset options
- [ ] 4.2 Integrate custom CAD model upload (`.io`, `.ldr`) and verify clustering and mesh instantiation
- [ ] 4.3 Build interactive port mapping inspector interface allowing users to inspect and remap motors (A-F) and sensors (C, D, Sonar, Gyro)

## 5. End-to-End Verification & Automated Tests

- [ ] 5.1 Add unit and DOM tests verifying dock mode switching, minimize toggling, and code import dropdown updates in `tests/`
- [ ] 5.2 Verify complete production build (`npm run build`) and test suite (`npm test`) pass cleanly
