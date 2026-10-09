# Spec Delta: Mission Elements

## Purpose

Provides physical, interactive FIRST LEGO League competition mission models with multi-joint linkages, friction holds, and scored-state evaluations.

## ADDED Requirements

### Requirement: Mission Element Physics and Joint Constraints
The simulation engine SHALL support physical mission elements composed of fixed anchor bodies, movable link bodies, revolute joints, and prismatic joints with realistic physical constraints and visual synchronization.

#### Scenario: Element initialization and gravity settle
- **WHEN** a mission element is added to the physics world
- **THEN** its fixed anchor remains stationary while movable link bodies settle stably under gravity without exploding or jittering

### Requirement: 4-Axle Riser Mechanism with Friction Hold
The system SHALL provide a 4-axle toggle riser mission model where pushing the slider block toward the fixed base causes the middle blocks to rise vertically and remain in the elevated state due to joint friction.

#### Scenario: Pushing slider lifts middle block
- **WHEN** horizontal force is applied to the push plate toward the fixed anchor
- **THEN** the two folding arms rotate upward, raising the middle riser block vertically by at least 4 centimeters

#### Scenario: Friction hold maintains elevated state
- **WHEN** external pushing force is removed after the riser reaches elevated position
- **THEN** joint friction resists gravity and holds the middle riser block in the elevated state

### Requirement: Rotary Gear Turnstile Mechanism
The system SHALL provide a rotary gear mission model with a rotatable push paddle, gear linkage, and visual indicator dial.

#### Scenario: Pushing paddle rotates gear and dial
- **WHEN** force is applied to the turnstile push paddle
- **THEN** the paddle rotates around its revolute axis and turns the indicator dial to the scored position

### Requirement: Mission Model Reset
The system SHALL provide a reset operation for mission models restoring all joints, bodies, and poses to their initial unsolved state.

#### Scenario: Reset restores mechanism state
- **WHEN** mission element reset is invoked
- **THEN** all link bodies, slider positions, and joint velocities immediately return to their initial rest positions
