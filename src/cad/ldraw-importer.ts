import JSZip from 'jszip';
import { PlacedPart, ConnectionLink } from './types';
import { lookupPartRole } from './part-catalog';
import { CadClusteringPreSolver } from './clustering-solver';
import { RobotAssemblySpec } from './types';
import { LDRAW_COLOR_MAP } from '../view/lego-visuals';

export interface ParsedLDrawModel {
  name: string;
  parts: PlacedPart[];
  links: ConnectionLink[];
}

type Mat3 = [number, number, number, number, number, number, number, number, number];
type Vec3 = [number, number, number];

/** Multiply two 3x3 matrices in row-major order: C = A * B */
function mat3Mul(A: Mat3, B: Mat3): Mat3 {
  return [
    A[0] * B[0] + A[1] * B[3] + A[2] * B[6],
    A[0] * B[1] + A[1] * B[4] + A[2] * B[7],
    A[0] * B[2] + A[1] * B[5] + A[2] * B[8],

    A[3] * B[0] + A[4] * B[3] + A[5] * B[6],
    A[3] * B[1] + A[4] * B[4] + A[5] * B[7],
    A[3] * B[2] + A[4] * B[5] + A[5] * B[8],

    A[6] * B[0] + A[7] * B[3] + A[8] * B[6],
    A[6] * B[1] + A[7] * B[4] + A[8] * B[7],
    A[6] * B[2] + A[7] * B[5] + A[8] * B[8],
  ];
}

/** Multiply a 3x3 matrix by a 3D vector: v' = A * v */
function mat3VecMul(A: Mat3, v: Vec3): Vec3 {
  return [
    A[0] * v[0] + A[1] * v[1] + A[2] * v[2],
    A[3] * v[0] + A[4] * v[1] + A[5] * v[2],
    A[6] * v[0] + A[7] * v[1] + A[8] * v[2],
  ];
}

/**
 * Extracts a normalized [qx, qy, qz, qw] unit quaternion from an LDraw 3x3 rotation matrix.
 * Accounts for coordinate system differences (LDraw Y-down vs Simulator Y-up).
 */
function matrixToQuaternion(M: Mat3): [number, number, number, number] {
  // Proper 3D rotation transform from LDraw (Y-down, Z-forward) to Three.js (Y-up, Z-backward):
  // R = diag(1, -1, -1), M_sim = R * M * R
  const m00 = M[0],  m01 = -M[1], m02 = -M[2];
  const m10 = -M[3], m11 = M[4],  m12 = M[5];
  const m20 = -M[6], m21 = M[7],  m22 = M[8];

  const trace = m00 + m11 + m22;
  let qx = 0, qy = 0, qz = 0, qw = 1;

  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1.0);
    qw = 0.25 / s;
    qx = (m21 - m12) * s;
    qy = (m02 - m20) * s;
    qz = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2.0 * Math.sqrt(1.0 + m00 - m11 - m22);
    qw = (m21 - m12) / s;
    qx = 0.25 * s;
    qy = (m01 + m10) / s;
    qz = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2.0 * Math.sqrt(1.0 + m11 - m00 - m22);
    qw = (m02 - m20) / s;
    qx = (m01 + m10) / s;
    qy = 0.25 * s;
    qz = (m12 + m21) / s;
  } else {
    const s = 2.0 * Math.sqrt(1.0 + m22 - m00 - m11);
    qw = (m10 - m01) / s;
    qx = (m02 + m20) / s;
    qy = (m12 + m21) / s;
    qz = 0.25 * s;
  }

  const len = Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw);
  if (len > 0.00001) {
    return [qx / len, qy / len, qz / len, qw / len];
  }
  return [0, 0, 0, 1];
}

export class LDrawImporter {
  /**
   * Parses raw LDraw text (.ldr / .mpd) into placed parts, recursively
   * expanding multi-part document (MPD) submodel hierarchies and applying
   * 3D transformation matrices.
   */
  public static parseLDrawText(text: string, modelName = 'Imported LDraw Robot'): ParsedLDrawModel {
    // 1. Index all submodels in the document (0 FILE <name>)
    const cleanText = text.replace(/^\uFEFF/, '').trim();
    const submodels = new Map<string, string[]>();
    const fileChunks = cleanText.split(/(?:^|\r?\n)0\s+FILE\s+/i).filter(Boolean);
    let primaryEntryName = '';

    if (fileChunks.length > 0 && cleanText.toUpperCase().includes('0 FILE')) {
      for (let i = 0; i < fileChunks.length; i++) {
        const chunk = fileChunks[i];
        const lines = chunk.split(/\r?\n/);
        if (!lines.length) continue;

        const name = lines[0].trim().toLowerCase();
        if (!name) continue;
        if (!primaryEntryName) primaryEntryName = name;

        const normKey = name.replace(/\.(ldr|mpd|dat|io)$/, '');
        submodels.set(normKey, lines.slice(1));
        submodels.set(name, lines.slice(1));
      }
    } else {
      // Single flat file
      const lines = cleanText.split(/\r?\n/);
      submodels.set('main', lines);
      primaryEntryName = 'main';
    }

    // Match preferred entrypoint if available
    const normModelName = modelName.trim().toLowerCase().replace(/\.(ldr|mpd|io|dat)$/, '');
    if (submodels.has(normModelName)) {
      primaryEntryName = normModelName;
    } else if (submodels.has(modelName.toLowerCase())) {
      primaryEntryName = modelName.toLowerCase();
    } else if (!submodels.has(primaryEntryName)) {
      primaryEntryName = submodels.keys().next().value || 'main';
    }

    const parts: PlacedPart[] = [];
    const links: ConnectionLink[] = [];
    let partIndex = 0;

    // 2. Recursively expand submodels accumulating transformation matrices
    let instanceCounter = 0;
    const expandSubmodel = (
      subName: string,
      instanceId: string,
      parentMat: Mat3,
      parentTrans: Vec3,
      parentColorCode: number,
      depth: number,
      visited: Set<string>
    ) => {
      if (depth > 25) return;
      const lines = submodels.get(subName) || [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('1 ')) continue;

        const tokens = trimmed.split(/\s+/);
        if (tokens.length < 15) continue;

        const tx = parseFloat(tokens[2]);
        const ty = parseFloat(tokens[3]);
        const tz = parseFloat(tokens[4]);

        const localMat: Mat3 = [
          parseFloat(tokens[5]), parseFloat(tokens[6]), parseFloat(tokens[7]),
          parseFloat(tokens[8]), parseFloat(tokens[9]), parseFloat(tokens[10]),
          parseFloat(tokens[11]), parseFloat(tokens[12]), parseFloat(tokens[13]),
        ];

        const worldMat = mat3Mul(parentMat, localMat);
        const rotTrans = mat3VecMul(parentMat, [tx, ty, tz]);
        const worldTrans: Vec3 = [
          parentTrans[0] + rotTrans[0],
          parentTrans[1] + rotTrans[1],
          parentTrans[2] + rotTrans[2],
        ];

        const rawColorCode = parseInt(tokens[1], 10);
        const resolvedColorCode = rawColorCode === 16 ? parentColorCode : rawColorCode;

        const rawRef = tokens.slice(14).join(' ').trim().toLowerCase();
        const normRef = rawRef.replace(/\.(ldr|mpd|dat)$/, '');

        if (submodels.has(rawRef) || submodels.has(normRef)) {
          const target = submodels.has(normRef) ? normRef : rawRef;
          if (!visited.has(target)) {
            const nextVisited = new Set(visited);
            nextVisited.add(target);
            const childInstanceId = `${target}_inst${instanceCounter++}`;
            expandSubmodel(target, childInstanceId, worldMat, worldTrans, resolvedColorCode, depth + 1, nextVisited);
          }
        } else {
          // Terminal primitive part (.dat)
          const cleanPartNumber = normRef.replace(/^bl_/, '');
          const posX = worldTrans[0] * 0.4;   // 1 LDU = 0.4mm
          const posY = -worldTrans[1] * 0.4;  // Invert Y (LDraw is Y-down)
          const posZ = -worldTrans[2] * 0.4;  // Invert Z for proper right-handed Three.js orientation

          const colorHex = LDRAW_COLOR_MAP[resolvedColorCode] ?? 0x94a3b8;
          const role = lookupPartRole(cleanPartNumber);
          const partId = `ldraw_${partIndex++}_${cleanPartNumber}`;
          const rotation = matrixToQuaternion(worldMat);

          parts.push({
            id: partId,
            partNumber: cleanPartNumber,
            position: [posX, posY, posZ],
            rotation,
            role,
            colorHex,
            submodel: subName,
            submodelInstance: instanceId,
          });
        }
      }
    };

    const identityMat: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    expandSubmodel(primaryEntryName, 'root_inst0', identityMat, [0, 0, 0], 16, 0, new Set([primaryEntryName]));

    // 3. Connect parts:
    // A. Parts belonging to the same Studio SubModel instance are rigidly linked (subassemblies stay together)
    const byInstance = new Map<string, string[]>();
    for (const p of parts) {
      const inst = p.submodelInstance || p.submodel || 'main';
      if (!byInstance.has(inst)) byInstance.set(inst, []);
      byInstance.get(inst)!.push(p.id);
    }
    for (const partIds of byInstance.values()) {
      for (let k = 0; k < partIds.length - 1; k++) {
        links.push({
          fromPartId: partIds[k],
          toPartId: partIds[k + 1],
          connectionType: 'RIGID_PIN',
        });
      }
    }

    // B. Proximity connections across submodels (within 32mm / 4 studs)
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        const p1 = parts[i];
        const p2 = parts[j];
        const dx = p1.position[0] - p2.position[0];
        const dy = p1.position[1] - p2.position[1];
        const dz = p1.position[2] - p2.position[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist <= 32.0) {
          if (p1.role === 'WHEEL_RIM' || p2.role === 'WHEEL_RIM') {
            links.push({
              fromPartId: p1.role === 'WHEEL_RIM' ? p2.id : p1.id,
              toPartId: p1.role === 'WHEEL_RIM' ? p1.id : p2.id,
              connectionType: 'REVOLUTE_AXLE',
              jointAxis: [1, 0, 0],
            });
          } else {
            links.push({
              fromPartId: p1.id,
              toPartId: p2.id,
              connectionType: 'RIGID_PIN',
            });
          }
        }
      }
    }

    return {
      name: modelName,
      parts,
      links,
    };
  }

  /**
   * Unzips a BrickLink Studio (.io) binary file and parses the inner model.ldr
   */
  public static async parseStudioIo(fileBuffer: ArrayBuffer | Blob): Promise<RobotAssemblySpec> {
    const zip = new JSZip();
    const contents = await zip.loadAsync(fileBuffer);

    // Look for model.ldr or *.ldr inside the archive
    let ldrFile = contents.file('model.ldr');
    if (!ldrFile) {
      const allFiles = Object.keys(contents.files);
      const foundLdr = allFiles.find((f) => f.endsWith('.ldr') || f.endsWith('.mpd'));
      if (foundLdr) {
        ldrFile = contents.file(foundLdr);
      }
    }

    if (!ldrFile) {
      throw new Error('No LDraw (.ldr or .mpd) model found inside Studio .io file');
    }

    const ldrText = await ldrFile.async('text');
    const parsed = LDrawImporter.parseLDrawText(ldrText, 'Studio Model');
    return CadClusteringPreSolver.solve(parsed);
  }
}

