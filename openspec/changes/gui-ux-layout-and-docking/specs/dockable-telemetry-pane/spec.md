# Spec Delta: Dockable Telemetry Pane

## Purpose

Enables flexible right-docked and bottom-docked telemetry layouts with instant minimize toggles and side-by-side sensor/log views to maximize 3D viewport canvas space.

## ADDED Requirements

### Requirement: Flexible Docking Positions
The telemetry pane SHALL support two docking configurations: right sidebar and bottom horizontal tray, switchable via an interactive dock control.

#### Scenario: Switching from right dock to bottom dock
- **WHEN** user clicks the dock position button on the telemetry header
- **THEN** the telemetry pane re-anchors to the bottom of the viewport with a horizontal split layout and persists this preference in localStorage

### Requirement: Minimize and Expand Toggle
The telemetry pane SHALL provide an instant minimize toggle that collapses the pane to a compact status tab without discarding live sensor or command log history.

#### Scenario: Minimizing telemetry pane
- **WHEN** user clicks the minimize toggle button
- **THEN** the pane collapses to a minimal title strip, freeing the underlying 3D canvas area for camera interaction

### Requirement: Horizontal Split Bottom Layout
When docked at the bottom, the telemetry pane SHALL display live sensors and motor speeds on the left panel and command/physics event logs on the right panel.

#### Scenario: Viewing bottom-docked telemetry
- **WHEN** the telemetry pane is expanded in bottom-docked mode
- **THEN** color sensors, distance, gyro, and motor speeds are visible simultaneously alongside the scrolling command logs window without requiring tab switching

### Requirement: Default Top-Down Camera View
The 3D scene camera SHALL initialize by default to a centered, overhead top-down perspective view aligned with the competition mat, enabling students to program and view line-following and mission trajectories without camera adjustment.

#### Scenario: First load camera position
- **WHEN** the simulator initializes in the browser
- **THEN** the camera is positioned directly above the center of the field looking downward with the mat upright, while preserving orbit controls for 3D navigation when desired

