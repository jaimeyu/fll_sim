# Spec Delta: Robot Physics Simulation Tuning

## Purpose

Provides calibrated 3D rigid-body contact dynamics, realistic SPIKE motor inertia profiles, and stable fastener dual-lock anchoring for authentic FIRST LEGO League competition simulation.

## ADDED Requirements

### Requirement: Calibrated Tire-Mat Contact Dynamics
The physics simulation SHALL apply anisotropic contact friction, restitution, and contact damping to drive wheels such that lateral skidding and solver micro-jitter are eliminated during turning maneuvers.

#### Scenario: Turn in place on mat surface
- **WHEN** the robot executes a tank turn in place on the competition mat
- **THEN** the drive wheels maintain continuous contact without vertical bouncing, micro-skidding, or high-frequency solver oscillation

### Requirement: Authentic Motor Acceleration and Inertia Curves
The virtual motor system SHALL simulate physical rotor inertia, S-curve acceleration, and back-EMF velocity falloff matching LEGO SPIKE Prime Medium (45603) and Large (45602) motors.

#### Scenario: Step command to full speed
- **WHEN** a motor is commanded from standstill to 100% speed
- **THEN** the motor accelerates along an S-curve to reach target angular velocity within 80-120 milliseconds without instantaneous velocity discontinuities

### Requirement: Selective Dual-Lock Fastener Anchoring
The fastener anchoring system SHALL firmly anchor designated baseplate clusters to the mat floor while preserving dynamic unconstrained simulation of articulated sub-assemblies and levers.

#### Scenario: Anchor mission model base to mat
- **WHEN** a user places a dual-lock fastener on a mission model base
- **THEN** the model's base cluster is fixed to the table mat while any linked movable levers, hinges, and axles continue to simulate dynamic physics

### Requirement: Gyro Heading Integration Stability
The virtual IMU gyro sensor SHALL integrate angular velocity with low-pass filtering and collision recoil isolation to prevent permanent yaw drift when striking field perimeter walls.

#### Scenario: Wall collision during autonomous run
- **WHEN** the robot collides with a wooden border wall or rigid mission model
- **THEN** the gyro yaw heading accurately reports the physical robot orientation without unphysical angular impulse accumulation
