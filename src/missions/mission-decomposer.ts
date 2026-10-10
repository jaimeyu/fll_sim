import { RobotAssemblySpec, ClusteredCompoundBody, ExtractedJoint } from '../cad/types';

export interface DecomposedMissionObject {
  id: string;
  name: string;
  spec: RobotAssemblySpec;
  initialPos: { x: number; y: number; z: number };
  yawDegrees: number;
  isBaseFixed: boolean;
  parentMissionId: string;
}

/**
 * Decomposes a multi-cluster LEGO assembly into distinct, independently movable
 * mission elements (e.g. separates fixed base stations, rolling carts, and loose game pieces).
 */
export function decomposeMissionAssembly(
  spec: RobotAssemblySpec,
  parentMissionId: string,
  basePosition: { x: number; y: number; z: number },
  yawDegrees: number = 0
): DecomposedMissionObject[] {
  // If only 1 cluster, return single object directly
  if (spec.clusters.length <= 1) {
    const isFixed = spec.clusters[0]?.isFixed !== undefined ? spec.clusters[0].isFixed : true;
    return [
      {
        id: parentMissionId,
        name: spec.name,
        spec,
        initialPos: { ...basePosition },
        yawDegrees,
        isBaseFixed: isFixed,
        parentMissionId,
      },
    ];
  }

  // 1. Group clusters into connected components via mechanical joints
  const clusterMap = new Map<string, ClusteredCompoundBody>();
  const adj = new Map<string, Set<string>>();
  for (const c of spec.clusters) {
    clusterMap.set(c.clusterId, c);
    adj.set(c.clusterId, new Set<string>());
  }

  for (const j of spec.joints) {
    if (adj.has(j.parentClusterId) && adj.has(j.childClusterId)) {
      adj.get(j.parentClusterId)!.add(j.childClusterId);
      adj.get(j.childClusterId)!.add(j.parentClusterId);
    }
  }

  const visited = new Set<string>();
  const components: ClusteredCompoundBody[][] = [];

  for (const c of spec.clusters) {
    if (visited.has(c.clusterId)) continue;
    const queue = [c.clusterId];
    visited.add(c.clusterId);
    const comp: ClusteredCompoundBody[] = [];

    while (queue.length > 0) {
      const currId = queue.shift()!;
      const clusterObj = clusterMap.get(currId);
      if (clusterObj) comp.push(clusterObj);

      const neighbors = adj.get(currId);
      if (neighbors) {
        for (const n of neighbors) {
          if (!visited.has(n)) {
            visited.add(n);
            queue.push(n);
          }
        }
      }
    }
    components.push(comp);
  }

  // Sort components so the main stationary frame / root is first (index 0)
  components.sort((a, b) => {
    const aHasRoot = a.some((c) => c.isRootChassis || c.clusterId === 'chassis_root');
    const bHasRoot = b.some((c) => c.isRootChassis || c.clusterId === 'chassis_root');
    if (aHasRoot && !bHasRoot) return -1;
    if (!aHasRoot && bHasRoot) return 1;
    const aParts = a.reduce((sum, c) => sum + (c.parts?.length || c.partIds.length), 0);
    const bParts = b.reduce((sum, c) => sum + (c.parts?.length || c.partIds.length), 0);
    return bParts - aParts;
  });

  const yawRad = (yawDegrees * Math.PI) / 180;
  const cosYaw = Math.cos(yawRad);
  const sinYaw = Math.sin(yawRad);

  const decomposed: DecomposedMissionObject[] = [];

  for (let idx = 0; idx < components.length; idx++) {
    const compClusters = components[idx];
    const isMainBase = idx === 0;

    // Calculate bounding box of this component in Studio mm
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (const cl of compClusters) {
      if (cl.parts && cl.parts.length > 0) {
        for (const p of cl.parts) {
          if (p.position[0] < minX) minX = p.position[0];
          if (p.position[0] > maxX) maxX = p.position[0];
          if (p.position[2] < minZ) minZ = p.position[2];
          if (p.position[2] > maxZ) maxZ = p.position[2];
        }
      } else {
        for (const col of cl.colliders) {
          const cxMm = col.offset[0] * 1000;
          const czMm = col.offset[2] * 1000;
          const hxMm = (col.halfExtents ? col.halfExtents[0] : 0.03) * 1000;
          const hzMm = (col.halfExtents ? col.halfExtents[2] : 0.03) * 1000;
          if (cxMm - hxMm < minX) minX = cxMm - hxMm;
          if (cxMm + hxMm > maxX) maxX = cxMm + hxMm;
          if (czMm - hzMm < minZ) minZ = czMm - hzMm;
          if (czMm + hzMm > maxZ) maxZ = czMm + hzMm;
        }
      }
    }

    // Compute center in mm (default to 0 if empty)
    const centerX_mm = (minX !== Infinity && maxX !== -Infinity) ? (minX + maxX) / 2 : 0;
    const centerZ_mm = (minZ !== Infinity && maxZ !== -Infinity) ? (minZ + maxZ) / 2 : 0;
    const deltaM_x = centerX_mm / 1000;
    const deltaM_z = centerZ_mm / 1000;

    // For secondary loose objects, center them around (0,0) locally and shift world position.
    // For main base, keeping anchor at (0,0) or center allows consistent field anchoring.
    const shouldShift = !isMainBase || (Math.abs(deltaM_x) > 0.001 || Math.abs(deltaM_z) > 0.001);

    const shiftX_mm = shouldShift ? centerX_mm : 0;
    const shiftZ_mm = shouldShift ? centerZ_mm : 0;
    const shiftM_x = shiftX_mm / 1000;
    const shiftM_z = shiftZ_mm / 1000;

    // Calculate rotated world position offset in Three.js / Rapier coordinates
    const worldOffsetX = shiftM_x * cosYaw + shiftM_z * sinYaw;
    const worldOffsetZ = -shiftM_x * sinYaw + shiftM_z * cosYaw;

    const objWorldPos = {
      x: basePosition.x + worldOffsetX,
      y: basePosition.y,
      z: basePosition.z + worldOffsetZ,
    };

    // Deep clone clusters and shift local coordinates by -shift
    const shiftedClusters: ClusteredCompoundBody[] = compClusters.map((cl) => {
      const clonedCl: ClusteredCompoundBody = {
        ...cl,
        fieldPositionOffset: cl.fieldPositionOffset
          ? [
              cl.fieldPositionOffset[0] - shiftM_x,
              cl.fieldPositionOffset[1],
              cl.fieldPositionOffset[2] - shiftM_z,
            ]
          : undefined,
        colliders: cl.colliders.map((col) => ({
          ...col,
          offset: [
            col.offset[0] - shiftM_x,
            col.offset[1],
            col.offset[2] - shiftM_z,
          ],
        })),
        parts: cl.parts?.map((p) => ({
          ...p,
          position: [
            p.position[0] - shiftX_mm,
            p.position[1],
            p.position[2] - shiftZ_mm,
          ],
        })),
      };
      return clonedCl;
    });

    const clusterIdSet = new Set(compClusters.map((c) => c.clusterId));
    const compJoints: ExtractedJoint[] = spec.joints
      .filter((j) => clusterIdSet.has(j.parentClusterId) && clusterIdSet.has(j.childClusterId))
      .map((j) => ({
        ...j,
        anchorParent: [
          j.anchorParent[0] - shiftM_x,
          j.anchorParent[1],
          j.anchorParent[2] - shiftM_z,
        ],
        anchorChild: [
          j.anchorChild[0] - shiftM_x,
          j.anchorChild[1],
          j.anchorChild[2] - shiftM_z,
        ],
      }));

    // Default Dual Lock fixed state:
    // Main base is fixed (anchored to field mat).
    // Secondary pieces (carts, boulders, loose blocks) are dynamic (slide on mat).
    const defaultFixed = isMainBase
      ? (shiftedClusters[0].isFixed !== undefined ? shiftedClusters[0].isFixed : true)
      : (shiftedClusters.some((c) => c.isFixed === true));

    // Name formatting
    const objName = isMainBase
      ? spec.name
      : `${spec.name} - ${compClusters[0].name || `Piece ${idx + 1}`}`;

    const objId = isMainBase ? parentMissionId : `${parentMissionId}_obj_${idx}`;

    const subSpec: RobotAssemblySpec = {
      name: objName,
      clusters: shiftedClusters,
      joints: compJoints,
      sensors: spec.sensors || [],
    };

    decomposed.push({
      id: objId,
      name: objName,
      spec: subSpec,
      initialPos: objWorldPos,
      yawDegrees,
      isBaseFixed: defaultFixed,
      parentMissionId,
    });
  }

  return decomposed;
}
