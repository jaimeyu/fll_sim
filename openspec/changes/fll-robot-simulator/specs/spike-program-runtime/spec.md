# Spec Delta

## Purpose

Provides a virtual execution runtime for LEGO SPIKE Prime programs (Python and block ASTs), synchronizing motor commands and sensor readings with the 3D physics simulation.

## ADDED Requirements

### Requirement: SPIKE Prime Python API Emulation
The system SHALL execute SPIKE Prime Python (and Pybricks) scripts within a sandboxed interpreter, exposing the standard `hub`, `motor`, `motor_pair`, `color_sensor`, and `distance_sensor` namespaces.

#### Scenario: Execute motor drive commands
- **WHEN** user script executes `motor_pair.move_for_degrees(720, steering=0, velocity=300)`
- **THEN** virtual runtime sends synchronized velocity setpoints to left and right drive joints until the encoder delta reaches 720 degrees

#### Scenario: Virtual color sensor surface sampling
- **WHEN** user script calls `color_sensor.get_reflected_light()`
- **THEN** runtime queries the raycast intercept position on the competition mat texture and returns the accurate reflected light percentage (0% to 100%)

#### Scenario: Virtual gyro motion sensor readings
- **WHEN** user script queries `hub.motion_sensor.get_yaw_angle()`
- **THEN** runtime extracts the current chassis rigid-body Euler yaw orientation from the physics engine and returns the relative heading in degrees

### Requirement: Closed-Loop Execution and Thread Synchronization
The system SHALL run user code in a dedicated worker thread or asynchronous execution loop that synchronizes with the physics timestep without blocking the rendering thread.

#### Scenario: Script abort on simulation stop
- **WHEN** user clicks "Stop" or the 2:30 match timer expires
- **THEN** runtime interrupts the executing script, stops all virtual motors, and resets all sensor state to idle
