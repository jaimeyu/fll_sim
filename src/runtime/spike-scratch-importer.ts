import JSZip from 'jszip';

export interface VisualBlock {
  id: string;
  opcode: string;
  category: 'event' | 'movement' | 'motor' | 'control' | 'sensor' | 'operator' | 'variable';
  icon: string;
  label: string;
  params: Record<string, string>;
  colorHex: string;
  children?: VisualBlock[];
  elseChildren?: VisualBlock[];
}

export interface SpikeScratchImportResult {
  projectName: string;
  pythonCode: string;
  visualBlocks: VisualBlock[];
  totalBlocks: number;
}

const COLOR_MAP: Record<string, string> = {
  '-1': 'none',
  '': 'none',
  '0': 'black',
  '1': 'magenta',
  '2': 'purple',
  '3': 'blue',
  '4': 'azure',
  '5': 'green',
  '7': 'yellow',
  '8': 'orange',
  '9': 'red',
  '10': 'white',
};

/**
 * High-Fidelity Scratch / Word Blocks Importer for LEGO SPIKE Prime App projects (.llsp3, .llsp, .sb3, .json).
 * Unpacks the project archive, parses the Scratch 3.0 AST, and transpiles the block sequence
 * into standard, fully executable SPIKE Prime Python code, with an accompanying visual block structure.
 */
export class SpikeScratchImporter {
  /**
   * Parses a SPIKE app project file (.llsp3, .llsp, .sb3, or raw Scratch JSON)
   */
  public static async importProject(
    fileData: ArrayBuffer | Blob | string,
    defaultName: string = 'Imported SPIKE Program'
  ): Promise<SpikeScratchImportResult> {
    let projectJson: any;
    let projectName = defaultName.replace(/\.(llsp3?|sb3|json)$/i, '');

    if (typeof fileData === 'string' && fileData.trim().startsWith('{')) {
      projectJson = JSON.parse(fileData);
    } else {
      const zip = new JSZip();
      const zipContent = await zip.loadAsync(fileData as any);

      // 1. Try reading manifest.json for authentic project metadata
      const manifestFile = zipContent.file('manifest.json');
      if (manifestFile) {
        try {
          const manifestText = await manifestFile.async('text');
          const manifest = JSON.parse(manifestText);
          if (manifest.name) {
            projectName = manifest.name;
          }
        } catch (_) {}
      }

      // 2. Check for nested scratch.sb3 (SPIKE 3 .llsp3 format)
      const sb3File = zipContent.file('scratch.sb3');
      if (sb3File) {
        const sb3Buffer = await sb3File.async('arraybuffer');
        const nestedZip = new JSZip();
        const nestedContent = await nestedZip.loadAsync(sb3Buffer);
        const innerProj = nestedContent.file('project.json');
        if (!innerProj) {
          throw new Error('No project.json found inside scratch.sb3 archive');
        }
        const text = await innerProj.async('text');
        projectJson = JSON.parse(text);
      } else {
        // 3. Check for direct project.json or projectbody.json (SPIKE 2 .llsp or Scratch .sb3 format)
        const projFile =
          zipContent.file('projectbody.json') ||
          zipContent.file('project.json') ||
          zipContent.file('model.json');

        if (projFile) {
          const text = await projFile.async('text');
          projectJson = JSON.parse(text);
        } else {
          // Look for any .json file in the archive
          const allJson = Object.keys(zipContent.files).find((k) => k.endsWith('.json') && !k.endsWith('manifest.json'));
          if (allJson) {
            const text = await zipContent.file(allJson)!.async('text');
            projectJson = JSON.parse(text);
          } else {
            throw new Error('Unsupported project archive: no project.json or scratch.sb3 found');
          }
        }
      }
    }

    // 4. Locate blocks dictionary from target sprite/actor
    let blocks: Record<string, any> = {};
    if (projectJson.targets && Array.isArray(projectJson.targets)) {
      // Find non-stage target with active blocks, or fallback to first target
      const actor = projectJson.targets.find((t: any) => !t.isStage && t.blocks && Object.keys(t.blocks).length > 0) || projectJson.targets[0];
      blocks = actor?.blocks || {};
    } else if (projectJson.blocks) {
      blocks = projectJson.blocks;
    }

    return this.transpileBlocks(blocks, projectName);
  }

  /**
   * Traverses Scratch blocks AST starting from hat blocks and generates Python + visual descriptors
   */
  public static transpileBlocks(blocks: Record<string, any>, projectName: string): SpikeScratchImportResult {
    // Collect all top-level hat blocks (when program starts)
    const hatIds = Object.keys(blocks).filter((id) => {
      const b = blocks[id];
      if (!b || typeof b !== 'object') return false;
      const op = b.opcode || '';
      return (
        b.topLevel ||
        op.includes('whenProgramStarts') ||
        op.includes('whenflagclicked') ||
        op.includes('start_hat')
      );
    });

    // Devices discovered during block parsing
    const devices = {
      hasHub: false,
      hasMotors: false,
      motorPairPorts: ['A', 'B'] as [string, string],
      individualMotors: new Set<string>(),
      colorSensors: new Set<string>(),
      distanceSensors: new Set<string>(),
      hasTimer: false,
    };

    const pyBodyLines: string[] = [];
    const visualBlocks: VisualBlock[] = [];
    let totalBlockCount = 0;

    // Traverse starting from primary hat block
    const primaryHatId = hatIds.find((id) => {
      const op = blocks[id]?.opcode || '';
      return op.includes('whenProgramStarts') || op.includes('whenflagclicked');
    }) || hatIds[0];

    if (primaryHatId) {
      totalBlockCount++;
      visualBlocks.push({
        id: primaryHatId,
        opcode: blocks[primaryHatId].opcode,
        category: 'event',
        icon: '🚩',
        label: 'When Program Starts',
        params: {},
        colorHex: '#eab308',
      });

      let currId = blocks[primaryHatId].next;
      while (currId) {
        const b = blocks[currId];
        if (!b) break;
        totalBlockCount++;

        const res = this.processBlock(currId, b, blocks, devices, 0);
        if (res.pyLines.length > 0) {
          pyBodyLines.push(...res.pyLines);
        }
        if (res.visualBlock) {
          visualBlocks.push(res.visualBlock);
        }
        currId = b.next;
      }
    }

    // Build standard SPIKE Prime Python header with all discovered sensors & motors
    const headerLines: string[] = [
      '# -------------------------------------------------------------------------',
      `# Translated from SPIKE App Word Blocks: "${projectName}"`,
      '# -------------------------------------------------------------------------',
      'from spike import PrimeHub, Motor, MotorPair, ColorSensor, DistanceSensor',
      'from spike.control import wait_for_seconds, wait_until',
      '',
      'hub = PrimeHub()',
    ];

    if (devices.hasMotors || pyBodyLines.some((l) => l.includes('motors.'))) {
      headerLines.push(`motors = MotorPair('${devices.motorPairPorts[0]}', '${devices.motorPairPorts[1]}')`);
    }

    for (const p of Array.from(devices.individualMotors).sort()) {
      headerLines.push(`motor_${p.toLowerCase()} = Motor('${p}')`);
    }

    for (const p of Array.from(devices.colorSensors).sort()) {
      headerLines.push(`color_${p.toLowerCase()} = ColorSensor('${p}')`);
    }

    for (const p of Array.from(devices.distanceSensors).sort()) {
      headerLines.push(`dist_${p.toLowerCase()} = DistanceSensor('${p}')`);
    }

    headerLines.push('');
    headerLines.push('# --- Main Program ---');

    const fullPythonCode = [...headerLines, ...(pyBodyLines.length > 0 ? pyBodyLines : ['pass'])].join('\n') + '\n';

    return {
      projectName,
      pythonCode: fullPythonCode,
      visualBlocks,
      totalBlocks: totalBlockCount,
    };
  }

  private static processBlock(
    bid: string,
    b: any,
    blocks: Record<string, any>,
    devices: any,
    indentDepth: number
  ): { pyLines: string[]; visualBlock?: VisualBlock } {
    const indent = '    '.repeat(indentDepth);
    const op = b.opcode || '';
    const inputs = b.inputs || {};
    const fields = b.fields || {};

    const pyLines: string[] = [];
    let visualBlock: VisualBlock | undefined;

    // 1. MOVEMENT BLOCKS (Blue)
    if (op === 'flippermove_setMovementPair' || op === 'spike_setMovementPair') {
      devices.hasMotors = true;
      const pair = this.resolveInput(inputs.PAIR, blocks) || 'AB';
      const p1 = pair[0] || 'A';
      const p2 = pair[1] || 'B';
      devices.motorPairPorts = [p1, p2];
      pyLines.push(`${indent}motors = MotorPair('${p1}', '${p2}')`);
      visualBlock = {
        id: bid,
        opcode: op,
        category: 'movement',
        icon: '🚗',
        label: `Set movement motors to [${p1}+${p2}]`,
        params: { left: p1, right: p2 },
        colorHex: '#0284c7',
      };
    } else if (op === 'flippermove_movementSpeed' || op === 'spike_movementSpeed') {
      devices.hasMotors = true;
      const spd = this.resolveInput(inputs.SPEED, blocks) || '50';
      pyLines.push(`${indent}motors.set_default_speed(${spd})`);
      visualBlock = {
        id: bid,
        opcode: op,
        category: 'movement',
        icon: '⚡',
        label: `Set movement speed to [${spd}%]`,
        params: { speed: spd },
        colorHex: '#0284c7',
      };
    } else if (op === 'flippermove_move' || op === 'spike_move') {
      devices.hasMotors = true;
      const dir = this.resolveInput(inputs.DIRECTION, blocks) || 'forward';
      const val = this.resolveInput(inputs.VALUE, blocks) || '10';
      const unit = (fields.UNIT && fields.UNIT[0]) || 'cm';
      const numVal = parseFloat(val) || 0;
      const finalVal = dir === 'back' ? -Math.abs(numVal) : Math.abs(numVal);
      pyLines.push(`${indent}motors.move(${finalVal}, '${unit}')`);
      visualBlock = {
        id: bid,
        opcode: op,
        category: 'movement',
        icon: dir === 'back' ? '⬇️' : '⬆️',
        label: `Move [${dir}] for [${val}] [${unit}]`,
        params: { direction: dir, value: val, unit },
        colorHex: '#0284c7',
      };
    } else if (op === 'flippermove_startMove' || op === 'spike_startMove') {
      devices.hasMotors = true;
      const dir = this.resolveInput(inputs.DIRECTION, blocks) || 'forward';
      if (dir === 'back') {
        pyLines.push(`${indent}motors.start(0, -50)`);
      } else {
        pyLines.push(`${indent}motors.start()`);
      }
      visualBlock = {
        id: bid,
        opcode: op,
        category: 'movement',
        icon: '▶️',
        label: `Start moving [${dir}]`,
        params: { direction: dir },
        colorHex: '#0284c7',
      };
    } else if (op === 'flippermove_startSteer' || op === 'spike_startSteer') {
      devices.hasMotors = true;
      const steering = this.resolveInput(inputs.STEERING, blocks) || '0';
      const speed = this.resolveInput(inputs.SPEED, blocks) || '50';
      pyLines.push(`${indent}motors.start(${steering}, ${speed})`);
      visualBlock = {
        id: bid,
        opcode: op,
        category: 'movement',
        icon: '🔄',
        label: `Start steering [${steering}] at [${speed}%]`,
        params: { steering, speed },
        colorHex: '#0284c7',
      };
    } else if (op === 'flippermove_stopMove' || op === 'spike_stopMove') {
      devices.hasMotors = true;
      pyLines.push(`${indent}motors.stop()`);
      visualBlock = {
        id: bid,
        opcode: op,
        category: 'movement',
        icon: '⏹️',
        label: 'Stop moving',
        params: {},
        colorHex: '#0284c7',
      };
    } else if (op === 'flippermoremove_startDualSpeed' || op === 'spike_startDualSpeed') {
      devices.hasMotors = true;
      const l = this.resolveInput(inputs.LEFT, blocks) || '0';
      const r = this.resolveInput(inputs.RIGHT, blocks) || '0';
      pyLines.push(`${indent}motors.start_tank(${l}, ${r})`);
      visualBlock = {
        id: bid,
        opcode: op,
        category: 'movement',
        icon: '🎛️',
        label: `Start moving tank Left: [${l}%], Right: [${r}%]`,
        params: { left: l, right: r },
        colorHex: '#0284c7',
      };
    } else if (op === 'flippermoremove_moveDualSpeed' || op === 'spike_moveDualSpeed') {
      devices.hasMotors = true;
      const l = this.resolveInput(inputs.LEFT, blocks) || '0';
      const r = this.resolveInput(inputs.RIGHT, blocks) || '0';
      const val = this.resolveInput(inputs.VALUE, blocks) || '1';
      const unit = (fields.UNIT && fields.UNIT[0]) || 'rotations';
      pyLines.push(`${indent}motors.move_tank(${val}, '${unit}', ${l}, ${r})`);
      visualBlock = {
        id: bid,
        opcode: op,
        category: 'movement',
        icon: '🎛️',
        label: `Move tank for [${val}] [${unit}] Left: [${l}%], Right: [${r}%]`,
        params: { value: val, unit, left: l, right: r },
        colorHex: '#0284c7',
      };

    // 2. INDIVIDUAL MOTOR BLOCKS (Cyan / Teal)
    } else if (op === 'flippermotor_motorTurnForDirection' || op === 'spike_motorTurnForDirection') {
      const port = this.resolveInput(inputs.PORT, blocks) || 'A';
      devices.individualMotors.add(port);
      const dir = this.resolveInput(inputs.DIRECTION, blocks) || 'clockwise';
      const val = this.resolveInput(inputs.VALUE, blocks) || '1';
      const unit = (fields.UNIT && fields.UNIT[0]) || 'rotations';
      const numVal = parseFloat(val) || 0;
      const sign = dir === 'counterclockwise' ? -1 : 1;

      if (unit === 'rotations') {
        pyLines.push(`${indent}motor_${port.toLowerCase()}.run_for_degrees(${numVal * 360 * sign})`);
      } else if (unit === 'degrees') {
        pyLines.push(`${indent}motor_${port.toLowerCase()}.run_for_degrees(${numVal * sign})`);
      } else {
        pyLines.push(`${indent}motor_${port.toLowerCase()}.run_for_seconds(${numVal})`);
      }
      visualBlock = {
        id: bid,
        opcode: op,
        category: 'motor',
        icon: '⚙️',
        label: `Turn Motor [Port ${port}] [${dir}] for [${val}] [${unit}]`,
        params: { port, direction: dir, value: val, unit },
        colorHex: '#06b6d4',
      };
    } else if (op === 'flippermotor_motorStartDirection' || op === 'spike_motorStartDirection') {
      const port = this.resolveInput(inputs.PORT, blocks) || 'A';
      devices.individualMotors.add(port);
      const dir = this.resolveInput(inputs.DIRECTION, blocks) || 'clockwise';
      const speed = this.resolveInput(inputs.SPEED, blocks) || '50';
      const sign = dir === 'counterclockwise' ? '-' : '';
      pyLines.push(`${indent}motor_${port.toLowerCase()}.start(${sign}${speed})`);
      visualBlock = {
        id: bid,
        opcode: op,
        category: 'motor',
        icon: '⚙️',
        label: `Start Motor [Port ${port}] [${dir}] at [${speed}%]`,
        params: { port, direction: dir, speed },
        colorHex: '#06b6d4',
      };
    } else if (op === 'flippermotor_motorStop' || op === 'spike_motorStop') {
      const port = this.resolveInput(inputs.PORT, blocks) || 'A';
      devices.individualMotors.add(port);
      pyLines.push(`${indent}motor_${port.toLowerCase()}.stop()`);
      visualBlock = {
        id: bid,
        opcode: op,
        category: 'motor',
        icon: '⏹️',
        label: `Stop Motor [Port ${port}]`,
        params: { port },
        colorHex: '#06b6d4',
      };
    } else if (op === 'flippermotor_motorSetSpeed' || op === 'spike_motorSetSpeed') {
      const port = this.resolveInput(inputs.PORT, blocks) || 'A';
      devices.individualMotors.add(port);
      const spd = this.resolveInput(inputs.SPEED, blocks) || '50';
      pyLines.push(`${indent}motor_${port.toLowerCase()}.set_default_speed(${spd})`);
      visualBlock = {
        id: bid,
        opcode: op,
        category: 'motor',
        icon: '⚡',
        label: `Set Motor [Port ${port}] speed to [${spd}%]`,
        params: { port, speed: spd },
        colorHex: '#06b6d4',
      };

    // 3. SENSORS (Purple)
    } else if (op === 'flippersensors_resetYaw' || op === 'spike_resetYaw') {
      devices.hasHub = true;
      pyLines.push(`${indent}hub.motion_sensor.reset_yaw_angle()`);
      visualBlock = {
        id: bid,
        opcode: op,
        category: 'sensor',
        icon: '🧭',
        label: 'Reset Yaw angle to 0°',
        params: {},
        colorHex: '#a855f7',
      };
    } else if (op === 'flippersensors_resetTimer' || op === 'sensing_resettimer') {
      devices.hasTimer = true;
      pyLines.push(`${indent}timer.reset()`);
      visualBlock = {
        id: bid,
        opcode: op,
        category: 'sensor',
        icon: '⏱️',
        label: 'Reset Timer',
        params: {},
        colorHex: '#a855f7',
      };

    // 4. CONTROL BLOCKS (Orange)
    } else if (op === 'control_wait') {
      const secs = this.resolveInput(inputs.DURATION, blocks) || '1';
      pyLines.push(`${indent}wait_for_seconds(${secs})`);
      visualBlock = {
        id: bid,
        opcode: op,
        category: 'control',
        icon: '⏳',
        label: `Wait [${secs}] seconds`,
        params: { duration: secs },
        colorHex: '#f97316',
      };
    } else if (op === 'control_wait_until') {
      const cond = this.resolveCondition(inputs.CONDITION, blocks, devices);
      pyLines.push(`${indent}while not (${cond.pyExpr}):`);
      pyLines.push(`${indent}    wait_for_seconds(0.01)`);
      visualBlock = {
        id: bid,
        opcode: op,
        category: 'control',
        icon: '⏳',
        label: `Wait until <${cond.label}>`,
        params: { condition: cond.label },
        colorHex: '#f97316',
      };
    } else if (op === 'control_repeat') {
      const times = this.resolveInput(inputs.TIMES, blocks) || '10';
      pyLines.push(`${indent}for _ in range(${times}):`);
      const children = this.processSubstack(inputs.SUBSTACK, blocks, devices, indentDepth + 1, pyLines);
      visualBlock = {
        id: bid,
        opcode: op,
        category: 'control',
        icon: '🔁',
        label: `Repeat [${times}] times`,
        params: { times },
        colorHex: '#f97316',
        children,
      };
    } else if (op === 'control_forever') {
      pyLines.push(`${indent}while True:`);
      const children = this.processSubstack(inputs.SUBSTACK, blocks, devices, indentDepth + 1, pyLines);
      visualBlock = {
        id: bid,
        opcode: op,
        category: 'control',
        icon: '♾️',
        label: 'Forever',
        params: {},
        colorHex: '#f97316',
        children,
      };
    } else if (op === 'control_if') {
      const cond = this.resolveCondition(inputs.CONDITION, blocks, devices);
      pyLines.push(`${indent}if ${cond.pyExpr}:`);
      const children = this.processSubstack(inputs.SUBSTACK, blocks, devices, indentDepth + 1, pyLines);
      visualBlock = {
        id: bid,
        opcode: op,
        category: 'control',
        icon: '❓',
        label: `If <${cond.label}> then`,
        params: { condition: cond.label },
        colorHex: '#f97316',
        children,
      };
    } else if (op === 'control_if_else') {
      const cond = this.resolveCondition(inputs.CONDITION, blocks, devices);
      pyLines.push(`${indent}if ${cond.pyExpr}:`);
      const children = this.processSubstack(inputs.SUBSTACK, blocks, devices, indentDepth + 1, pyLines);
      pyLines.push(`${indent}else:`);
      const elseChildren = this.processSubstack(inputs.SUBSTACK2, blocks, devices, indentDepth + 1, pyLines);
      visualBlock = {
        id: bid,
        opcode: op,
        category: 'control',
        icon: '❓',
        label: `If <${cond.label}> then ... else`,
        params: { condition: cond.label },
        colorHex: '#f97316',
        children,
        elseChildren,
      };

    // 5. VARIABLES / DATA (Orange / Red)
    } else if (op === 'data_setvariableto') {
      const varName = (fields.VARIABLE && fields.VARIABLE[0]) || 'var';
      const val = this.resolveInput(inputs.VALUE, blocks) || '0';
      pyLines.push(`${indent}${varName} = ${val}`);
      visualBlock = {
        id: bid,
        opcode: op,
        category: 'variable',
        icon: '📦',
        label: `Set [${varName}] to [${val}]`,
        params: { variable: varName, value: val },
        colorHex: '#ea580c',
      };
    } else if (op === 'data_changevariableby') {
      const varName = (fields.VARIABLE && fields.VARIABLE[0]) || 'var';
      const val = this.resolveInput(inputs.VALUE, blocks) || '1';
      pyLines.push(`${indent}${varName} += ${val}`);
      visualBlock = {
        id: bid,
        opcode: op,
        category: 'variable',
        icon: '📦',
        label: `Change [${varName}] by [${val}]`,
        params: { variable: varName, value: val },
        colorHex: '#ea580c',
      };
    } else {
      // Generic fallback for unhandled custom block
      visualBlock = {
        id: bid,
        opcode: op,
        category: 'control',
        icon: '🧩',
        label: `${op.replace(/^[a-z]+_/, '')}`,
        params: {},
        colorHex: '#64748b',
      };
    }

    return { pyLines, visualBlock };
  }

  private static processSubstack(
    substackInput: any,
    blocks: Record<string, any>,
    devices: any,
    indentDepth: number,
    targetPyLines: string[]
  ): VisualBlock[] {
    const children: VisualBlock[] = [];
    if (!substackInput) {
      targetPyLines.push('    '.repeat(indentDepth) + 'pass');
      return children;
    }

    let currId = substackInput[1];
    let addedAny = false;
    while (currId) {
      const b = blocks[currId];
      if (!b) break;
      const res = this.processBlock(currId, b, blocks, devices, indentDepth);
      if (res.pyLines.length > 0) {
        targetPyLines.push(...res.pyLines);
        addedAny = true;
      }
      if (res.visualBlock) {
        children.push(res.visualBlock);
      }
      currId = b.next;
    }

    if (!addedAny) {
      targetPyLines.push('    '.repeat(indentDepth) + 'pass');
    }

    return children;
  }

  private static resolveCondition(
    condInput: any,
    blocks: Record<string, any>,
    devices: any
  ): { pyExpr: string; label: string } {
    if (!condInput || !condInput[1]) {
      return { pyExpr: 'False', label: 'false' };
    }

    const bId = condInput[1];
    const b = blocks[bId];
    if (!b) {
      return { pyExpr: String(bId), label: String(bId) };
    }

    const op = b.opcode || '';
    const inputs = b.inputs || {};
    const fields = b.fields || {};

    if (op === 'operator_lt') {
      const l = this.resolveExpression(inputs.OPERAND1, blocks, devices);
      const r = this.resolveExpression(inputs.OPERAND2, blocks, devices);
      return { pyExpr: `${l.pyExpr} < ${r.pyExpr}`, label: `${l.label} < ${r.label}` };
    } else if (op === 'operator_gt') {
      const l = this.resolveExpression(inputs.OPERAND1, blocks, devices);
      const r = this.resolveExpression(inputs.OPERAND2, blocks, devices);
      return { pyExpr: `${l.pyExpr} > ${r.pyExpr}`, label: `${l.label} > ${r.label}` };
    } else if (op === 'operator_equals') {
      const l = this.resolveExpression(inputs.OPERAND1, blocks, devices);
      const r = this.resolveExpression(inputs.OPERAND2, blocks, devices);
      return { pyExpr: `${l.pyExpr} == ${r.pyExpr}`, label: `${l.label} = ${r.label}` };
    } else if (op === 'operator_and') {
      const l = this.resolveCondition(inputs.OPERAND1, blocks, devices);
      const r = this.resolveCondition(inputs.OPERAND2, blocks, devices);
      return { pyExpr: `(${l.pyExpr} and ${r.pyExpr})`, label: `(${l.label} and ${r.label})` };
    } else if (op === 'operator_or') {
      const l = this.resolveCondition(inputs.OPERAND1, blocks, devices);
      const r = this.resolveCondition(inputs.OPERAND2, blocks, devices);
      return { pyExpr: `(${l.pyExpr} or ${r.pyExpr})`, label: `(${l.label} or ${r.label})` };
    } else if (op === 'operator_not') {
      const c = this.resolveCondition(inputs.OPERAND, blocks, devices);
      return { pyExpr: `not (${c.pyExpr})`, label: `not (${c.label})` };
    } else if (op === 'flippersensors_isColor' || op === 'spike_isColor') {
      const port = this.resolveInput(inputs.PORT, blocks) || 'B';
      devices.colorSensors.add(port);
      const rawColor = this.resolveInput(inputs.VALUE, blocks) || '0';
      const colorName = COLOR_MAP[rawColor] || rawColor;
      return {
        pyExpr: `color_${port.toLowerCase()}.get_color() == '${colorName}'`,
        label: `Color Sensor [Port ${port}] is [${colorName}]`,
      };
    } else if (op === 'flippersensors_isDistance' || op === 'spike_isDistance') {
      const port = this.resolveInput(inputs.PORT, blocks) || 'E';
      devices.distanceSensors.add(port);
      const val = this.resolveInput(inputs.VALUE, blocks) || '20';
      const comparison = (fields.COMPARISON && fields.COMPARISON[0]) || '<';
      return {
        pyExpr: `dist_${port.toLowerCase()}.get_distance_cm() ${comparison} ${val}`,
        label: `Distance Sensor [Port ${port}] ${comparison} ${val} cm`,
      };
    }

    return { pyExpr: 'True', label: 'true' };
  }

  private static resolveExpression(
    exprInput: any,
    blocks: Record<string, any>,
    devices: any
  ): { pyExpr: string; label: string } {
    if (!exprInput) return { pyExpr: '0', label: '0' };
    const val = exprInput[1];

    if (Array.isArray(val)) {
      return { pyExpr: String(val[1]), label: String(val[1]) };
    }

    if (typeof val === 'string') {
      const b = blocks[val];
      if (!b) return { pyExpr: val, label: val };
      const op = b.opcode || '';
      const inputs = b.inputs || {};
      const fields = b.fields || {};

      if (op === 'flippersensors_orientationAxis' || op === 'spike_orientationAxis') {
        devices.hasHub = true;
        const axis = (fields.AXIS && fields.AXIS[0]) || 'yaw';
        return {
          pyExpr: `hub.motion_sensor.get_${axis}_angle()`,
          label: `${axis.toUpperCase()} Angle`,
        };
      } else if (op === 'flippersensors_colorReflectedLight') {
        const port = this.resolveInput(inputs.PORT, blocks) || 'C';
        devices.colorSensors.add(port);
        return {
          pyExpr: `color_${port.toLowerCase()}.get_reflected_light()`,
          label: `Reflected Light on [Port ${port}]`,
        };
      } else if (op === 'flippersensors_distance') {
        const port = this.resolveInput(inputs.PORT, blocks) || 'E';
        devices.distanceSensors.add(port);
        return {
          pyExpr: `dist_${port.toLowerCase()}.get_distance_cm()`,
          label: `Distance on [Port ${port}]`,
        };
      } else if (op === 'flippermotor_absolutePosition') {
        const port = this.resolveInput(inputs.PORT, blocks) || 'A';
        devices.individualMotors.add(port);
        return {
          pyExpr: `motor_${port.toLowerCase()}.get_position()`,
          label: `Position of Motor [Port ${port}]`,
        };
      } else if (op === 'operator_add') {
        const l = this.resolveExpression(inputs.NUM1, blocks, devices);
        const r = this.resolveExpression(inputs.NUM2, blocks, devices);
        return { pyExpr: `(${l.pyExpr} + ${r.pyExpr})`, label: `(${l.label} + ${r.label})` };
      } else if (op === 'operator_subtract') {
        const l = this.resolveExpression(inputs.NUM1, blocks, devices);
        const r = this.resolveExpression(inputs.NUM2, blocks, devices);
        return { pyExpr: `(${l.pyExpr} - ${r.pyExpr})`, label: `(${l.label} - ${r.label})` };
      } else if (op === 'operator_multiply') {
        const l = this.resolveExpression(inputs.NUM1, blocks, devices);
        const r = this.resolveExpression(inputs.NUM2, blocks, devices);
        return { pyExpr: `(${l.pyExpr} * ${r.pyExpr})`, label: `(${l.label} * ${r.label})` };
      } else if (op === 'operator_divide') {
        const l = this.resolveExpression(inputs.NUM1, blocks, devices);
        const r = this.resolveExpression(inputs.NUM2, blocks, devices);
        return { pyExpr: `(${l.pyExpr} / ${r.pyExpr})`, label: `(${l.label} / ${r.label})` };
      } else if (op === 'data_variable') {
        const varName = (fields.VARIABLE && fields.VARIABLE[0]) || 'var';
        return { pyExpr: varName, label: varName };
      }

      // Check fields of shadow block
      for (const fv of Object.values(fields)) {
        if (Array.isArray(fv) && fv.length > 0) {
          return { pyExpr: String(fv[0]), label: String(fv[0]) };
        }
      }
    }

    return { pyExpr: String(val), label: String(val) };
  }

  private static resolveInput(inputTuple: any, blocks: Record<string, any>): string {
    if (!inputTuple) return '';
    const val = inputTuple[1];
    if (Array.isArray(val)) {
      return String(val[1]);
    }
    if (typeof val === 'string') {
      const targetB = blocks[val];
      if (!targetB) return val;
      const fields = targetB.fields || {};
      for (const fv of Object.values(fields)) {
        if (Array.isArray(fv) && fv.length > 0) {
          return String(fv[0]);
        }
      }
    }
    return String(val || '');
  }
}
