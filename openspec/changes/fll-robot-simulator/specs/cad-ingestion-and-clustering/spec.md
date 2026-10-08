# Spec Delta

## Purpose

Provides LEGO CAD ingestion for standard BrickLink Studio (.io) and LDraw (.ldr, .mpd) files, classifying mechanical fasteners and clustering static parts into compound rigid bodies to optimize 3D physics simulation.

## ADDED Requirements

### Requirement: LEGO CAD File Ingestion
The system SHALL parse LDraw (.ldr, .mpd) and BrickLink Studio (.io) file formats, extracting 3D part geometries, transforms, part IDs, and hierarchical sub-model assemblies.

#### Scenario: Parse BrickLink Studio .io file
- **WHEN** user loads a `.io` file containing a SPIKE Prime robot
- **THEN** system uncompresses the container, parses the embedded model `.ldr` hierarchy, and resolves part geometries into 3D meshes

#### Scenario: Handle missing or unofficial parts
- **WHEN** a model contains a part ID not present in the local cache
- **THEN** system logs a warning, fetches the part from the official LDraw parts library, or falls back to an approximate bounding cylinder/box without aborting the parse

### Requirement: Pin and Fastener Classification
The system SHALL analyze the robot's part connection topology and classify all Technic pins, axles, and connectors into either static structural fasteners or dynamic kinetic joints.

#### Scenario: Classify static structural pins
- **WHEN** a Technic friction pin (e.g. part 2780) connects two co-planar beams in fixed alignment
- **THEN** system classifies the connection as static structural and marks it for rigid clustering

#### Scenario: Classify rotating wheel axles and motor hubs
- **WHEN** an axle is seated inside a motor output hub or wheel rim
- **THEN** system classifies the axle as a 1-DOF revolute joint rather than a static cluster

### Requirement: Compound Rigid Body Clustering
The system SHALL fuse all connected static parts into a single compound rigid body per kinematic link, reducing the total simulated body count to only the active degrees of freedom.

#### Scenario: Fuse 500-part robot into kinematic links
- **WHEN** a 500-part robot with 2 drive motors, 1 attachment motor, and 1 caster is processed
- **THEN** system produces no more than 6 rigid bodies (Main Chassis, Left Wheel, Right Wheel, Caster Hub, Caster Wheel, Attachment Arm) with compound collision shapes
