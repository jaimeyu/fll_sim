# Spec Delta

## Purpose

Renders a hardware-accelerated 3D WebGL viewport displaying the assembled LEGO robot, FLL competition mat, sensor beam overlays, and interactive match run controls.

## ADDED Requirements

### Requirement: Hardware-Accelerated 3D WebGL Scene
The system SHALL render an interactive 3D scene containing the FLL competition table (perimeter walls, 4x8 ft mat texture), the assembled robot model, and interactive lighting using WebGL.

#### Scenario: Render competition mat and boundary walls
- **WHEN** the 3D viewport initializes with an FLL mat image
- **THEN** system displays the table surface at official dimensions with vinyl texture mapping and outer wooden perimeter walls

#### Scenario: Smooth 60fps orbit and inspection camera
- **WHEN** user rotates, pans, or zooms using mouse or touch controls
- **THEN** system smoothly updates the camera perspective without stalling the background physics loop

### Requirement: Rigid Body Visual Mesh Synchronization
The system SHALL synchronize the 3D rendered positions and quaternions of each robot component link with its corresponding physics rigid body every frame.

#### Scenario: Real-time visual motion during driving
- **WHEN** physics simulation steps the chassis and wheel bodies forward
- **THEN** system updates the Three.js visual node transforms with sub-frame interpolation, showing smooth rotation of wheels and chassis travel

### Requirement: Sensor Visualizer Overlays and HUD
The system SHALL provide optional visual debug overlays showing color sensor ground target spots, ultrasonic distance cones, and live dashboard telemetry.

#### Scenario: Display color sensor ground spot
- **WHEN** color sensor overlay is toggled on
- **THEN** system draws a projected light spot on the mat surface beneath the sensor showing the sampled area and detected RGB/reflection value
