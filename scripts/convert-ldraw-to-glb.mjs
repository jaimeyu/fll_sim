// scripts/convert-ldraw-to-glb.mjs
// Converts authentic LDraw .dat part files into Draco-compatible .glb binary 3D meshes.
// Accurately scales from LDraw LDU units (1 LDU = 0.4mm) to simulator meters (0.0004m),
// inverts Y and Z axes to match Three.js coordinate conventions, and resolves all Studio dependencies.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';
import * as THREE from 'three';
import { LDrawLoader } from 'three/examples/jsm/loaders/LDrawLoader.js';
import { LDrawConditionalLineMaterial } from 'three/examples/jsm/materials/LDrawConditionalLineMaterial.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Polyfill FileReader for Node
globalThis.FileReader = class FileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      if (this.onloadend) this.onloadend();
      if (this.onload) this.onload();
    });
  }
};

async function main() {
  const baseDir = path.resolve(__dirname, '../public/ldraw');
  const outDir = path.resolve(__dirname, '../public/parts/draco');
  const missionsDir = path.resolve(__dirname, '../public/missions');
  fs.mkdirSync(outDir, { recursive: true });

  const studioBase = '/Applications/Studio 2.0/ldraw';
  const searchDirs = [
    path.join(baseDir, 'parts'),
    path.join(baseDir, 'p'),
    path.join(baseDir, 'parts/s'),
    path.join(baseDir, 'p/48'),
    path.join(baseDir, 'p/8'),
    baseDir,
    path.join(studioBase, 'parts'),
    path.join(studioBase, 'p'),
    path.join(studioBase, 'parts/s'),
    path.join(studioBase, 'p/48'),
    path.join(studioBase, 'p/8'),
    path.join(studioBase, 'UnOfficial/parts'),
    path.join(studioBase, 'UnOfficial/parts/s'),
    path.join(studioBase, 'UnOfficial/p'),
    path.join(studioBase, 'LEGO'),
  ].filter(d => fs.existsSync(d));

  const loader = new LDrawLoader();
  loader.setConditionalLineMaterial(LDrawConditionalLineMaterial);

  // 1. Gather all embedded subfiles from all mission .io archives
  const embeddedFiles = new Map();
  const ioFiles = fs.readdirSync(missionsDir).filter((f) => f.endsWith('.io'));

  for (const ioFile of ioFiles) {
    try {
      const buffer = fs.readFileSync(path.join(missionsDir, ioFile));
      const zip = await JSZip.loadAsync(buffer);
      const model2Text = (await zip.file('model2.ldr')?.async('string')) || '';
      for (const block of model2Text.split(/^0 FILE /m)) {
        const lines = block.split(/\r?\n/);
        const fname = lines[0].trim().toLowerCase();
        const content = lines.slice(1).join('\n');
        if (fname) embeddedFiles.set(fname, content);
      }
    } catch {
      // Ignore
    }
  }

  console.log(`Loaded ${embeddedFiles.size} embedded part definitions from mission archives.`);

  // Custom file loader reading from embedded parts, public/ldraw, and Studio 2.0
  loader.partsCache.parseCache.fetchData = async (fileName) => {
    const fn = fileName.toLowerCase().replace(/\\/g, '/');
    const base = path.basename(fn);
    if (embeddedFiles.has(fn)) return embeddedFiles.get(fn);
    if (embeddedFiles.has(base)) return embeddedFiles.get(base);
    if (embeddedFiles.has('bl_' + base)) return embeddedFiles.get('bl_' + base);

    for (const d of searchDirs) {
      const cand = path.join(d, fn);
      if (fs.existsSync(cand)) return fs.readFileSync(cand, 'utf-8');
      const candBase = path.join(d, base);
      if (fs.existsSync(candBase)) return fs.readFileSync(candBase, 'utf-8');
    }
    throw new Error('Not found: ' + fileName);
  };

  // 2. Collect all unique part numbers across all missions
  const partNumbers = new Set();
  for (const ioFile of ioFiles) {
    try {
      const buffer = fs.readFileSync(path.join(missionsDir, ioFile));
      const zip = await JSZip.loadAsync(buffer);
      const ldrText = (await zip.file('model.ldr')?.async('string')) || '';
      for (const line of ldrText.split(/\r?\n/)) {
        if (line.startsWith('1 ')) {
          const toks = line.trim().split(/\s+/);
          if (toks.length >= 15) {
            const ref = toks[14].toLowerCase().replace(/\.(ldr|mpd|dat)$/, '').replace(/^bl_/, '');
            if (!ref.startsWith('submodel') && !ref.startsWith('model') && !ref.startsWith('__flexible')) {
              partNumbers.add(ref);
            }
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  console.log(`Found ${partNumbers.size} unique top-level parts across all missions to convert.`);

  const exporter = new GLTFExporter();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xcccccc,
    roughness: 0.35,
    metalness: 0.05,
  });

  let successCount = 0;
  let skippedCount = 0;
  let failCount = 0;

  for (const p of partNumbers) {
    const cleanName = p.toLowerCase().replace(/[^a-z0-9]/g, '');
    const outPath = path.join(outDir, `${cleanName}.glb`);

    try {
      let content = null;
      const fn = `${p}.dat`;
      if (embeddedFiles.has(fn)) content = embeddedFiles.get(fn);
      else if (embeddedFiles.has(p)) content = embeddedFiles.get(p);
      else {
        for (const d of searchDirs) {
          const cand = path.join(d, fn);
          if (fs.existsSync(cand)) {
            content = fs.readFileSync(cand, 'utf-8');
            break;
          }
        }
      }

      if (!content) {
        failCount++;
        console.warn(`[SKIP] Missing source content for part: ${p}`);
        continue;
      }

      const group = await new Promise((resolve, reject) => {
        loader.parse(content, resolve, reject);
      });

      const exportGroup = new THREE.Group();
      group.updateMatrixWorld(true);

      group.traverse((c) => {
        if (c.isMesh) {
          const geom = c.geometry.clone();
          // 1. Bake world transform of subparts/primitives relative to root group
          geom.applyMatrix4(c.matrixWorld);
          // 2. Scale from LDU (1 LDU = 0.4mm = 0.0004m) to simulator meters,
          //    and invert Y and Z axes (LDraw Y-down/Z-forward -> Three.js Y-up/Z-backward)
          geom.scale(0.0004, -0.0004, -0.0004);
          // 3. Compute outward-facing vertex normals
          geom.computeVertexNormals();

          const mesh = new THREE.Mesh(geom, mat);
          exportGroup.add(mesh);
        }
      });

      if (exportGroup.children.length === 0) {
        failCount++;
        continue;
      }

      const gltf = await new Promise((resolve, reject) => {
        exporter.parse(exportGroup, resolve, reject, { binary: true });
      });

      fs.writeFileSync(outPath, Buffer.from(gltf));
      successCount++;
      if (successCount % 25 === 0 || successCount === partNumbers.size) {
        console.log(`[${successCount}/${partNumbers.size}] Converted ${p} -> ${cleanName}.glb (${gltf.byteLength} bytes)`);
      }
    } catch (e) {
      failCount++;
      console.warn(`[ERROR] Failed to convert ${p}: ${e.message}`);
    }
  }

  console.log(`Done! Successfully converted ${successCount} authentic parts into public/parts/draco/ (Failed: ${failCount})`);
}

main().catch(console.error);
