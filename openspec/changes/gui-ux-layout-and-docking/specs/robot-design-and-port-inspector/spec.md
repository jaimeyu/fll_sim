# Spec Delta: Robot Design & Port Inspector

## Purpose

Enables switching robot CAD presets, uploading custom robot models, and interactively inspecting or remapping hardware port assignments from the top navigation bar.

## ADDED Requirements

### Requirement: Top Bar Robot Design Launcher
The top navigation bar SHALL provide a Robot Design button that opens a dedicated design selector and hardware inspector modal.

#### Scenario: Opening robot design modal
- **WHEN** user clicks the Robot Design button on the top navigation bar
- **THEN** the system displays preset robot models, custom upload options, and active port mappings

### Requirement: Custom Robot CAD Upload
The robot design system SHALL allow uploading custom Studio (.io) and LDraw (.ldr, .mpd) files, parsing Technic parts, and clustering rigid bodies for simulation.

#### Scenario: Uploading custom robot CAD
- **WHEN** user uploads a valid .io robot model file
- **THEN** the simulator loads the visual geometry, computes physics clusters, and opens the port mapping inspector

### Requirement: Interactive Hardware Port Mapping Verification
The inspector SHALL visually display and allow remapping of robot hardware ports (Drive Wheels A/B, Attachments C/D/E/F, Color Sensors, Distance Sonar, and IMU).

#### Scenario: Verifying port assignments
- **WHEN** user inspects the loaded robot design
- **THEN** each actuator and sensor component highlights its physical position on the robot model and shows its assigned SPIKE port letter
