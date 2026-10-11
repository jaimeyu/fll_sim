# Proposal: Robot Physics Simulation Tuning & Contact Dynamics

## Why

While baseline physics and electromagnetic braking reliably bring the robot to a standstill, physical interactions during manual and autonomous runs still exhibit subtle simulation artifacts: tire-mat friction micro-vibrations, non-linear motor inertia deceleration curves, fastener dual-lock interaction with articulated sub-assemblies, and gyro integration stability during high-torque collisions. Calibrating these physics parameters in Rapier3D will align simulated robot behavior with real-world LEGO SPIKE Prime driving physics.

## What Changes

- **Tire Contact & Friction Solver Tuning**: Calibrate Coulomb friction, restitution, and contact damping between LEGO rubber tires (parts 49283 / 44309) and the vinyl competition mat to eliminate solver micro-jitter and unrealistic wheel skidding.
- **Actuator Torque Curves & Motor Inertia**: Implement realistic SPIKE Prime medium and large motor angular inertia, back-EMF velocity falloff, and smooth S-curve acceleration/deceleration profiles.
- **Dual-Lock Fastener & Attachment Dynamics**: Refine dual-lock fastener anchoring so anchored baseplates securely adhere to the mat while keeping attached kinematic arms, levers, and gears fully dynamic without over-constraining the solver.
- **Inertia Tensor & Center of Mass Calibration**: Dynamically compute realistic center-of-mass offsets based on attachment configurations (e.g., front lifting arms, heavy gearboxes) to ensure authentic tipping and wheel lifting during aggressive acceleration.
- **Gyro Heading Integration & IMU Filtering**: Refine virtual IMU yaw sampling with low-pass filtering and collision recoil isolation to prevent heading drift under impact.

## Capabilities

### New Capabilities
- `robot-physics-tuning`: Advanced Rapier3D contact solver tuning, motor torque/inertia profiles, and realistic FLL table dynamic interactions.

### Modified Capabilities
<!-- None: Builds upon the core simulation engine -->

## Impact

- **Affected Files**: `src/physics/robot-body.ts`, `src/physics/engine.ts`, `src/physics/types.ts`, `src/missions/mission-elements.ts`
- **APIs**: Enhanced physics configuration parameters for motor curves, tire friction models, and fastener compliance.
- **Dependencies**: `@dimforge/rapier3d-compat` solver parameters (contact ERP, solver iterations).
