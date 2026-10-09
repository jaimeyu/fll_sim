# Spec Delta: Robot Dyno Mode

## Purpose

Enables testing robot attachments and SPIKE Prime Python programs in place by locking the robot chassis while allowing drive and attachment motors to freely actuate.

## ADDED Requirements

### Requirement: Chassis Stationary Lock
The simulation physics engine SHALL provide a dyno mode toggle that fixes the robot chassis translation and orientation while preserving motor rotational degrees of freedom.

#### Scenario: Running motors in dyno mode
- **WHEN** robot dyno mode is enabled and a Python drive script executes
- **THEN** motor angles and virtual sensor values advance while the robot chassis remains fixed in position on the bench

#### Scenario: Disabling dyno mode
- **WHEN** robot dyno mode is disabled
- **THEN** the robot chassis returns to dynamic rigid body physics and drives freely across the table
