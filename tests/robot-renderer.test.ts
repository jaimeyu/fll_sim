import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Robot3DRenderer } from '../src/view/robot-renderer';
import { consolidateGroupMeshes } from '../src/cad/mesh-consolidator';

describe('Robot3DRenderer Mesh Consolidation', () => {
  it('consolidates chassis and wheels into compact merged meshes in constructor', () => {
    const robot = new Robot3DRenderer();

    let chassisMeshCount = 0;
    robot.chassisMesh.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) chassisMeshCount++;
    });

    let leftCount = 0;
    robot.leftWheelMesh.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) leftCount++;
    });

    let rightCount = 0;
    robot.rightWheelMesh.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) rightCount++;
    });

    const totalMeshes = chassisMeshCount + leftCount + rightCount;

    // Robot should be consolidated to ~22 meshes down from ~120
    expect(totalMeshes).toBeLessThanOrEqual(25);
    expect(chassisMeshCount).toBeLessThanOrEqual(15);
    expect(leftCount).toBeLessThanOrEqual(5);
    expect(rightCount).toBeLessThanOrEqual(5);
  });
});
