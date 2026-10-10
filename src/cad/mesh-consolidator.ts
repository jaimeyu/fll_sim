// src/cad/mesh-consolidator.ts
// Performance optimizer for LEGO models:
// Consolidates hundreds of individual part meshes into a few merged meshes grouped by material,
// reducing draw calls by 95-99% while preserving authentic visuals and shadows.

import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface ConsolidationOptions {
  castShadow?: boolean;
  receiveShadow?: boolean;
  clusterId?: string;
}

/**
 * Consolidates all static Mesh descendants of a Three.js Group into merged meshes
 * grouped by material. Replaces hundreds of individual draw calls with 1-4 draw calls.
 */
export function consolidateGroupMeshes(
  rootGroup: THREE.Group,
  options: ConsolidationOptions = {}
): THREE.Group {
  if (rootGroup.children.length <= 1) {
    return rootGroup;
  }

  rootGroup.updateMatrixWorld(true);
  const invRoot = rootGroup.matrixWorld.clone().invert();

  // Bucket geometries by material instance
  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const originalMeshes: THREE.Mesh[] = [];

  rootGroup.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && !(child as THREE.InstancedMesh).isInstancedMesh) {
      const mesh = child as THREE.Mesh;
      if (!mesh.geometry) return;

      originalMeshes.push(mesh);
      const mat = mesh.material as THREE.Material;
      if (!byMaterial.has(mat)) {
        byMaterial.set(mat, []);
      }

      // Transform geometry into rootGroup's local coordinate space
      const localMat = mesh.matrixWorld.clone().premultiply(invRoot);
      const clonedGeom = mesh.geometry.clone().applyMatrix4(localMat);
      byMaterial.get(mat)!.push(clonedGeom);
    }
  });

  // If there are no meshes to consolidate (or just 1), keep as is
  if (originalMeshes.length <= 1) {
    return rootGroup;
  }

  // Clear existing unmerged children
  rootGroup.clear();

  // Create merged meshes for each unique material
  for (const [mat, geometries] of byMaterial.entries()) {
    try {
      const mergedGeom = BufferGeometryUtils.mergeGeometries(geometries, false);
      if (mergedGeom) {
        const mergedMesh = new THREE.Mesh(mergedGeom, mat);
        mergedMesh.castShadow = options.castShadow ?? true;
        mergedMesh.receiveShadow = options.receiveShadow ?? true;
        mergedMesh.userData = {
          isConsolidated: true,
          clusterId: options.clusterId ?? rootGroup.userData?.clusterId,
          partCount: geometries.length,
        };
        rootGroup.add(mergedMesh);
      }
    } catch (err) {
      console.warn('[mesh-consolidator] Failed to merge geometries for material:', err);
    } finally {
      // Clean up temporary intermediate geometries
      for (const g of geometries) {
        g.dispose();
      }
    }
  }

  return rootGroup;
}
