import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { SpikeScratchImporter, VisualBlock } from '../src/runtime/spike-scratch-importer';
import { PythonScriptRunner } from '../src/runtime/python-runner';
import { SAMPLE_MISSIONS } from '../src/ui/hud';

describe('SpikeScratchImporter (LEGO SPIKE App Word Blocks Importer)', () => {
  it('unpacks and transpiles authentic season .llsp3 project file if available', async () => {
    const filePath = '/Users/jyu/Downloads/guided-mission-bioglow-11.llsp3';
    if (!fs.existsSync(filePath)) {
      console.warn(`Skipping authentic file test: ${filePath} not found`);
      return;
    }

    const fileBuffer = fs.readFileSync(filePath);
    const result = await SpikeScratchImporter.importProject(fileBuffer.buffer, 'guided-mission-bioglow-11.llsp3');

    expect(result.projectName).toBeDefined();
    expect(result.totalBlocks).toBeGreaterThan(0);
    expect(result.visualBlocks.length).toBeGreaterThan(0);
    expect(result.pythonCode).toContain('from spike import PrimeHub, Motor, MotorPair');
    expect(result.pythonCode).toContain('hub = PrimeHub()');

    // Transpiles to valid runnable JavaScript
    const js = PythonScriptRunner.transpilePythonToJs(result.pythonCode);
    expect(js).toBeDefined();
    expect(js.length).toBeGreaterThan(20);

    // Validate that JS syntax is 100% executable
    expect(() => {
      new Function(
        'PrimeHub',
        'Motor',
        'MotorPair',
        'ColorSensor',
        'DistanceSensor',
        'wait_for_seconds',
        'time',
        '__yield',
        'console',
        `return (async () => {\n${js}\n})();`
      );
    }).not.toThrow();
  });

  it('transpiles all core Movement word blocks to Python with valid parameters', () => {
    const syntheticBlocks: Record<string, any> = {
      'hat1': {
        id: 'hat1',
        opcode: 'flipperevents_whenProgramStarts',
        next: 'block1',
        topLevel: true,
      },
      'block1': {
        id: 'block1',
        opcode: 'flippermove_setMovementPair',
        inputs: {
          PAIR: [1, [4, 'CD']],
        },
        next: 'block2',
      },
      'block2': {
        id: 'block2',
        opcode: 'flippermove_movementSpeed',
        inputs: {
          SPEED: [1, [4, '65']],
        },
        next: 'block3',
      },
      'block3': {
        id: 'block3',
        opcode: 'flippermove_move',
        inputs: {
          DIRECTION: [1, [4, 'forward']],
          VALUE: [1, [4, '25']],
        },
        fields: {
          UNIT: ['cm'],
        },
        next: 'block4',
      },
      'block4': {
        id: 'block4',
        opcode: 'flippermove_startSteer',
        inputs: {
          STEERING: [1, [4, '30']],
          SPEED: [1, [4, '50']],
        },
        next: 'block5',
      },
      'block5': {
        id: 'block5',
        opcode: 'flippermove_stopMove',
        inputs: {},
        next: 'block6',
      },
      'block6': {
        id: 'block6',
        opcode: 'flippermoremove_moveDualSpeed',
        inputs: {
          LEFT: [1, [4, '40']],
          RIGHT: [1, [4, '-40']],
          VALUE: [1, [4, '360']],
        },
        fields: {
          UNIT: ['degrees'],
        },
        next: null,
      },
    };

    const result = SpikeScratchImporter.transpileBlocks(syntheticBlocks, 'Movement Test');

    expect(result.projectName).toBe('Movement Test');
    expect(result.totalBlocks).toBe(7);
    expect(result.pythonCode).toContain("motors = MotorPair('C', 'D')");
    expect(result.pythonCode).toContain('motors.set_default_speed(65)');
    expect(result.pythonCode).toContain("motors.move(25, 'cm')");
    expect(result.pythonCode).toContain('motors.start(30, 50)');
    expect(result.pythonCode).toContain('motors.stop()');
    expect(result.pythonCode).toContain("motors.move_tank(360, 'degrees', 40, -40)");

    // Check visual block representation
    expect(result.visualBlocks.length).toBe(7);
    expect(result.visualBlocks[0].category).toBe('event');
    expect(result.visualBlocks[0].icon).toBe('🚩');
    expect(result.visualBlocks[1].category).toBe('movement');
    expect(result.visualBlocks[1].label).toContain('Set movement motors');
    expect(result.visualBlocks[3].label).toContain('Move [forward] for [25] [cm]');
  });

  it('transpiles individual motor blocks and controls', () => {
    const syntheticBlocks: Record<string, any> = {
      'hat1': {
        id: 'hat1',
        opcode: 'flipperevents_whenProgramStarts',
        next: 'm1',
        topLevel: true,
      },
      'm1': {
        id: 'm1',
        opcode: 'flippermotor_motorSetSpeed',
        inputs: {
          PORT: [1, [4, 'E']],
          SPEED: [1, [4, '75']],
        },
        next: 'm2',
      },
      'm2': {
        id: 'm2',
        opcode: 'flippermotor_motorTurnForDirection',
        inputs: {
          PORT: [1, [4, 'E']],
          DIRECTION: [1, [4, 'counterclockwise']],
          VALUE: [1, [4, '2']],
        },
        fields: {
          UNIT: ['rotations'],
        },
        next: 'm3',
      },
      'm3': {
        id: 'm3',
        opcode: 'flippermotor_motorStop',
        inputs: {
          PORT: [1, [4, 'E']],
        },
        next: null,
      },
    };

    const result = SpikeScratchImporter.transpileBlocks(syntheticBlocks, 'Arm Motor Test');

    expect(result.pythonCode).toContain("motor_e = Motor('E')");
    expect(result.pythonCode).toContain('motor_e.set_default_speed(75)');
    expect(result.pythonCode).toContain('motor_e.run_for_degrees(-720)');
    expect(result.pythonCode).toContain('motor_e.stop()');

    expect(result.visualBlocks[1].category).toBe('motor');
    expect(result.visualBlocks[1].colorHex).toBe('#06b6d4');
  });

  it('transpiles control loops, if-else branches, and conditions', () => {
    const syntheticBlocks: Record<string, any> = {
      'hat1': {
        id: 'hat1',
        opcode: 'flipperevents_whenProgramStarts',
        next: 'c1',
        topLevel: true,
      },
      'c1': {
        id: 'c1',
        opcode: 'control_wait',
        inputs: {
          DURATION: [1, [4, '1.5']],
        },
        next: 'c2',
      },
      'c2': {
        id: 'c2',
        opcode: 'control_repeat',
        inputs: {
          TIMES: [1, [4, '3']],
          SUBSTACK: [2, 'loop_body1'],
        },
        next: 'c3',
      },
      'loop_body1': {
        id: 'loop_body1',
        opcode: 'flippermove_move',
        inputs: {
          DIRECTION: [1, [4, 'forward']],
          VALUE: [1, [4, '10']],
        },
        fields: {
          UNIT: ['cm'],
        },
        next: null,
      },
      'c3': {
        id: 'c3',
        opcode: 'control_if_else',
        inputs: {
          CONDITION: [2, 'cond1'],
          SUBSTACK: [2, 'if_body'],
          SUBSTACK2: [2, 'else_body'],
        },
        next: null,
      },
      'cond1': {
        id: 'cond1',
        opcode: 'flippersensors_isColor',
        inputs: {
          PORT: [1, [4, 'C']],
          VALUE: [1, [4, '9']], // '9' is red
        },
      },
      'if_body': {
        id: 'if_body',
        opcode: 'flippermove_stopMove',
        inputs: {},
        next: null,
      },
      'else_body': {
        id: 'else_body',
        opcode: 'control_wait',
        inputs: {
          DURATION: [1, [4, '0.5']],
        },
        next: null,
      },
    };

    const result = SpikeScratchImporter.transpileBlocks(syntheticBlocks, 'Control Logic');

    expect(result.pythonCode).toContain('wait_for_seconds(1.5)');
    expect(result.pythonCode).toContain('for _ in range(3):');
    expect(result.pythonCode).toContain("    motors.move(10, 'cm')");
    expect(result.pythonCode).toContain("color_c = ColorSensor('C')");
    expect(result.pythonCode).toContain("if color_c.get_color() == 'red':");
    expect(result.pythonCode).toContain('    motors.stop()');
    expect(result.pythonCode).toContain('else:');
    expect(result.pythonCode).toContain('    wait_for_seconds(0.5)');

    // Visual blocks hierarchy checks
    const repeatBlock = result.visualBlocks.find((b) => b.opcode === 'control_repeat');
    expect(repeatBlock).toBeDefined();
    expect(repeatBlock?.children?.length).toBe(1);
    expect(repeatBlock?.children?.[0].opcode).toBe('flippermove_move');

    const ifElseBlock = result.visualBlocks.find((b) => b.opcode === 'control_if_else');
    expect(ifElseBlock).toBeDefined();
    expect(ifElseBlock?.children?.length).toBe(1);
    expect(ifElseBlock?.elseChildren?.length).toBe(1);
  });

  it('verifies all SAMPLE_MISSIONS have populated visualBlocks for instant display', () => {
    for (const [key, mission] of Object.entries(SAMPLE_MISSIONS)) {
      expect(mission.visualBlocks).toBeDefined();
      expect(mission.visualBlocks!.length).toBeGreaterThan(0);
      expect(mission.visualBlocks![0].opcode).toContain('whenprogramstarts');
      expect(mission.visualBlocks![0].category).toBe('event');
    }
  });
});
