# Spec Delta: Sandbox Mode

## Purpose

Provides an isolated mechanism inspection workbench where users can interactively poke, push, and test single mission elements using mouse-driven physical tools and free test blocks.

## ADDED Requirements

### Requirement: Isolated Mechanism Inspection Workbench
The system SHALL provide a Sandbox Mode displaying a focused single mission element on a test bench with dedicated camera framing and unobstructed 360-degree orbit and zoom inspection.

#### Scenario: Switching to sandbox mode
- **WHEN** user selects a mission element from the Sandbox Mode menu
- **THEN** the camera centers on the selected mission element and frames it within close inspection view

### Requirement: Interactive Mouse Pusher Tool
The system SHALL provide an interactive mouse pusher tool that moves with mouse cursor drag in 3D world space and applies real-time physical collision impulses to mission element parts.

#### Scenario: Dragging mouse pusher pushes mechanism
- **WHEN** user drags the mouse pusher tool into the mission model's push plate
- **THEN** physical contact impulses are transferred, actuating the mechanism in real-time

### Requirement: Dynamic Test Blocks Spawning
The system SHALL allow dropping free dynamic LEGO-style test blocks onto the sandbox bench for manual collision and lever testing.

#### Scenario: Dropping test block
- **WHEN** user clicks spawn test block
- **THEN** a dynamic rigid block drops onto the bench ready to interact with tools and mechanisms

### Requirement: Sandbox Mechanism Reset
The system SHALL provide a dedicated reset button in the sandbox interface restoring the focused mission model and clearing spawned test blocks.

#### Scenario: Resetting sandbox
- **WHEN** user clicks reset mission model
- **THEN** the mechanism returns to unsolved state and test blocks are reset
