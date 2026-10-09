import {
  PlacedPart,
  ConnectionLink,
  ClusteredCompoundBody,
  ExtractedJoint,
  RobotAssemblySpec,
} from './types';
import { TECHNIC_PART_CATALOG } from './part-catalog';

export interface PreSolverInput {
  name: string;
  parts: PlacedPart[];
  links: ConnectionLink[];
}

export class CadClusteringPreSolver {
  /**
   * Solves an assembly graph into compound bodies and 1-DOF joints
   */
  public static solve(input: PreSolverInput): RobotAssemblySpec {
    const { name, parts, links } = input;
    const partMap = new Map<string, PlacedPart>();
    for (const part of parts) {
      partMap.set(part.id, part);
    }

    // Build adjacency list for rigid connections
    const adjacency = new Map<string, Set<string>>();
    for (const part of parts) {
      adjacency.set(part.id, new Set<string>());
    }

    const activeLinks: ConnectionLink[] = [];

    for (const link of links) {
      if (link.connectionType === 'RIGID_PIN' || link.connectionType === 'RIGID_FRAME') {
        adjacency.get(link.fromPartId)?.add(link.toPartId);
        adjacency.get(link.toPartId)?.add(link.fromPartId);
      } else if (link.connectionType === 'REVOLUTE_AXLE' || link.connectionType === 'FREE_ROTATION') {
        activeLinks.push(link);
      }
    }

    // Connected components search for rigid clusters
    const visited = new Set<string>();
    const clusters: ClusteredCompoundBody[] = [];
    const partToClusterId = new Map<string, string>();

    let clusterIndex = 0;
    for (const part of parts) {
      if (visited.has(part.id)) continue;

      // Group all reachable rigidly connected parts
      const queue: string[] = [part.id];
      visited.add(part.id);
      const componentPartIds: string[] = [];

      while (queue.length > 0) {
        const currId = queue.shift()!;
        componentPartIds.push(currId);

        const neighbors = adjacency.get(currId);
        if (neighbors) {
          for (const neighborId of neighbors) {
            if (!visited.has(neighborId)) {
              visited.add(neighborId);
              queue.push(neighborId);
            }
          }
        }
      }

      // Check if this cluster contains the chassis core or motors
      const hasCore = componentPartIds.some((id) => {
        const p = partMap.get(id);
        return p && (p.role === 'CHASSIS_CORE' || p.role === 'MOTOR_STATOR');
      });

      const clusterId = hasCore ? 'chassis_root' : `cluster_${clusterIndex++}`;
      for (const id of componentPartIds) {
        partToClusterId.set(id, clusterId);
      }

      // Compute mass and simple bounding colliders for the cluster
      let totalMassGrams = 0;
      for (const id of componentPartIds) {
        const p = partMap.get(id);
        if (!p) continue;
        const catalogEntry = TECHNIC_PART_CATALOG[p.partNumber];
        const mass = catalogEntry ? catalogEntry.massGrams : 2.0;
        totalMassGrams += mass;
      }

      const isRoot = clusterId === 'chassis_root';
      const clusterName = isRoot
        ? 'Chassis Main Assembly'
        : componentPartIds.some((id) => partMap.get(id)?.role === 'WHEEL_RIM')
        ? 'Drive Wheel'
        : componentPartIds.some((id) => partMap.get(id)?.role === 'CASTER_SKID')
        ? 'Passive Caster / Skid'
        : `Rigid Body ${clusterId}`;

      // Build colliders based on cluster type
      const colliders: ClusteredCompoundBody['colliders'] = [];
      const massKg = Math.max(0.01, totalMassGrams / 1000);

      if (isRoot) {
        // 1. Compound box for main chassis frame (88mm wide frame, leaving clean clearance to wheels).
        // Elevated with bottom at Y = 0.005 - 0.012 = -0.007m (28mm clearance above ground at Y = -0.035m, never drags).
        colliders.push({
          shape: 'box',
          halfExtents: [0.044, 0.012, 0.050],
          offset: [0, 0.005, -0.015],
          rotation: [0, 0, 0, 1],
          friction: 0.1,
          restitution: 0.0,
        });
        // 2. Frictionless spherical rear caster skid (Part 49283).
        // Radius 10mm with center at Y = -0.0245m: bottom touches at Y = -0.0345m (0.5mm clearance, wheels bear primary weight).
        colliders.push({
          shape: 'sphere',
          radius: 0.010,
          offset: [0, -0.0245, -0.065],
          rotation: [0, 0, 0, 1],
          friction: 0.0, // Frictionless glide for tank turns
          restitution: 0.0,
        });
      } else if (clusterName === 'Drive Wheel') {
        // Cylinder collider for drive wheel
        colliders.push({
          shape: 'cylinder',
          radius: 0.028, // 56mm diameter = 28mm radius
          halfHeight: 0.013, // 26mm width = 13mm half height
          offset: [0, 0, 0],
          rotation: [0, 0, 0.7071, 0.7071], // Oriented along X axis
          friction: 0.9, // High traction rubber
          restitution: 0.0,
        });
      } else if (clusterName === 'Passive Caster / Skid') {
        // Low-friction sphere collider for caster ball
        colliders.push({
          shape: 'sphere',
          radius: 0.012,
          offset: [0, 0, 0],
          rotation: [0, 0, 0, 1],
          friction: 0.02, // Low friction glide
          restitution: 0.0,
        });
      } else {
        colliders.push({
          shape: 'box',
          halfExtents: [0.02, 0.02, 0.02],
          offset: [0, 0, 0],
          rotation: [0, 0, 0, 1],
          friction: 0.5,
          restitution: 0.1,
        });
      }

      clusters.push({
        clusterId,
        name: clusterName,
        isRootChassis: isRoot,
        partIds: componentPartIds,
        totalMassKg: massKg,
        colliders,
      });
    }

    // Ensure root chassis exists
    if (!clusters.some((c) => c.isRootChassis)) {
      if (clusters.length > 0) {
        clusters[0].isRootChassis = true;
        clusters[0].clusterId = 'chassis_root';
      }
    }

    // Extract 1-DOF joints from active links
    const joints: ExtractedJoint[] = [];
    let jointIndex = 0;
    for (const link of activeLinks) {
      const parentCluster = partToClusterId.get(link.fromPartId) || 'chassis_root';
      const childCluster = partToClusterId.get(link.toPartId) || `cluster_${jointIndex}`;

      if (parentCluster === childCluster) continue;

      const fromPart = partMap.get(link.fromPartId);
      const toPart = partMap.get(link.toPartId);
      const isMotorPort = (fromPart?.meta?.port || toPart?.meta?.port) as any;

      joints.push({
        jointId: `joint_${jointIndex++}`,
        name: `Revolute Joint ${link.jointAxis ? 'Wheel' : 'Arm'}`,
        type: 'REVOLUTE',
        parentClusterId: parentCluster,
        childClusterId: childCluster,
        anchorParent: (link.anchor || [0, 0, 0]) as [number, number, number],
        anchorChild: [0, 0, 0],
        axis: (link.jointAxis || [1, 0, 0]) as [number, number, number],
        motorPort: isMotorPort,
        maxTorqueNm: 0.25, // SPIKE large motor rated torque
        maxVelocityDegPerSec: 1000,
      });
    }

    // Extract sensors from placed parts
    const sensors: RobotAssemblySpec['sensors'] = [];
    for (const part of parts) {
      if (part.role === 'SENSOR_COLOR') {
        const port = (part.meta?.port || 'C') as any;
        sensors.push({
          id: `color_sensor_${port}`,
          type: 'COLOR',
          port,
          relativePosition: [
            part.position[0] / 1000,
            part.position[1] / 1000,
            part.position[2] / 1000,
          ],
          relativeOrientation: part.rotation,
        });
      } else if (part.role === 'SENSOR_DISTANCE') {
        const port = (part.meta?.port || 'E') as any;
        sensors.push({
          id: `dist_sensor_${port}`,
          type: 'DISTANCE',
          port,
          relativePosition: [
            part.position[0] / 1000,
            part.position[1] / 1000,
            part.position[2] / 1000,
          ],
          relativeOrientation: part.rotation,
        });
      }
    }

    // Always include Hub IMU gyro sensor
    sensors.push({
      id: 'hub_motion_gyro',
      type: 'GYRO',
      relativePosition: [0, 0.04, 0],
      relativeOrientation: [0, 0, 0, 1],
    });

    return {
      name,
      clusters,
      joints,
      sensors,
    };
  }
}
