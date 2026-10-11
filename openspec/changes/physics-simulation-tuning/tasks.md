# Tasks

## 1. Wheel Friction & Contact Dynamics Calibration

- [ ] 1.1 Calibrate Rapier contact parameters for rubber tire colliders vs vinyl mat and verify with turn-in-place unit test
- [ ] 1.2 Implement differentiated low-friction material properties for caster ball / glide skid parts and verify slip behavior

## 2. Motor Acceleration Curves & Inertia Profiles

- [ ] 2.1 Implement S-curve acceleration profiling in VirtualMotor step logic and verify velocity ramp in unit test
- [ ] 2.2 Add back-EMF velocity falloff curve under heavy mechanical resistance and verify torque behavior

## 3. Dual-Lock Fastener Sub-Cluster Anchoring

- [ ] 3.1 Refine fastener placement to anchor only target baseplate clusters while keeping linked sub-assemblies dynamic
- [ ] 3.2 Add integration tests verifying articulated mission models (e.g. M01, M02) remain rotatable after base anchoring

## 4. IMU Gyro Heading Stabilization

- [ ] 4.1 Implement digital low-pass filtering and collision recoil isolation for virtual gyro yaw calculation
- [ ] 4.2 Verify that wall collisions during straight runs do not induce artificial yaw drift in unit tests
