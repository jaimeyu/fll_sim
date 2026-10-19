import JSZip from 'jszip';
import { PlacedPart, ConnectionLink, RobotAssemblySpec, PartBomEntry } from './types';
import { FllPhysicsSpec, isValidPhysicsSpec } from './physics-spec';
import { lookupPartRole, isChainPart, isFastenerPart, isPivotFastener } from './part-catalog';
import { CadClusteringPreSolver } from './clustering-solver';
import { LDRAW_COLOR_MAP, isKnownLegoPart } from '../view/lego-visuals';

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

/**
 * Resolves the primary cylinder/hinge axis for a Technic pin or axle from its orientation quaternion.
 */
function getPinAxis(q: [number, number, number, number]): [number, number, number] {
  const [qx, qy, qz, qw] = q;
  // In LDraw Technic pins and axles, the cylinder length axis is defined along [1, 0, 0].
  // Rotate local [1, 0, 0] by quaternion q: v = q * [1, 0, 0] * q*
  const vx = 1 - 2 * (qy * qy + qz * qz);
  const vy = 2 * (qx * qy + qw * qz);
  const vz = 2 * (qx * qz - qw * qy);
  const ax = Math.abs(vx), ay = Math.abs(vy), az = Math.abs(vz);
  if (ax >= ay && ax >= az) return [Math.sign(vx) || 1, 0, 0];
  if (ay >= ax && ay >= az) return [0, Math.sign(vy) || 1, 0];
  return [0, 0, Math.sign(vz) || 1];
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
    // A. Parts belonging to the same Studio SubModel instance are linked
    const byInstance = new Map<string, PlacedPart[]>();
    for (const p of parts) {
      const inst = p.submodelInstance || p.submodel || 'main';
      if (!byInstance.has(inst)) byInstance.set(inst, []);
      byInstance.get(inst)!.push(p);
    }
    for (const pList of byInstance.values()) {
      const pFirst = pList[0];
      const isChainSub = pFirst && (pFirst.role === 'CHAIN_LINK' || isChainPart(pFirst.partNumber, pFirst.submodel));

      if (isChainSub && pList.length > 2) {
        // Articulate chain into dynamic segments (3-5 links per segment)
        // so chains droop, flex, and swing realistically in physics!
        const linksPerSegment = Math.max(3, Math.ceil(pList.length / 5));
        for (let k = 0; k < pList.length - 1; k++) {
          const isSegmentBoundary = (k + 1) % linksPerSegment === 0;
          if (isSegmentBoundary) {
            const pk = pList[k];
            links.push({
              fromPartId: pList[k].id,
              toPartId: pList[k + 1].id,
              connectionType: 'FREE_ROTATION',
              anchor: [pk.position[0] / 1000, pk.position[1] / 1000, pk.position[2] / 1000],
            });
          } else {
            links.push({
              fromPartId: pList[k].id,
              toPartId: pList[k + 1].id,
              connectionType: 'RIGID_PIN',
            });
          }
        }
      } else {
        // Standard rigid subassembly
        for (let k = 0; k < pList.length - 1; k++) {
          links.push({
            fromPartId: pList[k].id,
            toPartId: pList[k + 1].id,
            connectionType: 'RIGID_PIN',
          });
        }
      }
    }

    // B. Selective connections across distinct submodels (fasteners, chains, and revolute joints)
    const chainAnchorCandidates = new Map<string, { chainPart: PlacedPart; otherPart: PlacedPart; dist: number }>();
    const instances = Array.from(byInstance.keys());

    for (let i = 0; i < instances.length; i++) {
      for (let j = i + 1; j < instances.length; j++) {
        const instA = instances[i];
        const instB = instances[j];
        const partsA = byInstance.get(instA) || [];
        const partsB = byInstance.get(instB) || [];

        const isChainA = partsA.some((p) => p.role === 'CHAIN_LINK' || isChainPart(p.partNumber, p.submodel));
        const isChainB = partsB.some((p) => p.role === 'CHAIN_LINK' || isChainPart(p.partNumber, p.submodel));

        // 1. Chain connection to frame or payload: find closest anchor attachment
        if (isChainA || isChainB) {
          let bestD = Infinity;
          let bestP1: PlacedPart | null = null;
          let bestP2: PlacedPart | null = null;
          for (const pa of partsA) {
            for (const pb of partsB) {
              const dx = pa.position[0] - pb.position[0];
              const dy = pa.position[1] - pb.position[1];
              const dz = pa.position[2] - pb.position[2];
              const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
              if (d < bestD) {
                bestD = d;
                bestP1 = pa;
                bestP2 = pb;
              }
            }
          }
          if (bestD <= 36.0 && bestP1 && bestP2) {
            const chainPart = isChainA ? bestP1 : bestP2;
            const otherPart = isChainA ? bestP2 : bestP1;
            const key = `${chainPart.submodelInstance || chainPart.submodel}__${otherPart.submodelInstance || otherPart.submodel}`;
            const existing = chainAnchorCandidates.get(key);
            if (!existing || bestD < existing.dist) {
              chainAnchorCandidates.set(key, { chainPart, otherPart, dist: bestD });
            }
          }
          continue;
        }

        // 2. Wheel rim revolute joint
        let hasWheelLink = false;
        for (const pa of partsA) {
          for (const pb of partsB) {
            if (pa.role === 'WHEEL_RIM' || pb.role === 'WHEEL_RIM') {
              const dx = pa.position[0] - pb.position[0];
              const dy = pa.position[1] - pb.position[1];
              const dz = pa.position[2] - pb.position[2];
              const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
              if (d <= 32.0) {
                const rimPart = pa.role === 'WHEEL_RIM' ? pa : pb;
                const chassisPart = pa.role === 'WHEEL_RIM' ? pb : pa;
                links.push({
                  fromPartId: chassisPart.id,
                  toPartId: rimPart.id,
                  connectionType: 'REVOLUTE_AXLE',
                  jointAxis: [1, 0, 0],
                  anchor: [rimPart.position[0] / 1000, rimPart.position[1] / 1000, rimPart.position[2] / 1000],
                });
                hasWheelLink = true;
                break;
              }
            }
          }
          if (hasWheelLink) break;
        }
        if (hasWheelLink) continue;

        // 3. Fasteners & Concentric Pin Holes / Coincident Mounts
        const fastenerHits: { pa: PlacedPart; pb: PlacedPart; dist: number; isPivot: boolean; pivotPart: PlacedPart | null }[] = [];
        let minD = Infinity;
        let closestPair: { pa: PlacedPart; pb: PlacedPart } | null = null;

        for (const pa of partsA) {
          for (const pb of partsB) {
            const dx = pa.position[0] - pb.position[0];
            const dy = pa.position[1] - pb.position[1];
            const dz = pa.position[2] - pb.position[2];
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (d < minD) {
              minD = d;
              closestPair = { pa, pb };
            }

            const aFastener = isFastenerPart(pa.partNumber);
            const bFastener = isFastenerPart(pb.partNumber);

            if (aFastener || bFastener) {
              if (d <= 20.0) {
                const pivotPart = (aFastener && isPivotFastener(pa.partNumber)) ? pa :
                                  (bFastener && isPivotFastener(pb.partNumber)) ? pb : null;
                fastenerHits.push({ pa, pb, dist: d, isPivot: !!pivotPart, pivotPart });
              }
            }
          }
        }

        if (fastenerHits.length > 0) {
          fastenerHits.sort((a, b) => a.dist - b.dist);

          const distinct: typeof fastenerHits = [];
          for (const hit of fastenerHits) {
            const hX = (hit.pa.position[0] + hit.pb.position[0]) / 2;
            const hY = (hit.pa.position[1] + hit.pb.position[1]) / 2;
            const hZ = (hit.pa.position[2] + hit.pb.position[2]) / 2;
            const exists = distinct.some((d) => {
              const dX = (d.pa.position[0] + d.pb.position[0]) / 2 - hX;
              const dY = (d.pa.position[1] + d.pb.position[1]) / 2 - hY;
              const dZ = (d.pa.position[2] + d.pb.position[2]) / 2 - hZ;
              return Math.sqrt(dX * dX + dY * dY + dZ * dZ) < 8.0;
            });
            if (!exists) distinct.push(hit);
          }

          const pivots = distinct.filter((d) => d.isPivot);
          if (pivots.length > 0) {
            const firstAxis = getPinAxis(pivots[0].pivotPart!.rotation);
            const allSameAxis = pivots.every((p) => {
              const ax = getPinAxis(p.pivotPart!.rotation);
              return (ax[0] === firstAxis[0] && ax[1] === firstAxis[1] && ax[2] === firstAxis[2]) ||
                     (ax[0] === -firstAxis[0] && ax[1] === -firstAxis[1] && ax[2] === -firstAxis[2]);
            });
            const rigidFasteners = distinct.filter((d) => !d.isPivot);

            // If all pivot pins share the collinear rotation axis and no rigid fasteners conflict,
            // extract a functional 1-DOF Revolute Joint (e.g. co-axial hinge pins on clevis arms)
            if (allSameAxis && rigidFasteners.length === 0) {
              const rep = pivots[0];
              links.push({
                fromPartId: rep.pa.id,
                toPartId: rep.pb.id,
                connectionType: 'REVOLUTE_AXLE',
                jointAxis: firstAxis,
                anchor: [rep.pa.position[0] / 1000, rep.pa.position[1] / 1000, rep.pa.position[2] / 1000],
              });
              continue;
            }
          }

          links.push({
            fromPartId: distinct[0].pa.id,
            toPartId: distinct[0].pb.id,
            connectionType: 'RIGID_PIN',
          });
        } else if (minD <= 8.5 && closestPair) {
          // Direct brick clutch / abutting stud contact within 8.5mm (standard LEGO 8.0mm pitch)
          links.push({
            fromPartId: closestPair.pa.id,
            toPartId: closestPair.pb.id,
            connectionType: 'RIGID_PIN',
          });
        }
      }
    }

    // Add unique chain anchor joints
    for (const cand of chainAnchorCandidates.values()) {
      links.push({
        fromPartId: cand.otherPart.id,
        toPartId: cand.chainPart.id,
        connectionType: 'FREE_ROTATION',
        anchor: [cand.chainPart.position[0] / 1000, cand.chainPart.position[1] / 1000, cand.chainPart.position[2] / 1000],
      });
    }

    return {
      name: modelName,
      parts,
      links,
    };
  }

  /**
   * Generates a complete Bill of Materials (BOM) summarizing unique parts,
   * quantities, authentic catalog descriptions, and procedural visual mesh status.
   */
  public static extractBomFromParts(
    parts: PlacedPart[],
    descriptions: Map<string, string> = new Map()
  ): PartBomEntry[] {
    const bomMap = new Map<string, PartBomEntry>();
    for (const p of parts) {
      const clean = p.partNumber;
      if (!bomMap.has(clean)) {
        const name = descriptions.get(clean.toLowerCase()) || `LEGO Element ${clean}`;
        bomMap.set(clean, {
          partNumber: clean,
          name,
          count: 0,
          role: p.role,
          colorHex: p.colorHex,
          hasAccurateMesh: isKnownLegoPart(clean, p.role),
        });
      }
      bomMap.get(clean)!.count++;
    }
    return Array.from(bomMap.values()).sort((a, b) => b.count - a.count);
  }

  /**
   * Unzips a BrickLink Studio (.io) binary file and parses the inner model.ldr
   * along with authentic part descriptions embedded in model2.ldr
   */
  public static async parseStudioIo(
    fileBuffer: ArrayBuffer | Blob,
    options?: { disablePreSolver?: boolean }
  ): Promise<RobotAssemblySpec> {
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

    // Extract official part descriptions from model2.ldr if present
    const descriptions = new Map<string, string>();
    const model2File = contents.file('model2.ldr');
    if (model2File) {
      const text2 = await model2File.async('text');
      const chunks = text2.split(/(?:^|\r?\n)0\s+FILE\s+/i).filter(Boolean);
      for (const c of chunks) {
        const lines = c.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (!lines.length) continue;
        const filename = lines[0].toLowerCase().replace(/\.(dat|ldr|mpd|io)$/, '');
        const desc = lines.find(
          (l) =>
            l.startsWith('0 ') &&
            !l.startsWith('0 FILE') &&
            !l.startsWith('0 Name:') &&
            !l.startsWith('0 Author') &&
            !l.startsWith('0 !') &&
            !l.startsWith('0 BL_') &&
            !l.startsWith('0 IsSubModel') &&
            !l.startsWith('0 CustomBrick') &&
            !l.startsWith('0 Flexible') &&
            !l.startsWith('0 NumOfBricks') &&
            !l.startsWith('0 RenderAngle') &&
            !l.startsWith('0 Untitled') &&
            !l.startsWith('0 BFC') &&
            !l.startsWith('0 //')
        )?.replace(/^0\s+/, '');
        if (desc) {
          descriptions.set(filename, desc);
        }
      }
    }

    const ldrText = await ldrFile.async('text');
    const parsed = LDrawImporter.parseLDrawText(ldrText, 'Studio Model');
    const spec = CadClusteringPreSolver.solve(parsed, options);

    // Check for embedded fll_physics.json
    const physicsFile = contents.file('fll_physics.json');
    if (physicsFile) {
      try {
        const text = await physicsFile.async('text');
        const json = JSON.parse(text);
        if (isValidPhysicsSpec(json)) {
          spec.physicsSpec = json;
        }
      } catch (e) {
        console.warn('Failed to parse embedded fll_physics.json:', e);
      }
    }

    // Attach complete Bill of Materials (BOM) to spec
    spec.bom = LDrawImporter.extractBomFromParts(parsed.parts, descriptions);

    return spec;
  }

  /**
   * Embeds `fll_physics.json` into a BrickLink Studio (.io) zip archive,
   * returning a downloadable Blob containing the updated archive.
   */
  public static async exportStudioIoWithPhysics(
    ioBuffer: ArrayBuffer | Blob | null | undefined,
    physicsSpec: FllPhysicsSpec,
    fallbackLdrText?: string
  ): Promise<Blob> {
    const zip = new JSZip();
    let targetZip = zip;
    if (ioBuffer) {
      try {
        targetZip = await zip.loadAsync(ioBuffer);
      } catch (e) {
        console.warn('Failed to load existing ioBuffer, generating fresh zip archive:', e);
        targetZip = new JSZip();
      }
    }
    if (fallbackLdrText && !targetZip.file('model.ldr')) {
      targetZip.file('model.ldr', fallbackLdrText);
    }
    targetZip.file('fll_physics.json', JSON.stringify(physicsSpec, null, 2));
    return await targetZip.generateAsync({ type: 'blob', mimeType: 'application/octet-stream' });
  }
}

