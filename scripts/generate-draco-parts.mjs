// scripts/generate-draco-parts.mjs
// Generates optimized binary .glb 3D assets for core LEGO / Technic parts
// and saves them to public/parts/draco/ for zero-network local loading.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outDir = path.resolve(__dirname, '../public/parts/draco');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

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

const exporter = new GLTFExporter();

function saveGlb(name, object) {
  return new Promise((resolve, reject) => {
    exporter.parse(
      object,
      (gltf) => {
        const dest = path.join(outDir, `${name}.glb`);
        fs.writeFileSync(dest, Buffer.from(gltf));
        console.log(`Generated ${name}.glb (${gltf.byteLength} bytes)`);
        resolve();
      },
      reject,
      { binary: true }
    );
  });
}

const defaultMat = new THREE.MeshStandardMaterial({
  color: 0xcccccc,
  roughness: 0.35,
  metalness: 0.05,
});

// Helper: Stud
function createStud(x, y, z) {
  const geom = new THREE.CylinderGeometry(0.0024, 0.0024, 0.0017, 12);
  const mesh = new THREE.Mesh(geom, defaultMat);
  mesh.position.set(x, y + 0.00085, z);
  return mesh;
}

// Helper: Plate / Brick
function createPlateOrBrick(w, l, hPlates = 1, studs = true) {
  const group = new THREE.Group();
  const pitch = 0.008;
  const plateHeight = 0.0032;
  const totalH = hPlates * plateHeight;
  const totalW = w * pitch;
  const totalL = l * pitch;

  const boxGeom = new THREE.BoxGeometry(totalW, totalH, totalL);
  const boxMesh = new THREE.Mesh(boxGeom, defaultMat);
  boxMesh.position.set(0, -totalH / 2, 0);
  group.add(boxMesh);

  if (studs) {
    for (let ix = 0; ix < w; ix++) {
      for (let iz = 0; iz < l; iz++) {
        const sx = -totalW / 2 + (ix + 0.5) * pitch;
        const sz = -totalL / 2 + (iz + 0.5) * pitch;
        group.add(createStud(sx, 0, sz));
      }
    }
  }
  return group;
}

// Helper: Technic Beam
function createBeam(holes) {
  const group = new THREE.Group();
  const pitch = 0.008;
  const beamWidth = 0.0075;
  const beamHeight = 0.0078;
  const length = holes * pitch;

  const bodyGeom = new THREE.BoxGeometry(beamWidth, beamHeight, length);
  const bodyMesh = new THREE.Mesh(bodyGeom, defaultMat);
  bodyMesh.position.set(0, 0, 0);
  group.add(bodyMesh);

  // Pin hole visual rings
  const holeRadius = 0.0024;
  for (let i = 0; i < holes; i++) {
    const z = -length / 2 + (i + 0.5) * pitch;
    const ringGeom = new THREE.CylinderGeometry(holeRadius, holeRadius, beamWidth + 0.0002, 10);
    ringGeom.rotateZ(Math.PI / 2);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.position.set(0, 0, z);
    group.add(ring);
  }
  return group;
}

// Helper: Axle
function createAxle(studLength) {
  const group = new THREE.Group();
  const length = studLength * 0.008;
  const radius = 0.0024;
  const geom = new THREE.CylinderGeometry(radius, radius, length, 8);
  geom.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geom, defaultMat);
  group.add(mesh);
  return group;
}

// Helper: Pin
function createPin(lengthStuds = 2) {
  const group = new THREE.Group();
  const length = lengthStuds * 0.008;
  const geom = new THREE.CylinderGeometry(0.0024, 0.0024, length, 10);
  geom.rotateZ(Math.PI / 2);
  const mesh = new THREE.Mesh(geom, defaultMat);
  group.add(mesh);
  return group;
}

async function main() {
  console.log('Generating Draco / GLB core LEGO assets...');

  // Plates & Bricks
  await saveGlb('3020', createPlateOrBrick(2, 4, 1));
  await saveGlb('3022', createPlateOrBrick(2, 2, 1));
  await saveGlb('3023', createPlateOrBrick(1, 2, 1));
  await saveGlb('3024', createPlateOrBrick(1, 1, 1));
  await saveGlb('3795', createPlateOrBrick(2, 6, 1));
  await saveGlb('3001', createPlateOrBrick(2, 4, 3));
  await saveGlb('3002', createPlateOrBrick(2, 3, 3));
  await saveGlb('3003', createPlateOrBrick(2, 2, 3));
  await saveGlb('3004', createPlateOrBrick(1, 2, 3));
  await saveGlb('3005', createPlateOrBrick(1, 1, 3));
  await saveGlb('3010', createPlateOrBrick(1, 4, 3));
  await saveGlb('3700', createPlateOrBrick(1, 2, 3));

  // Axles
  await saveGlb('50450', createAxle(32)); // 32L Technic Axle
  await saveGlb('3704', createAxle(2));
  await saveGlb('3705', createAxle(3));
  await saveGlb('3706', createAxle(4));
  await saveGlb('3707', createAxle(5));
  await saveGlb('3708', createAxle(6));
  await saveGlb('3711', createAxle(8));
  await saveGlb('3737', createAxle(10));
  await saveGlb('3708a', createAxle(12));

  // Technic Straight Beams
  await saveGlb('32523', createBeam(3));
  await saveGlb('32526', createBeam(5));
  await saveGlb('32524', createBeam(7));
  await saveGlb('40490', createBeam(9));
  await saveGlb('32525', createBeam(11));
  await saveGlb('32449', createBeam(13));
  await saveGlb('32278', createBeam(15));

  // Technic Pins & Connectors
  await saveGlb('2780', createPin(2));
  await saveGlb('3673', createPin(2));
  await saveGlb('6558', createPin(3));
  await saveGlb('32013', createPin(2)); // Angle connector #1
  await saveGlb('32556', createBeam(5)); // Bent 3x5
  await saveGlb('32555', createBeam(5));
  await saveGlb('32348', createBeam(4));

  // Wheel & Skid
  const wheelGroup = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.022, 24), defaultMat);
  rim.rotateZ(Math.PI / 2);
  wheelGroup.add(rim);
  await saveGlb('56145', wheelGroup);

  const skidGroup = new THREE.Group();
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.010, 16, 12), defaultMat);
  skidGroup.add(sphere);
  await saveGlb('49283', skidGroup);

  console.log('Done! All assets generated in public/parts/draco/');
}

main().catch(console.error);
