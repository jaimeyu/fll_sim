import {
  PlacedPart,
  ConnectionLink,
  ClusteredCompoundBody,
  ExtractedJoint,
  RobotAssemblySpec,
} from './types';
import { TECHNIC_PART_CATALOG, isChainPart } from './part-catalog';

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
    const { name, parts } = input;
    const links = input.links || (input as any).connections || [];
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

    // Link parts belonging to the same submodel instance (rigid subassembly)
    const bySubmodel = new Map<string, string[]>();
    for (const part of parts) {
      const sub = part.submodelInstance || part.submodel;
      if (sub) {
        if (!bySubmodel.has(sub)) bySubmodel.set(sub, []);
        bySubmodel.get(sub)!.push(part.id);
      }
    }
    for (const ids of bySubmodel.values()) {
      for (let k = 0; k < ids.length - 1; k++) {
        adjacency.get(ids[k])?.add(ids[k + 1]);
        adjacency.get(ids[k + 1])?.add(ids[k]);
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
      const isChain = componentPartIds.some((id) => {
        const p = partMap.get(id);
        return p && (p.role === 'CHAIN_LINK' || isChainPart(p.partNumber, p.submodel));
      });
      const clusterName = isRoot
        ? 'Chassis Main Assembly'
        : isChain
        ? 'Dynamic Chain Link'
        : componentPartIds.some((id) => partMap.get(id)?.role === 'WHEEL_RIM')
        ? 'Drive Wheel'
        : componentPartIds.some((id) => partMap.get(id)?.role === 'CASTER_SKID')
        ? 'Passive Caster / Skid'
        : `Rigid Body ${clusterId}`;

      // Build colliders based on cluster type
      const colliders: ClusteredCompoundBody['colliders'] = [];
      const massKg = Math.max(0.01, totalMassGrams / 1000);

      // Compute bounding box of parts in cluster in meters
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;

      for (const id of componentPartIds) {
        const p = partMap.get(id);
        if (!p) continue;
        const px = p.position[0] / 1000;
        const py = p.position[1] / 1000;
        const pz = p.position[2] / 1000;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
        if (pz < minZ) minZ = pz;
        if (pz > maxZ) maxZ = pz;
      }

      const hasParts = minX !== Infinity;
      const cx = hasParts ? (minX + maxX) / 2 : 0;
      const cy = hasParts ? (minY + maxY) / 2 : 0;
      const cz = hasParts ? (minZ + maxZ) / 2 : 0;

      if (isRoot && hasCore) {
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
        // Group parts by submodel instance to create decomposed, tight compound colliders
        const subGroups = new Map<string, PlacedPart[]>();
        for (const id of componentPartIds) {
          const p = partMap.get(id);
          if (!p) continue;
          const key = p.submodelInstance || p.submodel || 'main';
          if (!subGroups.has(key)) subGroups.set(key, []);
          subGroups.get(key)!.push(p);
        }

        if (subGroups.size > 1) {
          for (const pList of subGroups.values()) {
            let sMinX = Infinity, sMaxX = -Infinity;
            let sMinY = Infinity, sMaxY = -Infinity;
            let sMinZ = Infinity, sMaxZ = -Infinity;
            for (const p of pList) {
              const px = p.position[0] / 1000;
              const py = p.position[1] / 1000;
              const pz = p.position[2] / 1000;
              if (px < sMinX) sMinX = px;
              if (px > sMaxX) sMaxX = px;
              if (py < sMinY) sMinY = py;
              if (py > sMaxY) sMaxY = py;
              if (pz < sMinZ) sMinZ = pz;
              if (pz > sMaxZ) sMaxZ = pz;
            }
            // Standard 4mm margin (half-stud pitch) so collider covers physical LEGO brick walls
            const sHx = Math.max(0.004, (sMaxX - sMinX) / 2 + 0.004);
            const sHy = Math.max(0.004, (sMaxY - sMinY) / 2 + 0.004);
            const sHz = Math.max(0.004, (sMaxZ - sMinZ) / 2 + 0.004);
            const sCx = (sMinX + sMaxX) / 2;
            const sCy = (sMinY + sMaxY) / 2;
            const sCz = (sMinZ + sMaxZ) / 2;

            colliders.push({
              shape: 'box',
              halfExtents: [sHx, sHy, sHz],
              offset: [sCx, sCy, sCz],
              rotation: [0, 0, 0, 1],
              friction: isRoot ? 0.8 : 0.5,
              restitution: 0.05,
            });
          }
        } else {
          // Single tight box collider with standard 4mm margin
          const tightHx = Math.max(0.004, (maxX - minX) / 2 + 0.004);
          const tightHy = Math.max(0.004, (maxY - minY) / 2 + 0.004);
          const tightHz = Math.max(0.004, (maxZ - minZ) / 2 + 0.004);
          colliders.push({
            shape: 'box',
            halfExtents: [tightHx, tightHy, tightHz],
            offset: [cx, cy, cz],
            rotation: [0, 0, 0, 1],
            friction: isRoot ? 0.8 : 0.5,
            restitution: 0.05,
          });
        }
      }

      const clusterParts: PlacedPart[] = componentPartIds
        .map((id) => partMap.get(id))
        .filter((p): p is PlacedPart => p !== undefined);

      clusters.push({
        clusterId,
        name: clusterName,
        isRootChassis: isRoot,
        isFixed: isRoot,
        partIds: componentPartIds,
        parts: clusterParts,
        totalMassKg: massKg,
        colliders,
      });
    }

    // Ensure root chassis exists (pick the largest non-chain rigid assembly as root chassis/base)
    if (!clusters.some((c) => c.isRootChassis)) {
      if (clusters.length > 0) {
        const nonChainClusters = clusters.filter(
          (c) => !c.parts?.some((p) => p.role === 'CHAIN_LINK' || isChainPart(p.partNumber, p.submodel))
        );
        const targetList = nonChainClusters.length > 0 ? nonChainClusters : clusters;
        targetList.sort((a, b) => b.partIds.length - a.partIds.length);
        const oldId = targetList[0].clusterId;
        targetList[0].isRootChassis = true;
        targetList[0].isFixed = true;
        targetList[0].clusterId = 'chassis_root';
        for (const [partId, cid] of partToClusterId.entries()) {
          if (cid === oldId) {
            partToClusterId.set(partId, 'chassis_root');
          }
        }
      }
    }

    // Extract 1-DOF and spherical joints from active links
    const joints: ExtractedJoint[] = [];
    let jointIndex = 0;
    for (const link of activeLinks) {
      const parentCluster = partToClusterId.get(link.fromPartId) || 'chassis_root';
      const childCluster = partToClusterId.get(link.toPartId) || `cluster_${jointIndex}`;

      if (parentCluster === childCluster) continue;

      const fromPart = partMap.get(link.fromPartId);
      const toPart = partMap.get(link.toPartId);
      const isMotorPort = (fromPart?.meta?.port || toPart?.meta?.port) as any;
      const isFlexible = link.connectionType === 'FREE_ROTATION';

      joints.push({
        jointId: `joint_${jointIndex++}`,
        name: isFlexible ? 'Flexible Chain Joint' : `Revolute Joint ${link.jointAxis ? 'Wheel' : 'Arm'}`,
        type: isFlexible ? 'SPHERICAL' : 'REVOLUTE',
        parentClusterId: parentCluster,
        childClusterId: childCluster,
        anchorParent: (link.anchor || [0, 0, 0]) as [number, number, number],
        anchorChild: (link.anchor || [0, 0, 0]) as [number, number, number],
        axis: (link.jointAxis || [1, 0, 0]) as [number, number, number],
        motorPort: isMotorPort,
        maxTorqueNm: 0.25, // SPIKE large motor rated torque
        maxVelocityDegPerSec: 1000,
      });
    }

    // Determine cluster fixed state:
    // - Root chassis is fixed to field mat by default (base dual lock anchor).
    // - Articulated mechanisms (child of joints) are DYNAMIC.
    // - Chain links and flexible linkages are ALWAYS DYNAMIC.
    // - Free-standing game pieces / payload objects remain dynamic.
    const childClusterIds = new Set(joints.map((j) => j.childClusterId));
    for (const cluster of clusters) {
      const isChain =
        cluster.name.toLowerCase().includes('chain') ||
        cluster.parts?.some((p) => p.role === 'CHAIN_LINK' || isChainPart(p.partNumber, p.submodel));

      if (cluster.isRootChassis) {
        cluster.isFixed = true;
      } else if (isChain) {
        cluster.isFixed = false;
        if (!cluster.name.toLowerCase().includes('chain')) {
          cluster.name = 'Dynamic Chain Link';
        }
      } else if (childClusterIds.has(cluster.clusterId)) {
        cluster.isFixed = false;
      } else if (joints.length === 0) {
        // Stationary base assemblies without any joints stay intact
        cluster.isFixed = true;
      } else {
        // Disconnected subassemblies / payloads in articulated assemblies stay dynamic
        cluster.isFixed = false;
      }
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
