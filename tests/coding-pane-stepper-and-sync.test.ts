import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SimulatorHud, SAMPLE_MISSIONS } from '../src/ui/hud';

describe('Coding Pane Stepper Debugger & Word Block Sync Suite', () => {
  const hudTsPath = path.resolve(__dirname, '../src/ui/hud.ts');
  const hudCssPath = path.resolve(__dirname, '../src/ui/hud.css');

  describe('1. Static Markup & CSS Verification', () => {
    it('verifies stop button is hidden and step buttons exist in Topbar, Drawer, and Popout', () => {
      const hudCode = fs.readFileSync(hudTsPath, 'utf-8');

      // Topbar step and stop buttons
      expect(hudCode).toContain('id="btn-topbar-step"');
      expect(hudCode).toContain('id="btn-topbar-stop" class="btn btn-sm btn-danger" style="display: none;"');

      // Drawer step and stop buttons
      expect(hudCode).toContain('id="btn-step"');
      expect(hudCode).toContain('id="btn-stop" class="btn btn-danger" style="display: none;"');

      // Popout step and stop buttons
      expect(hudCode).toContain('id="btn-popout-step"');
      expect(hudCode).toContain('id="btn-popout-stop" class="btn btn-sm btn-danger" style="display: none;"');

      // Interactive lines views
      expect(hudCode).toContain('id="python-interactive-lines"');
      expect(hudCode).toContain('id="popout-python-interactive-lines"');
    });

    it('verifies CSS rules for line stepping, block glow, badges, and step buttons', () => {
      const cssCode = fs.readFileSync(hudCssPath, 'utf-8');

      expect(cssCode).toContain('.btn-step');
      expect(cssCode).toContain('.python-code-view');
      expect(cssCode).toContain('.python-interactive-lines');
      expect(cssCode).toContain('.code-line-row.line-executing');
      expect(cssCode).toContain('.code-line-row.line-selected');
      expect(cssCode).toContain('.word-block.word-block-executing');
      expect(cssCode).toContain('.word-block.word-block-selected');
      expect(cssCode).toContain('.word-block-exec-badge');
      expect(cssCode).toContain('.badge-app');
      expect(cssCode).toContain('.badge-program');
      expect(cssCode).toContain('.badge-sensors');
    });
  });

  describe('2. Stepper & Execution State Transitions', () => {
    let mockHud: any;
    let mockCallbacks: any;

    beforeEach(() => {
      const runBtn = { textContent: '▶ RUN', disabled: false, classList: { remove: vi.fn(), add: vi.fn() }, title: '' };
      const topbarRunBtn = { textContent: '▶ RUN', disabled: false, classList: { remove: vi.fn(), add: vi.fn() }, title: '' };
      const stepBtn = { disabled: false };
      const topbarStepBtn = { disabled: false };
      const stopBtn = { disabled: true };
      const topbarStopBtn = { disabled: true };
      const statusBadge = { textContent: 'IDLE' };
      const dot = { className: 'status-dot', classList: { add: vi.fn(), remove: vi.fn() } };

      mockCallbacks = {
        onRunScript: vi.fn(),
        onPauseScript: vi.fn(),
        onResumeScript: vi.fn(),
        onStepScript: vi.fn(),
        onStopScript: vi.fn(),
        onResetRobot: vi.fn(),
        onResetMission: vi.fn(),
      };

      mockHud = {
        callbacks: mockCallbacks,
        executionState: 'IDLE',
        executingLine: null,
        selectedLine: null,
        selectedBlockId: null,
        activeTabIndex: 0,
        scriptTabs: [
          {
            id: 'tab-1',
            title: 'Mission 1',
            code: 'motors.move(30, "cm")\nmotors.stop()',
            kind: 'python',
          },
        ],
        runBtn,
        topbarRunBtn,
        stepBtn,
        topbarStepBtn,
        stopBtn,
        topbarStopBtn,
        statusBadge,
        codeTextarea: { value: 'motors.move(30, "cm")\nmotors.stop()' },
        popoutTextarea: null,
        isPopoutCodeEditorOpen: false,
        matchTimerRunning: false,
        telemDockCollapsed: true,
        rootElement: {
          querySelector: vi.fn((sel: string) => {
            if (sel === '#exec-status-dot') return dot;
            if (sel === '#btn-popout-run') return null;
            if (sel === '#btn-popout-step') return null;
            if (sel === '#btn-popout-stop') return null;
            if (sel === '#python-interactive-lines') return null;
            if (sel === '#popout-python-interactive-lines') return null;
            return null;
          }),
          querySelectorAll: vi.fn(() => []),
        },
        logConsole: vi.fn(),
        logCommand: vi.fn(),
        resetMatchTimer: vi.fn(),
        applyDockCollapsed: vi.fn(),
        setTelemetryTab: vi.fn(),
        applyLogFilter: vi.fn(),
        renderPythonInteractiveLines: vi.fn(),
        clearExecutingLine: SimulatorHud.prototype.clearExecutingLine,
        setExecutingLine: SimulatorHud.prototype.setExecutingLine,
        selectLine: SimulatorHud.prototype.selectLine,
        selectBlock: SimulatorHud.prototype.selectBlock,
        setExecutionState: SimulatorHud.prototype.setExecutionState,
        triggerRunScript: SimulatorHud.prototype.triggerRunScript,
        triggerStepScript: SimulatorHud.prototype.triggerStepScript,
        triggerStopScript: SimulatorHud.prototype.triggerStopScript,
        triggerReset: SimulatorHud.prototype.triggerReset,
        getActiveCode: SimulatorHud.prototype.getActiveCode,
        openTelemetryDockLogs: SimulatorHud.prototype.openTelemetryDockLogs,
        getBlockForLine: SimulatorHud.prototype.getBlockForLine,
        getLinesForBlock: SimulatorHud.prototype.getLinesForBlock,
        getAllVisualBlocks: (SimulatorHud.prototype as any).getAllVisualBlocks,
        escapeHtml: (SimulatorHud.prototype as any).escapeHtml,
      };
    });

    it('setExecutionState("RUNNING") sets button to ⏸ PAUSE and disables Step button', () => {
      mockHud.setExecutionState('RUNNING');
      expect(mockHud.executionState).toBe('RUNNING');
      expect(mockHud.runBtn.textContent).toBe('⏸ PAUSE');
      expect(mockHud.topbarRunBtn.textContent).toBe('⏸ PAUSE');
      expect(mockHud.stepBtn.disabled).toBe(true);
      expect(mockHud.topbarStepBtn.disabled).toBe(true);
    });

    it('setExecutionState("PAUSED") sets button to ▶ RESUME and enables Step button', () => {
      mockHud.setExecutionState('PAUSED');
      expect(mockHud.executionState).toBe('PAUSED');
      expect(mockHud.runBtn.textContent).toBe('▶ RESUME');
      expect(mockHud.topbarRunBtn.textContent).toBe('▶ RESUME');
      expect(mockHud.stepBtn.disabled).toBe(false);
      expect(mockHud.topbarStepBtn.disabled).toBe(false);
    });

    it('triggerRunScript toggles between RUNNING and PAUSED', () => {
      // 1. From IDLE -> starts running
      mockHud.triggerRunScript();
      expect(mockCallbacks.onRunScript).toHaveBeenCalledWith('motors.move(30, "cm")\nmotors.stop()');
      expect(mockHud.executionState).toBe('RUNNING');

      // 2. From RUNNING -> pauses
      mockHud.triggerRunScript();
      expect(mockCallbacks.onPauseScript).toHaveBeenCalledTimes(1);
      expect(mockHud.executionState).toBe('PAUSED');

      // 3. From PAUSED -> resumes
      mockHud.triggerRunScript();
      expect(mockCallbacks.onResumeScript).toHaveBeenCalledTimes(1);
      expect(mockHud.executionState).toBe('RUNNING');
    });

    it('triggerStepScript steps single instruction when PAUSED', () => {
      mockHud.executionState = 'PAUSED';
      mockHud.triggerStepScript();
      expect(mockCallbacks.onStepScript).toHaveBeenCalledTimes(1);
    });

    it('triggerStepScript starts in step mode when IDLE', () => {
      mockHud.executionState = 'IDLE';
      mockHud.triggerStepScript();
      expect(mockCallbacks.onStepScript).toHaveBeenCalledWith('motors.move(30, "cm")\nmotors.stop()');
      expect(mockHud.executionState).toBe('PAUSED');
    });

    it('triggerReset resets robot, field, clears highlights and sets state to IDLE', () => {
      mockHud.executingLine = 3;
      mockHud.executionState = 'RUNNING';

      mockHud.triggerReset();

      expect(mockCallbacks.onStopScript).toHaveBeenCalledTimes(1);
      expect(mockCallbacks.onResetRobot).toHaveBeenCalledTimes(1);
      expect(mockCallbacks.onResetMission).toHaveBeenCalledTimes(1);
      expect(mockHud.executingLine).toBeNull();
      expect(mockHud.executionState).toBe('IDLE');
    });

    it('openTelemetryDockLogs expands dock and switches to logs with given filter', () => {
      mockHud.openTelemetryDockLogs('PROGRAM');

      expect(mockHud.telemDockCollapsed).toBe(false);
      expect(mockHud.applyDockCollapsed).toHaveBeenCalledTimes(1);
      expect(mockHud.setTelemetryTab).toHaveBeenCalledWith('logs');
      expect(mockHud.applyLogFilter).toHaveBeenCalledWith('PROGRAM');
    });
  });

  describe('3. Word Block <-> Python Bidirectional Mapping Engine', () => {
    let mockHud: any;

    beforeEach(() => {
      const sample = SAMPLE_MISSIONS.drive_straight;
      mockHud = {
        activeTabIndex: 0,
        scriptTabs: [
          {
            id: 'tab-sample',
            title: sample.title,
            code: sample.code,
            kind: 'blocks',
            visualBlocks: sample.visualBlocks,
          },
        ],
        codeTextarea: { value: sample.code },
        popoutTextarea: null,
        isPopoutCodeEditorOpen: false,
        getActiveCode: SimulatorHud.prototype.getActiveCode,
        getBlockForLine: SimulatorHud.prototype.getBlockForLine,
        getLinesForBlock: SimulatorHud.prototype.getLinesForBlock,
        getAllVisualBlocks: (SimulatorHud.prototype as any).getAllVisualBlocks,
      };
    });

    it('correctly maps Python lines to Word Blocks in Drive Straight', () => {
      // Line 8: motors.move(30, 'cm') -> 'ds-move'
      const moveBlockId = mockHud.getBlockForLine(8);
      expect(moveBlockId).toBe('ds-move');

      // Line 6: motors.set_default_speed(50) -> 'ds-spd'
      const speedBlockId = mockHud.getBlockForLine(6);
      expect(speedBlockId).toBe('ds-spd');

      // Line 4: motors = MotorPair('A', 'B') -> 'ds-pair'
      const pairBlockId = mockHud.getBlockForLine(4);
      expect(pairBlockId).toBe('ds-pair');

      // Line 1: from spike... -> 'ds-hat'
      const hatBlockId = mockHud.getBlockForLine(1);
      expect(hatBlockId).toBe('ds-hat');
    });

    it('correctly maps Word Blocks to Python lines in Drive Straight', () => {
      const moveLines = mockHud.getLinesForBlock('ds-move');
      expect(moveLines).toContain(8);

      const spdLines = mockHud.getLinesForBlock('ds-spd');
      expect(spdLines).toContain(6);

      const pairLines = mockHud.getLinesForBlock('ds-pair');
      expect(pairLines).toContain(4);

      const hatLines = mockHud.getLinesForBlock('ds-hat');
      expect(hatLines.length).toBeGreaterThan(0);
    });

    it('handles nested blocks in loops/conditionals via getAllVisualBlocks', () => {
      const nestedBlocks = [
        {
          id: 'b-loop',
          opcode: 'control_repeat',
          category: 'control',
          children: [
            { id: 'b-inner-1', opcode: 'flippermove_move', category: 'movement', params: { value: '10' } },
            { id: 'b-inner-2', opcode: 'motion_wait', category: 'control' },
          ],
        },
      ];

      const all = (SimulatorHud.prototype as any).getAllVisualBlocks(nestedBlocks);
      expect(all.length).toBe(3);
      expect(all.map((b: any) => b.id)).toEqual(['b-loop', 'b-inner-1', 'b-inner-2']);
    });
  });
});
