# Design: Robot Physics Simulation Tuning & Contact Dynamics

## Context

See `proposal.md` for motivation. The physics engine integrates Rapier3D via `@dimforge/rapier3d-compat` using a 60 Hz fixed timestep. Wheel bodies are connected to the chassis body via `ImpulseJoint` revolute constraints, with motor speed governed by velocity targets. While baseline movement and active braking work, fine-grained friction, mass distribution, fastener compliance, and motor curves require calibration.

## Goals / Non-Goals

**Goals:**
- Calibrate Rapier contact parameters (friction coefficient, contact ERP, restitution) between rubber tire colliders and mat colliders.
- Implement realistic S-curve acceleration and torque-speed curves for SPIKE Prime motors.
- Implement selective cluster anchoring for dual-lock fasteners so only target baseplate clusters are anchored.
- Add numerical low-pass filtering and collision recoil rejection to virtual Gyro sensor heading.

**Non-Goals:**
- Replacing Rapier3D with another physics engine.
- Simulating internal motor gearbox backlash or gear tooth mesh friction.
- Simulating flexible plastic beam deformation or bending under load.

## Decisions

### 1. Separate Wheel Friction Material vs Chassis Material
- **Decision**: Configure dedicated physics materials for rubber wheels (high friction $\mu \approx 0.85$, restitution 0.05, damping 1.2) distinct from plastic chassis skids/castors ($\mu \approx 0.15$).
- **Alternatives Considered**: Uniform friction across all robot colliders (caused rubber tires to slide or plastic castors to grip and flip the robot).

### 2. S-Curve Motor Trajectory Generation in VirtualMotor
- **Decision**: Update `VirtualMotor.step(dt)` to shape target angular velocity using jerk-limited S-curve acceleration instead of instant step response.
- **Alternatives Considered**: Raw step response with instantaneous torque (causes wheel slip and unrealistic abrupt jerk).

### 3. Sub-Cluster Anchoring for Dual-Lock Fasteners
- **Decision**: When anchoring a mission model, set only the specific hit cluster's rigid body to `Fixed`, while maintaining joint constraints to adjacent dynamic clusters.
- **Alternatives Considered**: Freezing the entire model root hierarchy (froze levers and movable mechanisms).

## Risks / Trade-offs

- **[Risk]** S-curve acceleration may slightly change timing of autonomous scripts → **Mitigation**: Calibrate ramp duration to match physical SPIKE Prime firmware (80-120ms).
- **[Risk]** Increased contact solver iterations could impact frame rates on low-end machines → **Mitigation**: Keep solver iterations at 4 with velocity iterations at 2.
