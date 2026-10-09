import JSZip from 'jszip';
import { PlacedPart, ConnectionLink } from './types';
import { lookupPartRole } from './part-catalog';
import { CadClusteringPreSolver } from './clustering-solver';
import { RobotAssemblySpec } from './types';

export interface ParsedLDrawModel {
  name: string;
  parts: PlacedPart[];
  links: ConnectionLink[];
}

export class LDrawImporter {
  /**
   * Parses raw LDraw text (.ldr / .mpd) into placed parts
   */
  public static parseLDrawText(text: string, modelName = 'Imported LDraw Robot'): ParsedLDrawModel {
    const lines = text.split(/\r?\n/);
    const parts: PlacedPart[] = [];
    const links: ConnectionLink[] = [];

    let partIndex = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('1 ')) continue;

      // Format: 1 <colour> x y z a b c d e f g h i <file>
      const tokens = trimmed.split(/\s+/);
      if (tokens.length < 15) continue;

      const x = parseFloat(tokens[2]);
      const y = parseFloat(tokens[3]);
      const z = parseFloat(tokens[4]);
      const partNumber = tokens[14].toLowerCase().replace(/\.dat$/, '');

      // In LDraw, coordinates: X is right, Y is down, Z is forward (in LDU: 1 LDU = 0.4mm, 1 stud = 20 LDU = 8mm)
      // Convert to mm:
      const posX = x * 0.4;
      const posY = -y * 0.4; // Flip Y so positive is up
      const posZ = z * 0.4;

      const role = lookupPartRole(partNumber);
      const partId = `ldraw_${partIndex++}_${partNumber}`;

      parts.push({
        id: partId,
        partNumber,
        position: [posX, posY, posZ],
        rotation: [0, 0, 0, 1], // Identity or extracted from 3x3 rotation matrix
        role,
      });
    }

    // Connect parts based on proximity or role
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        const p1 = parts[i];
        const p2 = parts[j];
        const dx = p1.position[0] - p2.position[0];
        const dy = p1.position[1] - p2.position[1];
        const dz = p1.position[2] - p2.position[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // Within 16mm (2 studs), connect
        if (dist <= 16.0) {
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
