import { describe, it, expect, beforeEach } from 'vitest';
import { PerformanceProfiler } from './performance-profiler';
import { resolveAssetUrl } from '../utils/asset-path';

describe('Asset Path Resolver & Performance Profiler', () => {
  describe('resolveAssetUrl', () => {
    it('cleans relative paths and prepends base URL accurately', () => {
      const url = resolveAssetUrl('/missions/M01.io');
      expect(url).toContain('missions/M01.io');
      expect(url).not.toContain('//missions');
    });

    it('resolves draco decoder path with trailing slash intact', () => {
      const url = resolveAssetUrl('draco/');
      expect(url).toContain('draco/');
    });

    it('resolves individual draco part glb mesh files', () => {
      const url = resolveAssetUrl('parts/draco/3001.glb');
      expect(url).toContain('parts/draco/3001.glb');
    });
  });

  describe('PerformanceProfiler', () => {
    let profiler: PerformanceProfiler;

    beforeEach(() => {
      profiler = new PerformanceProfiler();
      profiler.reset();
    });

    it('calculates 60 FPS and 16.6ms budget accurately under healthy frames', () => {
      let time = 1000;
      for (let i = 0; i < 60; i++) {
        time += 16.66;
        profiler.startFrame(time);
        profiler.recordPhysicsTime(3.5);
        profiler.recordSyncTime(1.5);
        profiler.recordRenderTime(6.0);
        profiler.recordSensorsTime(0.5);
      }

      const snapshot = profiler.getSnapshot();
      expect(snapshot.fps).toBeGreaterThanOrEqual(58);
      expect(snapshot.fps).toBeLessThanOrEqual(62);
      expect(snapshot.bottleneckSeverity).toBe('OPTIMAL');
      expect(snapshot.physicsMs).toBeCloseTo(3.5, 1);
      expect(snapshot.renderMs).toBeCloseTo(6.0, 1);
      expect(snapshot.syncMs).toBeCloseTo(1.5, 1);
      expect(snapshot.sensorsMs).toBeCloseTo(0.5, 1);
      expect(snapshot.idleMs).toBeGreaterThan(0);
    });

    it('identifies GPU / Three.js Render as primary bottleneck when render time is high', () => {
      let time = 1000;
      for (let i = 0; i < 60; i++) {
        time += 25.0; // 40 FPS
        profiler.startFrame(time);
        profiler.recordPhysicsTime(2.0);
        profiler.recordSyncTime(1.0);
        profiler.recordRenderTime(18.0); // Heavy render
        profiler.recordSensorsTime(0.5);
      }

      profiler.setRenderStats({
        drawCalls: 180,
        triangles: 120000,
        geometries: 200,
        textures: 5,
      });

      const snapshot = profiler.getSnapshot();
      expect(snapshot.fps).toBeLessThan(50);
      expect(snapshot.primaryBottleneck).toContain('Three.js WebGL Render');
      expect(snapshot.bottleneckSeverity).toBe('BOTTLENECK');
      expect(snapshot.recommendations.some((r) => r.includes('Draw Calls'))).toBe(true);
      expect(snapshot.recommendations.some((r) => r.includes('Draco'))).toBe(true);
    });

    it('identifies Rapier Physics as bottleneck when solver load is dominant', () => {
      let time = 1000;
      for (let i = 0; i < 60; i++) {
        time += 28.0; // ~35 FPS
        profiler.startFrame(time);
        profiler.recordPhysicsTime(19.0); // Heavy physics
        profiler.recordSyncTime(2.0);
        profiler.recordRenderTime(4.0);
        profiler.recordSensorsTime(0.5);
      }

      profiler.setPhysicsStats({
        totalBodies: 40,
        dynamicBodies: 25,
        fixedBodies: 15,
        colliders: 80,
      });

      const snapshot = profiler.getSnapshot();
      expect(snapshot.primaryBottleneck).toContain('Rapier 3D Physics');
      expect(snapshot.recommendations.some((r) => r.includes('Dual Lock'))).toBe(true);
    });
  });
});
