import * as THREE from 'three';
import { MatColorSampler } from '../sensors/sensor-manager';

export type MatMapType = 'numbered' | 'grid' | 'procedural';

export class CompetitionMatTexture implements MatColorSampler {
  public canvas: HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D;
  public texture: THREE.CanvasTexture;

  // Real world dimensions (meters): 2.40m x 1.40m (matches official FLL mat aspect ratio)
  public worldLength = 2.40;
  public worldWidth = 1.40;

  private canvasWidth = 2048;
  private canvasHeight = 1024;
  private pixelData: Uint8ClampedArray | null = null;
  public currentMap: MatMapType = 'numbered';

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvasWidth;
    this.canvas.height = this.canvasHeight;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;

    // Initial procedural render so canvas is valid immediately
    this.drawCompetitionMat();
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.anisotropy = 8;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;

    // Cache image data for fast CPU sensor sampling
    this.cacheImageData();

    // Default to the official BioGlow numbered competition map
    this.loadMap('numbered').catch(() => {});
  }

  /**
   * Switches active competition mat between numbered field mat, grid image, and procedural canvas
   */
  public async loadMap(mapType: MatMapType): Promise<void> {
    this.currentMap = mapType;
    if (mapType === 'procedural') {
      this.drawCompetitionMat();
      this.cacheImageData();
      this.texture.needsUpdate = true;
      return;
    }

    // In environments without Image constructor (e.g. Node tests), remain procedural
    if (typeof Image === 'undefined') {
      this.drawCompetitionMat();
      this.cacheImageData();
      return;
    }

    const src = mapType === 'numbered'
      ? '/maps/bioglow_numbered_mat.png'
      : '/maps/playing_field_grid.png';

    return new Promise<void>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
        this.ctx.drawImage(img, 0, 0, this.canvasWidth, this.canvasHeight);
        this.cacheImageData();
        this.texture.needsUpdate = true;
        resolve();
      };
      img.onerror = () => {
        // Fallback to procedural if image fails to load
        this.drawCompetitionMat();
        this.cacheImageData();
        this.texture.needsUpdate = true;
        resolve();
      };
      img.src = src;
    });
  }

  private cacheImageData(): void {
    const imgData = this.ctx.getImageData(0, 0, this.canvasWidth, this.canvasHeight);
    this.pixelData = imgData.data;
  }

  /**
   * Draws a competition-ready FLL mat texture with launch area, lines, and target zones
   */
  public drawCompetitionMat(): void {
    const ctx = this.ctx;
    const w = this.canvasWidth;
    const h = this.canvasHeight;

    // 1. Base Vinyl Canvas (light off-white matte)
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, w, h);

    // 2. Subtle Grid Marks
    ctx.strokeStyle = '#e9ecef';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // 3. Launch Area (Home Zone) at Bottom-Left (West/South)
    // In FLL, Launch Area is a designated quarter or rectangle marked by thick lines
    const launchW = w * 0.28;
    const launchH = h * 0.45;
    ctx.fillStyle = 'rgba(230, 240, 255, 0.5)';
    ctx.fillRect(20, h - launchH - 20, launchW, launchH);

    ctx.strokeStyle = '#1e3a8a';
    ctx.lineWidth = 6;
    ctx.strokeRect(20, h - launchH - 20, launchW, launchH);

    ctx.fillStyle = '#1e3a8a';
    ctx.font = 'bold 24px monospace';
    ctx.fillText('HOME / LAUNCH AREA', 40, h - launchH + 30);

    // 4. Mission Target Zones (Colored rings & boxes)
    // Red Mission Zone
    ctx.fillStyle = 'rgba(239, 68, 68, 0.85)';
    ctx.beginPath();
    ctx.arc(w * 0.55, h * 0.35, 75, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#991b1b';
    ctx.lineWidth = 5;
    ctx.stroke();

    // Green Mission Zone
    ctx.fillStyle = 'rgba(34, 197, 94, 0.85)';
    ctx.beginPath();
    ctx.arc(w * 0.8, h * 0.7, 85, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#166534';
    ctx.lineWidth = 5;
    ctx.stroke();

    // Blue Mission Box
    ctx.fillStyle = 'rgba(59, 130, 246, 0.85)';
    ctx.fillRect(w * 0.75 - 75, h * 0.25 - 60, 150, 120);
    ctx.strokeStyle = '#1e40af';
    ctx.lineWidth = 5;
    ctx.strokeRect(w * 0.75 - 75, h * 0.25 - 60, 150, 120);

    // Yellow Caution Zone
    ctx.fillStyle = 'rgba(234, 179, 8, 0.85)';
    ctx.fillRect(w * 0.4 - 60, h * 0.65 - 60, 120, 120);
    ctx.strokeStyle = '#854d0e';
    ctx.lineWidth = 5;
    ctx.strokeRect(w * 0.4 - 60, h * 0.65 - 60, 120, 120);

    // 5. Main FLL Navigation Lines (Crisp 25mm black lines for line-following)
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 22; // ~25mm line width on 2048px canvas
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Main Track Loop
    ctx.beginPath();
    // Line 1: Exit from Launch Area heading East
    ctx.moveTo(launchW + 20, h - launchH * 0.5 - 20);
    ctx.lineTo(w * 0.5, h - launchH * 0.5 - 20);
    // Smooth turn towards North-East
    ctx.lineTo(w * 0.65, h * 0.5);
    ctx.lineTo(w * 0.8, h * 0.5);
    // Up to Blue zone
    ctx.lineTo(w * 0.8, h * 0.25);
    // Across top towards West
    ctx.lineTo(w * 0.35, h * 0.25);
    // Down to yellow zone
    ctx.lineTo(w * 0.35, h * 0.55);
    // T-junction line
    ctx.stroke();

    // Secondary Cross Line (for squaring off)
    ctx.beginPath();
    ctx.moveTo(w * 0.48, h * 0.15);
    ctx.lineTo(w * 0.48, h * 0.85);
    ctx.stroke();

    // Perimeter boundary border
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, w - 8, h - 8);
  }

  /**
   * Sample RGB at world coordinates (worldX: -halfL to +halfL, worldZ: -halfW to +halfW)
   */
  public sampleAt(worldX: number, worldZ: number): { r: number; g: number; b: number } {
    if (!this.pixelData) {
      return { r: 255, g: 255, b: 255 };
    }

    const halfL = this.worldLength / 2;
    const halfW = this.worldWidth / 2;

    // Normalize coordinates to 0..1 UV
    const u = (worldX + halfL) / this.worldLength;
    const v = (worldZ + halfW) / this.worldWidth;

    if (u < 0 || u > 1 || v < 0 || v > 1) {
      return { r: 245, g: 245, b: 245 };
    }

    const px = Math.min(this.canvasWidth - 1, Math.max(0, Math.floor(u * this.canvasWidth)));
    const py = Math.min(this.canvasHeight - 1, Math.max(0, Math.floor(v * this.canvasHeight)));

    const idx = (py * this.canvasWidth + px) * 4;
    return {
      r: this.pixelData[idx],
      g: this.pixelData[idx + 1],
      b: this.pixelData[idx + 2],
    };
  }
}
