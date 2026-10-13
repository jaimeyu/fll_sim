// src/core/performance-profiler.ts
// Real-time Frame Profiler & Render Performance Diagnostic Analyzer

import { legoAssetManager } from '../cad/lego-asset-manager';

export interface RenderStats {
  drawCalls: number;
  triangles: number;
  points: number;
  lines: number;
  geometries: number;
  textures: number;
}

export interface PhysicsStats {
  totalBodies: number;
  dynamicBodies: number;
  fixedBodies: number;
  colliders: number;
}

export interface ProfilerFrameMetrics {
  totalFrameMs: number;
  physicsMs: number;
  syncMs: number;
  renderMs: number;
  sensorsMs: number;
  otherMs: number;
}

export interface ProfilerSnapshot {
  fps: number;
  targetFps: number;
  avgFps: number;
  minFps: number;
  onePercentLowFps: number;
  frameBudgetMs: number; // 8.33ms for 120Hz, 16.67ms for 60Hz
  avgFrameMs: number;
  physicsMs: number;
  physicsPct: number;
  syncMs: number;
  syncPct: number;
  renderMs: number;
  renderPct: number;
  sensorsMs: number;
  sensorsPct: number;
  idleMs: number;
  idlePct: number;
  renderStats: RenderStats;
  physicsStats: PhysicsStats;
  primaryBottleneck: string;
  bottleneckSeverity: 'OPTIMAL' | 'MODERATE' | 'BOTTLENECK';
  recommendations: string[];
}

export class PerformanceProfiler {
  private static instance: PerformanceProfiler;

  private readonly BUFFER_SIZE = 60;
  private frameTimes: number[] = [];
  private physicsTimes: number[] = [];
  private syncTimes: number[] = [];
  private renderTimes: number[] = [];
  private sensorsTimes: number[] = [];
  private lastFrameTimestamp = 0;

  private latestRenderStats: RenderStats = {
    drawCalls: 0,
    triangles: 0,
    points: 0,
    lines: 0,
    geometries: 0,
    textures: 0,
  };

  private latestPhysicsStats: PhysicsStats = {
    totalBodies: 0,
    dynamicBodies: 0,
    fixedBodies: 0,
    colliders: 0,
  };

  public static getInstance(): PerformanceProfiler {
    if (!PerformanceProfiler.instance) {
      PerformanceProfiler.instance = new PerformanceProfiler();
    }
    return PerformanceProfiler.instance;
  }

  public startFrame(now: number): void {
    if (this.lastFrameTimestamp > 0) {
      const dt = now - this.lastFrameTimestamp;
      this.pushToBuffer(this.frameTimes, dt);
    }
    this.lastFrameTimestamp = now;
  }

  public recordPhysicsTime(ms: number): void {
    this.pushToBuffer(this.physicsTimes, ms);
  }

  public recordSyncTime(ms: number): void {
    this.pushToBuffer(this.syncTimes, ms);
  }

  public recordRenderTime(ms: number): void {
    this.pushToBuffer(this.renderTimes, ms);
  }

  public recordSensorsTime(ms: number): void {
    this.pushToBuffer(this.sensorsTimes, ms);
  }

  public setRenderStats(stats: Partial<RenderStats>): void {
    this.latestRenderStats = {
      ...this.latestRenderStats,
      ...stats,
    };
  }

  public setPhysicsStats(stats: Partial<PhysicsStats>): void {
    this.latestPhysicsStats = {
      ...this.latestPhysicsStats,
      ...stats,
    };
  }

  private pushToBuffer(arr: number[], val: number): void {
    arr.push(val);
    if (arr.length > this.BUFFER_SIZE) {
      arr.shift();
    }
  }

  private average(arr: number[]): number {
    if (!arr.length) return 0;
    const sum = arr.reduce((acc, v) => acc + v, 0);
    return sum / arr.length;
  }

  public getCurrentFps(): number {
    if (this.frameTimes.length === 0) return 60;
    const avgDt = this.average(this.frameTimes);
    if (avgDt <= 0) return 60;
    return Math.min(240, Math.round(1000 / avgDt));
  }

  public getSnapshot(): ProfilerSnapshot {
    const currentFps = this.getCurrentFps();
    // Dynamically detect display refresh rate target (e.g. 120Hz ProMotion vs standard 60Hz)
    const targetFps = currentFps > 85 ? 120 : (currentFps > 70 ? 90 : 60);
    const frameBudgetMs = Number((1000 / targetFps).toFixed(3));
    const avgFrameMs = this.average(this.frameTimes) || frameBudgetMs;

    // 1% Low FPS calculation
    const sortedDts = [...this.frameTimes].sort((a, b) => b - a); // highest dt = lowest fps
    const onePercentIndex = Math.floor(sortedDts.length * 0.05);
    const worstDt = sortedDts[onePercentIndex] || avgFrameMs;
    const onePercentLowFps = Math.max(1, Math.round(1000 / Math.max(1, worstDt)));

    const minDt = sortedDts[0] || avgFrameMs;
    const minFps = Math.max(1, Math.round(1000 / Math.max(1, minDt)));

    const avgPhysics = Math.max(0, this.average(this.physicsTimes));
    const avgSync = Math.max(0, this.average(this.syncTimes));
    const avgRender = Math.max(0, this.average(this.renderTimes));
    const avgSensors = Math.max(0, this.average(this.sensorsTimes));

    const totalActiveMs = avgPhysics + avgSync + avgRender + avgSensors;
    const idleMs = Math.max(0, avgFrameMs - totalActiveMs);

    const safeFrameMs = Math.max(0.1, avgFrameMs);
    const physicsPct = Math.min(100, (avgPhysics / safeFrameMs) * 100);
    const syncPct = Math.min(100, (avgSync / safeFrameMs) * 100);
    const renderPct = Math.min(100, (avgRender / safeFrameMs) * 100);
    const sensorsPct = Math.min(100, (avgSensors / safeFrameMs) * 100);
    const idlePct = Math.max(0, 100 - (physicsPct + syncPct + renderPct + sensorsPct));

    // Determine primary bottleneck relative to target frame budget
    let primaryBottleneck = 'Balanced Frame Budget';
    let bottleneckSeverity: 'OPTIMAL' | 'MODERATE' | 'BOTTLENECK' = 'OPTIMAL';
    const recommendations: string[] = [];

    const isFpsDropping = currentFps < (targetFps - 5);
    const isFpsCritical = currentFps <= Math.round(targetFps * 0.75);

    if (avgRender >= avgPhysics && avgRender >= avgSync && avgRender > (frameBudgetMs * 0.35)) {
      primaryBottleneck = `Three.js WebGL Render (${avgRender.toFixed(1)}ms, ${renderPct.toFixed(0)}% of frame)`;
    } else if (avgPhysics >= avgRender && avgPhysics >= avgSync && avgPhysics > (frameBudgetMs * 0.25)) {
      primaryBottleneck = `Rapier 3D Physics Solver (${avgPhysics.toFixed(1)}ms, ${physicsPct.toFixed(0)}% of frame)`;
    } else if (avgSync > (frameBudgetMs * 0.2)) {
      primaryBottleneck = `Visual Transform Sync (${avgSync.toFixed(1)}ms, ${syncPct.toFixed(0)}% of frame)`;
    } else if (isFpsDropping) {
      primaryBottleneck = `System Throttling / Background Overhead (${avgFrameMs.toFixed(1)}ms frame time)`;
    }

    if (isFpsCritical) {
      bottleneckSeverity = 'BOTTLENECK';
    } else if (isFpsDropping) {
      bottleneckSeverity = 'MODERATE';
    } else {
      bottleneckSeverity = 'OPTIMAL';
    }

    // Dynamic recommendations
    const isRenderHeavy = avgRender > (frameBudgetMs * 0.5) || isFpsDropping;
    const isDracoActive =
      typeof legoAssetManager !== 'undefined' &&
      typeof legoAssetManager.getRenderMode === 'function' &&
      legoAssetManager.getRenderMode() === 'draco_glb';

    if (this.latestRenderStats.drawCalls > 1000 || (isRenderHeavy && this.latestRenderStats.drawCalls > 150)) {
      recommendations.push(
        `High Draw Calls (${this.latestRenderStats.drawCalls}): Merging static LEGO assemblies into shared geometries can significantly reduce CPU-GPU command overhead.`
      );
    }

    if (this.latestRenderStats.triangles > 80000 && isRenderHeavy) {
      if (isDracoActive) {
        recommendations.push(
          `Heavy Geometry (${this.latestRenderStats.triangles.toLocaleString()} polygons): Draco GLB compression is active, but high polygon density may be straining GPU rasterization.`
        );
      } else {
        recommendations.push(
          `Heavy Geometry (${this.latestRenderStats.triangles.toLocaleString()} polygons): Ensure Draco compressed assets are enabled in Settings to stream lightweight meshes.`
        );
      }
    }

    if (this.latestPhysicsStats.dynamicBodies > 15 && (avgPhysics > 4.0 || isFpsDropping)) {
      recommendations.push(
        `Many Dynamic Physics Bodies (${this.latestPhysicsStats.dynamicBodies} active): Use the 📌 Dual Lock tool to anchor non-sliding station bases to the mat, turning them into fixed bodies.`
      );
    }

    if (avgSensors > 2.5 && isFpsDropping) {
      recommendations.push(
        `Color Sensor Readback: Sensor sampling reads pixels from the field mat canvas. Procedural or downscaled textures improve read throughput.`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push(
        `Frame budget is optimal. The simulation runs smoothly at ${targetFps} FPS with healthy CPU/GPU headroom.`
      );
    }

    return {
      fps: currentFps,
      targetFps,
      avgFps: currentFps,
      minFps,
      onePercentLowFps,
      frameBudgetMs,
      avgFrameMs,
      physicsMs: avgPhysics,
      physicsPct,
      syncMs: avgSync,
      syncPct,
      renderMs: avgRender,
      renderPct,
      sensorsMs: avgSensors,
      sensorsPct,
      idleMs,
      idlePct,
      renderStats: { ...this.latestRenderStats },
      physicsStats: { ...this.latestPhysicsStats },
      primaryBottleneck,
      bottleneckSeverity,
      recommendations,
    };
  }

  public reset(): void {
    this.frameTimes = [];
    this.physicsTimes = [];
    this.syncTimes = [];
    this.renderTimes = [];
    this.sensorsTimes = [];
  }
}

export const profiler = PerformanceProfiler.getInstance();
