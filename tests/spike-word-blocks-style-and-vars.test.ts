import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SimulatorHud, SAMPLE_MISSIONS, SPIKE_PALETTE_ITEMS } from '../src/ui/hud';

describe('LEGO SPIKE Prime Word Blocks Style, Categories, Variables & Controls', () => {
  const hudTsPath = path.resolve(__dirname, '../src/ui/hud.ts');
  const hudCssPath = path.resolve(__dirname, '../src/ui/hud.css');

  // =========================================================================
  // 1. Authentic 10 Categories & Saturated SPIKE Colors
  // =========================================================================
  describe('1. 10 Authentic SPIKE Categories & Color System', () => {
    it('defines all 10 official categories in the popout category sidebar markup', () => {
      const hudCode = fs.readFileSync(hudTsPath, 'utf-8');

      expect(hudCode).toContain('data-cat="motor"');
      expect(hudCode).toContain('data-cat="movement"');
      expect(hudCode).toContain('data-cat="light"');
      expect(hudCode).toContain('data-cat="sound"');
      expect(hudCode).toContain('data-cat="event"');
      expect(hudCode).toContain('data-cat="control"');
      expect(hudCode).toContain('data-cat="sensor"');
      expect(hudCode).toContain('data-cat="operator"');
      expect(hudCode).toContain('data-cat="variable"');
      expect(hudCode).toContain('data-cat="myblock"');
      expect(hudCode).toContain('class="spike-cat-extension-btn"');
    });

    it('styles category dots with authentic SPIKE hex values in CSS', () => {
      const cssCode = fs.readFileSync(hudCssPath, 'utf-8');

      expect(cssCode).toMatch(/\.cat-dot\.dot-motors\s*\{\s*background:\s*#0094f7;/);
      expect(cssCode).toMatch(/\.cat-dot\.dot-movement\s*\{\s*background:\s*#ed1587;/);
      expect(cssCode).toMatch(/\.cat-dot\.dot-light\s*\{\s*background:\s*#9966ff;/);
      expect(cssCode).toMatch(/\.cat-dot\.dot-sound\s*\{\s*background:\s*#d15fee;/);
      expect(cssCode).toMatch(/\.cat-dot\.dot-events\s*\{\s*background:\s*#ffbb00;/);
      expect(cssCode).toMatch(/\.cat-dot\.dot-control\s*\{\s*background:\s*#ffab19;/);
      expect(cssCode).toMatch(/\.cat-dot\.dot-sensors\s*\{\s*background:\s*#29b6f6;/);
      expect(cssCode).toMatch(/\.cat-dot\.dot-operators\s*\{\s*background:\s*#40bf4a;/);
      expect(cssCode).toMatch(/\.cat-dot\.dot-variables\s*\{\s*background:\s*#ff661a;/);
      expect(cssCode).toMatch(/\.cat-dot\.dot-myblocks\s*\{\s*background:\s*#ff4d6a;/);
    });
  });

  // =========================================================================
  // 2. Studio Canvas, Hub Badge & Puzzle Connectors
  // =========================================================================
  describe('2. Light Studio Canvas, Hub Badge & Jigsaw Connectors', () => {
    it('configures light studio canvas background and dot matrix pattern', () => {
      const cssCode = fs.readFileSync(hudCssPath, 'utf-8');

      expect(cssCode).toContain('background-color: #fafbfc;');
      expect(cssCode).toContain('radial-gradient(#cbd5e1 1.2px, transparent 1.2px);');
    });

    it('renders connected yellow Hub status badge in popout canvas', () => {
      const hudCode = fs.readFileSync(hudTsPath, 'utf-8');

      expect(hudCode).toContain('class="spike-hub-badge" id="spike-canvas-hub-badge"');
      expect(hudCode).toContain('class="hub-icon-dot"');
      expect(hudCode).toContain('class="hub-title"');
      expect(hudCode).toContain('class="hub-status-dot"');
    });

    it('styles jigsaw puzzle connectors (top notch cutout and bottom tab bump)', () => {
      const cssCode = fs.readFileSync(hudCssPath, 'utf-8');

      expect(cssCode).toContain('.word-block:not(.word-block-hat)::before');
      expect(cssCode).toContain('.word-block:not(.word-block-control-clamp)::after');
      expect(cssCode).toContain('.c-bottom-loop-icon');
    });
  });

  // =========================================================================
  // 3. Variables & Controls (Screenshot 3 Matching)
  // =========================================================================
  describe('3. Variables & Controls Integration', () => {
    it('provides Mission 5: Variables & Controls matching Screenshot 3', () => {
      const m5 = SAMPLE_MISSIONS.variables_and_controls;
      expect(m5).toBeDefined();
      expect(m5.title).toBe('Mission 5: Variables & Controls');

      // Python code includes loop and if check
      expect(m5.code).toContain('x = 0');
      expect(m5.code).toContain('for _ in range(10):');
      expect(m5.code).toContain('x += 1');
      expect(m5.code).toContain('if x < 100:');
      expect(m5.code).toContain('motors.start(0)');
      expect(m5.code).toContain('motors.stop()');

      // Visual blocks stack
      const blocks = m5.visualBlocks || [];
      expect(blocks.length).toBe(4); // hat, set x, repeat, stop all

      const hat = blocks[0];
      expect(hat.opcode).toBe('event_whenprogramstarts');

      const setVar = blocks[1];
      expect(setVar.opcode).toBe('data_setvariableto');
      expect(setVar.params.var).toBe('x');
      expect(setVar.params.value).toBe('0');
      expect(setVar.colorHex).toBe('#ff661a');

      const repeat = blocks[2];
      expect(repeat.opcode).toBe('control_repeat');
      expect(repeat.colorHex).toBe('#ffab19');
      expect(repeat.children?.length).toBe(2);

      const changeVar = repeat.children![0];
      expect(changeVar.opcode).toBe('data_changevariableby');
      expect(changeVar.params.var).toBe('x');
      expect(changeVar.params.value).toBe('1');

      const ifBlock = repeat.children![1];
      expect(ifBlock.opcode).toBe('control_if');
      expect(ifBlock.label).toContain('<(x) < (100)>');
      expect(ifBlock.children?.length).toBe(1);

      const move = ifBlock.children![0];
      expect(move.opcode).toBe('flippermove_startMove');

      const stopBlock = blocks[3];
      expect(stopBlock.opcode).toBe('control_stop');
    });

    it('formats variable and capsule pills correctly in formatBlockLabel', () => {
      const format = SimulatorHud.prototype.formatBlockLabel;

      // Variable pill (x)
      const rVar = format('change [x ▾] by (1)');
      expect(rVar).toContain('<span class="word-block-pill">x ▾</span>');
      expect(rVar).toContain('<span class="word-block-input-capsule">1</span>');

      // Nested condition hexagon containing variable capsule and input capsule
      const rIf = format('if <(x) < (100)> then');
      expect(rIf).toContain('<span class="word-block-pill pill-condition">');
      expect(rIf).toContain('<span class="word-block-var-pill">x</span>');
      expect(rIf).toContain('<span class="word-block-input-capsule">100</span>');
    });

    it('renders Make a Variable button, checkboxes, and reporter pills in palette drawer', () => {
      let drawerHtml = '';
      const mockDrawer: any = {
        set innerHTML(val: string) {
          drawerHtml = val;
        },
        get innerHTML() {
          return drawerHtml;
        },
        querySelector: vi.fn((sel: string) => {
          if (drawerHtml.includes(sel.replace('#', 'id="'))) {
            return { addEventListener: vi.fn() };
          }
          return null;
        }),
        querySelectorAll: vi.fn((sel: string) => {
          if (sel === '.spike-palette-block') return [];
          if (sel === '.spike-var-reporter-pill') {
            const matches = drawerHtml.match(/data-palette-var="([^"]+)"/g) || [];
            return matches.map((m) => {
              const varName = m.replace('data-palette-var="', '').replace('"', '');
              return {
                getAttribute: () => varName,
                textContent: varName,
                addEventListener: vi.fn(),
              };
            });
          }
          return [];
        }),
      };

      const mockHud: any = {
        rootElement: {
          querySelector: (sel: string) => (sel === '#spike-palette-drawer' ? mockDrawer : null),
        },
        activeSpikePaletteCategory: 'variable',
        userVariables: new Set(['x', 'score']),
        scriptTabs: [{ kind: 'blocks', visualBlocks: [] }],
        activeTabIndex: 0,
        renderSpikePalette: SimulatorHud.prototype.renderSpikePalette,
      };

      mockHud.renderSpikePalette();

      expect(drawerHtml).toContain('id="btn-make-variable"');
      expect(drawerHtml).toContain('id="btn-make-list"');
      expect(drawerHtml).toContain('class="spike-var-checkbox"');
      expect(drawerHtml).toContain('data-palette-var="x"');
      expect(drawerHtml).toContain('data-palette-var="score"');
    });

    it('supports bidirectional line-to-block mapping for variables and control structures', () => {
      const sample = SAMPLE_MISSIONS.variables_and_controls;
      const mockHud: any = {
        activeTabIndex: 0,
        scriptTabs: [
          {
            id: 'tab-vc',
            title: sample.title,
            code: sample.code,
            kind: 'blocks',
            visualBlocks: sample.visualBlocks,
          },
        ],
        codeTextarea: { value: sample.code },
        getActiveCode: () => sample.code,
        getBlockForLine: SimulatorHud.prototype.getBlockForLine,
        getLinesForBlock: SimulatorHud.prototype.getLinesForBlock,
        getAllVisualBlocks: (SimulatorHud.prototype as any).getAllVisualBlocks,
      };

      // Line 5: x = 0 -> maps to vc-set-x
      expect(mockHud.getBlockForLine(5)).toBe('vc-set-x');

      // Line 6: for _ in range(10): -> maps to vc-repeat
      expect(mockHud.getBlockForLine(6)).toBe('vc-repeat');

      // Line 7: x += 1 -> maps to vc-change-x
      expect(mockHud.getBlockForLine(7)).toBe('vc-change-x');

      // Line 8: if x < 100: -> maps to vc-if
      expect(mockHud.getBlockForLine(8)).toBe('vc-if');

      // Reverse mapping
      expect(mockHud.getLinesForBlock('vc-set-x')).toContain(5);
      expect(mockHud.getLinesForBlock('vc-change-x')).toContain(7);
      expect(mockHud.getLinesForBlock('vc-repeat')).toContain(6);
      expect(mockHud.getLinesForBlock('vc-if')).toContain(8);
    });
  });

  // =========================================================================
  // 4. Drag-and-Drop, Active Palette Unblocking & Interactive Parameter Editing
  // =========================================================================
  describe('4. Drag-and-Drop, Active Palette Unblocking & Interactive Parameter Editing', () => {
    it('creates new script tab with kind=blocks, default hat block, and active unblocked palette', () => {
      let drawerDisabledClass = false;
      let drawerDataDisabled = '';
      const mockDrawer: any = {
        classList: {
          toggle: (cls: string, val: boolean) => {
            if (cls === 'palette-disabled') drawerDisabledClass = val;
          },
          contains: (cls: string) => (cls === 'palette-disabled' ? drawerDisabledClass : false),
        },
        setAttribute: (attr: string, val: string) => {
          if (attr === 'data-disabled') drawerDataDisabled = val;
        },
        removeAttribute: vi.fn(),
      };

      const mockHud: any = {
        scriptTabs: [],
        activeTabIndex: 0,
        editorViewMode: 'blocks',
        rootElement: {
          querySelector: (sel: string) => (sel === '#spike-palette-drawer' ? mockDrawer : null),
        },
        openScriptTab(title: string, code: string, kind: string, visualBlocks?: any[]) {
          this.scriptTabs.push({
            id: `tab_${this.scriptTabs.length}`,
            title,
            code,
            kind,
            visualBlocks: visualBlocks || [],
            readOnlyBlocks: false,
          });
          this.activeTabIndex = this.scriptTabs.length - 1;
        },
        addNewScriptTab: SimulatorHud.prototype.addNewScriptTab,
        updatePaletteAvailability: SimulatorHud.prototype.updatePaletteAvailability,
      };

      // Create a new script in blocks mode
      mockHud.addNewScriptTab();

      expect(mockHud.scriptTabs.length).toBe(1);
      const newTab = mockHud.scriptTabs[0];
      expect(newTab.kind).toBe('blocks');
      expect(newTab.visualBlocks.length).toBe(1);
      expect(newTab.visualBlocks[0].opcode).toBe('event_whenprogramstarts');

      // Verify palette availability
      mockHud.updatePaletteAvailability();
      expect(drawerDisabledClass).toBe(false);
      expect(drawerDataDisabled).toBe('false');
    });

    it('inserts dropped block into visualBlocks and synchronizes Python code via handleCanvasDrop', () => {
      const mockHud: any = {
        activeTabIndex: 0,
        scriptTabs: [
          {
            id: 'tab_0',
            title: 'Blocks Tab',
            code: '',
            kind: 'blocks',
            visualBlocks: [
              {
                id: 'hat_1',
                opcode: 'event_whenprogramstarts',
                category: 'event',
                icon: '🚩',
                label: 'when program starts',
                params: {},
                colorHex: '#ffbb00',
              },
            ],
            readOnlyBlocks: false,
          },
        ],
        codeTextarea: { value: '' },
        popoutTextarea: { value: '' },
        syncBlocksToPythonCode: SimulatorHud.prototype.syncBlocksToPythonCode,
        formatPythonForBlock: SimulatorHud.prototype.formatPythonForBlock,
        findBlockById: SimulatorHud.prototype.findBlockById,
        removeBlockById: SimulatorHud.prototype.removeBlockById,
        renderVisualBlocks: vi.fn(),
        renderPopoutVisualBlocks: vi.fn(),
        selectBlock: vi.fn(),
        triggerAutosave: vi.fn(),
        handleCanvasDrop: SimulatorHud.prototype.handleCanvasDrop,
      };

      // Simulate drop of move_cm block from palette
      const mockEvent: any = {
        preventDefault: vi.fn(),
        dataTransfer: {
          getData: (format: string) => (format === 'text/plain' ? 'move_cm' : ''),
        },
        clientX: 100,
        clientY: 100,
      };

      mockHud.handleCanvasDrop(mockEvent, {} as HTMLElement);

      expect(mockHud.scriptTabs[0].visualBlocks.length).toBe(2);
      const droppedBlock = mockHud.scriptTabs[0].visualBlocks[1];
      expect(droppedBlock.opcode).toBe('motors.move_cm');
      expect(droppedBlock.label).toContain('move');

      // Verify synchronized Python code
      expect(mockHud.scriptTabs[0].code).toContain("motors = MotorPair('A', 'B')");
      expect(mockHud.scriptTabs[0].code).toContain("motors.move(10, 'cm')");
      expect(mockHud.codeTextarea.value).toContain("motors.move(10, 'cm')");
    });

    it('interactively updates numeric parameters and regenerates synced Python code', () => {
      const mockTab = {
        id: 'tab_0',
        title: 'Mission Test',
        code: '',
        kind: 'blocks',
        visualBlocks: [
          {
            id: 'hat_1',
            opcode: 'event_whenprogramstarts',
            category: 'event',
            icon: '🚩',
            label: 'when program starts',
            params: {},
            colorHex: '#ffbb00',
          },
          {
            id: 'blk_move',
            opcode: 'motors.move_cm',
            category: 'movement',
            icon: '🚀',
            label: 'move [↑ ▾] for (10) [cm ▾]',
            colorHex: '#ed1587',
            params: { dir: 'straight', amount: '10', unit: 'cm' },
          },
        ],
        readOnlyBlocks: false,
      };

      const mockHud: any = {
        activeTabIndex: 0,
        scriptTabs: [mockTab],
        codeTextarea: { value: '' },
        popoutTextarea: { value: '' },
        syncBlocksToPythonCode: SimulatorHud.prototype.syncBlocksToPythonCode,
        formatPythonForBlock: SimulatorHud.prototype.formatPythonForBlock,
        updateBlockParamValue: SimulatorHud.prototype.updateBlockParamValue,
        renderVisualBlocks: vi.fn(),
        renderPopoutVisualBlocks: vi.fn(),
        triggerAutosave: vi.fn(),
      };

      // Change distance from 10 to 45 cm
      const blockToEdit = mockTab.visualBlocks[1];
      mockHud.updateBlockParamValue(blockToEdit, '10', '45', 'input');

      expect(blockToEdit.label).toBe('move [↑ ▾] for (45) [cm ▾]');
      expect(blockToEdit.params.amount).toBe('45');
      expect(mockTab.code).toContain("motors.move(45, 'cm')");
      expect(mockHud.codeTextarea.value).toContain("motors.move(45, 'cm')");
    });

    it('interactively updates variable selections and regenerates synced Python code', () => {
      const mockTab = {
        id: 'tab_0',
        title: 'Variables Test',
        code: '',
        kind: 'blocks',
        visualBlocks: [
          {
            id: 'blk_var',
            opcode: 'data_setvariableto',
            category: 'variable',
            icon: '📦',
            label: 'set [x ▾] to (0)',
            colorHex: '#ff661a',
            params: { var: 'x', value: '0' },
          },
        ],
        readOnlyBlocks: false,
      };

      const mockHud: any = {
        activeTabIndex: 0,
        scriptTabs: [mockTab],
        codeTextarea: { value: '' },
        popoutTextarea: { value: '' },
        syncBlocksToPythonCode: SimulatorHud.prototype.syncBlocksToPythonCode,
        formatPythonForBlock: SimulatorHud.prototype.formatPythonForBlock,
        updateBlockParamValue: SimulatorHud.prototype.updateBlockParamValue,
        renderVisualBlocks: vi.fn(),
        renderPopoutVisualBlocks: vi.fn(),
        triggerAutosave: vi.fn(),
      };

      // Change variable from x to score, and value from 0 to 100
      const varBlock = mockTab.visualBlocks[0];
      mockHud.updateBlockParamValue(varBlock, 'x', 'score', 'var');
      mockHud.updateBlockParamValue(varBlock, '0', '100', 'input');

      expect(varBlock.label).toBe('set [score ▾] to (100)');
      expect(varBlock.params.var).toBe('score');
      expect(varBlock.params.value).toBe('100');
      expect(mockTab.code).toContain('score = 100');
    });

    it('interactively updates motor port selections and regenerates synced Python code', () => {
      const mockTab = {
        id: 'tab_0',
        title: 'Motor Test',
        code: '',
        kind: 'blocks',
        visualBlocks: [
          {
            id: 'blk_motor',
            opcode: 'motor.run_for_degrees',
            category: 'motor',
            icon: '⚙️',
            label: '[A ▾] run [↻ ▾] for (360) degrees',
            colorHex: '#0094f7',
            params: { port: 'A', dir: 'clockwise', amount: '360', unit: 'degrees' },
          },
        ],
        readOnlyBlocks: false,
      };

      const mockHud: any = {
        activeTabIndex: 0,
        scriptTabs: [mockTab],
        codeTextarea: { value: '' },
        popoutTextarea: { value: '' },
        syncBlocksToPythonCode: SimulatorHud.prototype.syncBlocksToPythonCode,
        formatPythonForBlock: SimulatorHud.prototype.formatPythonForBlock,
        updateBlockParamValue: SimulatorHud.prototype.updateBlockParamValue,
        renderVisualBlocks: vi.fn(),
        renderPopoutVisualBlocks: vi.fn(),
        triggerAutosave: vi.fn(),
      };

      // Change motor port from A to E (aux arm)
      const motorBlock = mockTab.visualBlocks[0];
      mockHud.updateBlockParamValue(motorBlock, 'A', 'E', 'select');

      expect(motorBlock.label).toBe('[E ▾] run [↻ ▾] for (360) degrees');
      expect(motorBlock.params.port).toBe('E');
      expect(mockTab.code).toContain("motor_e = Motor('E')");
      expect(mockTab.code).toContain("motor_e.run_for_degrees(360, 'clockwise')");
    });
  });
});
