# Spec Delta

## Purpose

Provides high-performance 3D rigid-body dynamics, kinematic joint actuation, and wheel-mat contact physics using an off-the-shelf WebAssembly-ready physics engine.

## ADDED Requirements

### Requirement: Rigid Body Dynamics Simulation
The system SHALL simulate 3D rigid body dynamics including mass, moment of inertia, gravity, linear momentum, and angular momentum for the robot and movable field objects.

#### Scenario: Settle robot on field mat
- **WHEN** the robot is placed above the field surface and simulation starts
- **THEN** system applies gravity, resolves contact between wheels/caster and the mat, and maintains a stable resting position without jitter

#### Scenario: Accurate center-of-mass tipping
- **WHEN** a heavy high-mounted attachment causes the center of mass to shift outside the wheel base during sudden deceleration
- **THEN** system physically models the tilting/tipping dynamics of the chassis accurately

### Requirement: Joint Actuator and Motor Torque Physics
The system SHALL support revolute and prismatic physics joints with velocity targets, PID motor controllers, and maximum torque limits corresponding to SPIKE Prime medium and large motors.

#### Scenario: Drive motor angular velocity control
- **WHEN** virtual motor command sets target speed to 500 degrees per second
- **THEN** physics joint applies torque up to the motor's torque curve to reach and maintain the target angular velocity under load

#### Scenario: Motor hold and braking modes
- **WHEN** motor stop command specifies "hold" or "brake"
- **THEN** joint actuator applies counter-torque or locks rotation at the current target angle

### Requirement: Wheel-Mat Contact and Friction Physics
The system SHALL simulate anisotropic friction, rolling resistance, and wheel slippage between LEGO rubber tires, plastic skids/casters, and the competition vinyl mat.

#### Scenario: Differential steering slip during aggressive turns
- **WHEN** robot performs a rapid pivot turn on the vinyl mat
- **THEN** physics engine resolves tangential friction forces and calculates realistic microscopic wheel slip rather than idealized geometric pathing
