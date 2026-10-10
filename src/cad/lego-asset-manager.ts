// src/cad/lego-asset-manager.ts
// Centralized Asset Manager for LEGO 3D Models:
// Supports high-fidelity Draco-compressed .glb assets with zero-network local loading,
// and seamless fallback to built-in procedural geometry.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { createLegoBrickMesh, getLegoMaterial } from '../view/lego-visuals';
import { ClusteredCompoundBody, PlacedPart } from './types';

export type LegoRenderMode = 'draco_glb' | 'procedural';

export interface LegoEngineStats {
  mode: LegoRenderMode;
  localOffline: boolean;
  totalPartsRequested: number;
  dracoHits: number;
  proceduralFallbacks: number;
}

class LegoAssetManagerImpl {
  private renderMode: LegoRenderMode = 'draco_glb';
  private localOfflineMode: boolean = true;
  private gltfLoader: GLTFLoader;
  private dracoLoader: DRACOLoader;
  private partTemplateCache = new Map<string, THREE.Group>();
  private pendingLoads = new Map<string, Promise<THREE.Group | null>>();
  private knownUnavailableParts = new Set<string>();

  private stats: LegoEngineStats = {
    mode: 'draco_glb',
    localOffline: true,
    totalPartsRequested: 0,
    dracoHits: 0,
    proceduralFallbacks: 0,
  };

  constructor() {
    // 1. Read stored mode preferences
    try {
      const storedMode = localStorage.getItem('fll_lego_render_mode') as LegoRenderMode | null;
      if (storedMode === 'draco_glb' || storedMode === 'procedural') {
        this.renderMode = storedMode;
      }
      const storedOffline = localStorage.getItem('fll_local_offline_mode');
      if (storedOffline !== null) {
        this.localOfflineMode = storedOffline !== 'false';
      }
    } catch {
      // Ignore if localStorage unavailable
    }

    this.stats.mode = this.renderMode;
    this.stats.localOffline = this.localOfflineMode;

    // 2. Configure Three.js GLTFLoader with local Draco WASM decoder
    this.dracoLoader = new DRACOLoader();
    this.dracoLoader.setDecoderPath('/draco/');
    this.dracoLoader.setDecoderConfig({ type: 'wasm' });

    this.gltfLoader = new GLTFLoader();
    this.gltfLoader.setDRACOLoader(this.dracoLoader);
  }

  /** Current active mesh rendering mode */
  public getRenderMode(): LegoRenderMode {
    return this.renderMode;
  }

  /** Set rendering mode and persist */
  public setRenderMode(mode: LegoRenderMode): void {
    this.renderMode = mode;
    this.stats.mode = mode;
    try {
      localStorage.setItem('fll_lego_render_mode', mode);
      window.dispatchEvent(new CustomEvent('fll_render_mode_changed', { detail: { mode } }));
    } catch {
      // Ignore
    }
  }

  /** Local offline mode: serves all files directly without external HTTP calls */
  public isLocalOfflineMode(): boolean {
    return this.localOfflineMode;
  }

  public setLocalOfflineMode(enabled: boolean): void {
    this.localOfflineMode = enabled;
    this.stats.localOffline = enabled;
    try {
      localStorage.setItem('fll_local_offline_mode', enabled ? 'true' : 'false');
    } catch {
      // Ignore
    }
  }

  /** Clean part ID for asset lookups */
  public cleanPartNumber(partNumber: string): string {
    return partNumber
      .toLowerCase()
      .trim()
      .replace(/\.(dat|ldr|mpd|io)$/i, '')
      .replace(/^bl_/, '')
      .replace(/[^a-z0-9]/g, '');
  }

  /** Get runtime stats for CAD inspector & debugging */
  public getStats(): LegoEngineStats {
    return { ...this.stats };
  }

  /** Reset stats counter */
  public resetStats(): void {
    this.stats.totalPartsRequested = 0;
    this.stats.dracoHits = 0;
    this.stats.proceduralFallbacks = 0;
  }

  /**
   * Asynchronously load a LEGO piece using Draco GLB if available,
   * with seamless fallback to procedural geometry.
   */
  public async loadPartMesh(
    partNumber: string,
    colorHex: number,
    role?: string
  ): Promise<THREE.Object3D> {
    this.stats.totalPartsRequested++;

    // Procedural mode requested by user
    if (this.renderMode === 'procedural') {
      this.stats.proceduralFallbacks++;
      return createLegoBrickMesh(partNumber, colorHex, role);
    }

    const cleanId = this.cleanPartNumber(partNumber);

    // If known not available in local GLB library, fast fallback
    if (this.knownUnavailableParts.has(cleanId)) {
      this.stats.proceduralFallbacks++;
      return createLegoBrickMesh(partNumber, colorHex, role);
    }

    try {
      const template = await this.getTemplate(cleanId);
      if (template) {
        this.stats.dracoHits++;
        return this.instantiateTemplate(template, colorHex);
      }
    } catch {
      // Ignore error and fall through to procedural
    }

    this.knownUnavailableParts.add(cleanId);
    this.stats.proceduralFallbacks++;
    return createLegoBrickMesh(partNumber, colorHex, role);
  }

  /**
   * Synchronous load for instant rendering; returns cached Draco mesh if available,
   * otherwise procedural mesh.
   */
  public loadPartMeshSync(
    partNumber: string,
    colorHex: number,
    role?: string
  ): THREE.Object3D {
    this.stats.totalPartsRequested++;
    if (this.renderMode === 'draco_glb') {
      const cleanId = this.cleanPartNumber(partNumber);
      const cached = this.partTemplateCache.get(cleanId);
      if (cached) {
        this.stats.dracoHits++;
        return this.instantiateTemplate(cached, colorHex);
      }
    }
    this.stats.proceduralFallbacks++;
    return createLegoBrickMesh(partNumber, colorHex, role);
  }

  /**
   * Builds all 3D meshes for a cluster concurrently.
   */
  public async buildClusterMeshes(
    cluster: ClusteredCompoundBody,
    defaultColor: number
  ): Promise<THREE.Object3D[]> {
    if (!cluster.parts || cluster.parts.length === 0) {
      return [];
    }

    const promises = cluster.parts.map(async (part: PlacedPart) => {
      const pColor = part.colorHex ?? defaultColor;
      const mesh = await this.loadPartMesh(part.partNumber, pColor, part.role);
      mesh.position.set(part.position[0] / 1000, part.position[1] / 1000, part.position[2] / 1000);
      mesh.quaternion.set(part.rotation[0], part.rotation[1], part.rotation[2], part.rotation[3]);
      return mesh;
    });

    return Promise.all(promises);
  }

  /** Fetch or retrieve cached template */
  private async getTemplate(cleanId: string): Promise<THREE.Group | null> {
    if (this.partTemplateCache.has(cleanId)) {
      return this.partTemplateCache.get(cleanId)!;
    }

    if (this.pendingLoads.has(cleanId)) {
      return this.pendingLoads.get(cleanId)!;
    }

    const loadPromise = (async () => {
      try {
        const url = `/parts/draco/${cleanId}.glb`;
        const gltf = await this.gltfLoader.loadAsync(url);
        const group = gltf.scene as THREE.Group;
        this.partTemplateCache.set(cleanId, group);
        return group;
      } catch {
        this.knownUnavailableParts.add(cleanId);
        return null;
      } finally {
        this.pendingLoads.delete(cleanId);
      }
    })();

    this.pendingLoads.set(cleanId, loadPromise);
    return loadPromise;
  }

  /** Clone template and apply assigned LEGO color material */
  private instantiateTemplate(template: THREE.Group, colorHex: number): THREE.Group {
    const clone = template.clone(true);
    const mat = getLegoMaterial(colorHex);

    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.material = mat;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });

    return clone;
  }
}

export const legoAssetManager = new LegoAssetManagerImpl();
