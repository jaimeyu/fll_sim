# Spec Delta: Code Panel & Importer UX

## Purpose

Provides a streamlined code interface with compact mission selection, multi-format Python and SPIKE Scratch project importing with auto-updating dropdowns, pan/zoomable visual blocks, and right-bar profiler access.

## ADDED Requirements

### Requirement: Compact Mission Selector Dropdown
The right sidebar SHALL present sample missions and imported projects in a compact dropdown selector rather than an oversized panel.

#### Scenario: Selecting mission script
- **WHEN** user chooses a mission from the compact dropdown
- **THEN** the active code editor updates immediately with the selected mission's code and execution setpoint

### Requirement: Unified Multi-Format Code Importer
The code panel SHALL provide a prominent Import Code button supporting Python (.py) and SPIKE App / Scratch (.llsp, .llsp3, .sb3, .json) files.

#### Scenario: Importing SPIKE Scratch project
- **WHEN** user selects an .llsp or .llsp3 file via the import dialog
- **THEN** the system parses the word blocks, adds the project to the mission dropdown, selects it, and renders the visual blocks and runnable Python shims

### Requirement: Interactive Zoom and Pan for Visual Blocks
The visual Scratch block viewer SHALL support interactive zooming and panning via dedicated zoom in/out controls and mouse-wheel dragging.

#### Scenario: Zooming block canvas
- **WHEN** user clicks the Zoom In button or uses the mouse wheel over the block canvas
- **THEN** the block SVG transforms smoothly between 50% and 200% scale while preserving crisp vector rendering

### Requirement: Right Bar Performance Profiler Button
The right sidebar header SHALL house the FPS meter and performance profiler launcher button, eliminating floating UI elements at the bottom of the 3D mat.

#### Scenario: Opening profiler from right bar
- **WHEN** user clicks the FPS button in the right bar header
- **THEN** the performance budget and profiler modal opens with frame timing breakdowns
