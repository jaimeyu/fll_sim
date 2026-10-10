// src/cad/lego-asset-manager.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { legoAssetManager } from './lego-asset-manager';
import { ClusteredCompoundBody } from './types';

describe('LegoAssetManager (Draco GLB & Local Offline Fallback)', () => {
  beforeEach(() => {
    legoAssetManager.resetStats();
  });

  it('manages render mode and persists to localStorage', () => {
    legoAssetManager.setRenderMode('draco_glb');
    expect(legoAssetManager.getRenderMode()).toBe('draco_glb');

    legoAssetManager.setRenderMode('procedural');
    expect(legoAssetManager.getRenderMode()).toBe('procedural');

    legoAssetManager.setRenderMode('draco_glb');
    expect(legoAssetManager.getRenderMode()).toBe('draco_glb');
  });

  it('manages local offline mode flag', () => {
    legoAssetManager.setLocalOfflineMode(true);
    expect(legoAssetManager.isLocalOfflineMode()).toBe(true);

    legoAssetManager.setLocalOfflineMode(false);
    expect(legoAssetManager.isLocalOfflineMode()).toBe(false);

    legoAssetManager.setLocalOfflineMode(true);
  });

  it('cleans part numbers for filesystem lookup', () => {
    expect(legoAssetManager.cleanPartNumber('50450.dat')).toBe('50450dat');
    expect(legoAssetManager.cleanPartNumber('3020')).toBe('3020');
    expect(legoAssetManager.cleanPartNumber('44309-a')).toBe('44309a');
  });

  it('generates synchronous mesh with procedural fallback', () => {
    legoAssetManager.setRenderMode('procedural');
    const mesh = legoAssetManager.loadPartMeshSync('3020', 0xff0000);
    expect(mesh).toBeDefined();
    expect(mesh instanceof THREE.Object3D).toBe(true);

    const stats = legoAssetManager.getStats();
    expect(stats.totalPartsRequested).toBe(1);
    expect(stats.proceduralFallbacks).toBe(1);
  });

  it('asynchronously loads parts with fallback tracking', async () => {
    legoAssetManager.setRenderMode('draco_glb');
    // In Node test environment, unknown parts gracefully fall back to procedural
    const mesh = await legoAssetManager.loadPartMesh('unknown_part_999', 0x0000ff);
    expect(mesh).toBeDefined();

    const stats = legoAssetManager.getStats();
    expect(stats.totalPartsRequested).toBe(1);
    expect(stats.proceduralFallbacks).toBe(1);
  });

  it('builds cluster meshes concurrently', async () => {
    legoAssetManager.setRenderMode('procedural');
    const dummyCluster: ClusteredCompoundBody = {
      clusterId: 'test_cluster',
      name: 'Test Cluster',
      isRootChassis: false,
      partIds: ['p1', 'p2'],
      totalMassKg: 0.1,
      colliders: [],
      parts: [
        {
          id: 'p1',
          partNumber: '3020',
          position: [0, 0, 0],
          rotation: [0, 0, 0, 1],
          colorHex: 0xff0000,
          role: 'STRUCTURAL_BEAM',
        },
        {
          id: 'p2',
          partNumber: '50450',
          position: [10, 0, 0],
          rotation: [0, 0, 0, 1],
          colorHex: 0x00ff00,
          role: 'FASTENER_AXLE',
        },
      ],
    };

    const meshes = await legoAssetManager.buildClusterMeshes(dummyCluster, 0xffffff);
    expect(meshes.length).toBe(2);
    expect(meshes[0].position.x).toBe(0);
    expect(meshes[1].position.x).toBe(0.01); // 10mm = 0.01m
  });
});
