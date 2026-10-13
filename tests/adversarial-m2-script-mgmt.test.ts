import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SimulatorHud,
  sanitizeScriptTitle,
  createDefaultTab,
  DEFAULT_SCRIPT_TEMPLATE,
  ScriptTab,
} from '../src/ui/hud';
import { SAMPLE_MISSIONS } from '../src/runtime/sample-missions';

describe('Adversarial M2 Script Management Stress Tests', () => {
  describe('1. sanitizeScriptTitle edge cases', () => {
    it('handles null, undefined, empty string', () => {
      expect(sanitizeScriptTitle(null as any)).toBe('Script 1');
      expect(sanitizeScriptTitle(undefined as any)).toBe('Script 1');
      expect(sanitizeScriptTitle('')).toBe('Script 1');
      expect(sanitizeScriptTitle('   ')).toBe('Script 1');
    });

    it('custom fallback when input is empty or whitespace', () => {
      expect(sanitizeScriptTitle('', 'Fallback Title')).toBe('Fallback Title');
      expect(sanitizeScriptTitle('   \t\n   ', 'Fallback Title')).toBe('Fallback Title');
    });

    it('strips illegal characters /[<>:"/\\\\|?*]/g', () => {
      const malicious = '<script>alert("x")</script>:path\\file*?';
      const clean = sanitizeScriptTitle(malicious);
      expect(clean).not.toMatch(/[<>:"/\\|?*]/);
      expect(clean).toBe('scriptalert(x)scriptpathfile');
    });

    it('strictly clamps titles longer than 40 characters', () => {
      const fiftyA = 'A'.repeat(50);
      const cleaned = sanitizeScriptTitle(fiftyA);
      expect(cleaned.length).toBe(40);
      expect(cleaned).toBe('A'.repeat(40));
    });

    it('preserves unicode, emojis, and normal punctuation', () => {
      const title = 'Mission 🚀 #1 - (Final) & Good!';
      expect(sanitizeScriptTitle(title)).toBe('Mission 🚀 #1 - (Final) & Good!');
    });
  });

  describe('2. createDefaultTab integrity', () => {
    it('creates pristine tab with default starter Python code and kind=python', () => {
      const tab = createDefaultTab('Starter Script');
      expect(tab.title).toBe('Starter Script');
      expect(tab.kind).toBe('python');
      expect(tab.readOnlyBlocks).toBe(false);
      expect(tab.visualBlocks).toEqual([]);
      expect(tab.code).toContain('from spike import PrimeHub, MotorPair');
      expect(tab.code).toContain('hub = PrimeHub()');
      expect(tab.code).toContain('motors = MotorPair');
    });
  });

  describe('3. Tab navigation & boundary safety on SimulatorHud prototype', () => {
    let mockHud: any;

    beforeEach(() => {
      mockHud = {
        scriptTabs: [
          { id: 'tab_0', title: 'Script 0', code: 'code 0', kind: 'python', readOnlyBlocks: false },
          { id: 'tab_1', title: 'Script 1', code: 'code 1', kind: 'blocks', readOnlyBlocks: false, _blocksBaselineCode: 'code 1', visualBlocks: [{ id: 'b1', opcode: 'run', params: { speed: 50 } }] },
          { id: 'tab_2', title: 'Script 2', code: 'code 2', kind: 'python', readOnlyBlocks: false },
        ],
        activeTabIndex: 1,
        codeTextarea: { value: 'code 1' },
        popoutTextarea: { value: 'code 1' },
        topbarProgramSelect: { value: 'tab_1' },
        editorViewMode: 'python',
        openScriptTab: SimulatorHud.prototype.openScriptTab,
        switchScriptTab: SimulatorHud.prototype.switchScriptTab,
        closeScriptTab: SimulatorHud.prototype.closeScriptTab,
        renameScriptTab: SimulatorHud.prototype.renameScriptTab,
        duplicateScriptTab: SimulatorHud.prototype.duplicateScriptTab,
        toggleScriptsManagerPopover: SimulatorHud.prototype.toggleScriptsManagerPopover,
        renderScriptsManagerPopover: SimulatorHud.prototype.renderScriptsManagerPopover,
        revertBlocksEdits: SimulatorHud.prototype.revertBlocksEdits,
        updatePaletteAvailability: SimulatorHud.prototype.updatePaletteAvailability,
        showBlocksReadOnlyBanner: vi.fn(),
        renderScriptTabs: vi.fn(),
        renderVisualBlocks: vi.fn(),
        updateTopbarProgramSelect: vi.fn(),
        saveScriptTabsToStorage: vi.fn(),
        logConsole: vi.fn(),
      };
    });

    it('switchScriptTab ignores negative, out-of-bounds, and identical indices', () => {
      mockHud.switchScriptTab(-1);
      expect(mockHud.activeTabIndex).toBe(1);

      mockHud.switchScriptTab(99);
      expect(mockHud.activeTabIndex).toBe(1);

      mockHud.switchScriptTab(1); // identical
      expect(mockHud.activeTabIndex).toBe(1);
    });

    it('switchScriptTab saves unsaved edits of departing tab and loads arriving tab code', () => {
      mockHud.codeTextarea.value = 'unsaved edits on tab 1';
      mockHud.switchScriptTab(2);

      expect(mockHud.scriptTabs[1].code).toBe('unsaved edits on tab 1');
      expect(mockHud.activeTabIndex).toBe(2);
      expect(mockHud.codeTextarea.value).toBe('code 2');
      expect(mockHud.topbarProgramSelect.value).toBe('tab_2');
    });

    it('closeScriptTab with invalid indices is safe no-op', () => {
      mockHud.closeScriptTab(-1, true);
      expect(mockHud.scriptTabs.length).toBe(3);

      mockHud.closeScriptTab(100, true);
      expect(mockHud.scriptTabs.length).toBe(3);
    });

    it('closeScriptTab correctly updates activeTabIndex when deleting preceding tab', () => {
      mockHud.activeTabIndex = 2; // on Script 2
      mockHud.closeScriptTab(0, true); // delete Script 0

      expect(mockHud.scriptTabs.length).toBe(2);
      expect(mockHud.activeTabIndex).toBe(1); // shifted
      expect(mockHud.scriptTabs[mockHud.activeTabIndex].title).toBe('Script 2');
    });

    it('closeScriptTab correctly clamps activeTabIndex when deleting the last item while it is active', () => {
      mockHud.activeTabIndex = 2; // on Script 2 (last item)
      mockHud.closeScriptTab(2, true);

      expect(mockHud.scriptTabs.length).toBe(2);
      expect(mockHud.activeTabIndex).toBe(1);
      expect(mockHud.scriptTabs[mockHud.activeTabIndex].title).toBe('Script 1');
    });

    it('closeScriptTab resets to clean blank script when closing final tab', () => {
      // Close tabs down to 1
      mockHud.closeScriptTab(0, true);
      mockHud.closeScriptTab(0, true);
      expect(mockHud.scriptTabs.length).toBe(1);

      // Now close final remaining tab
      mockHud.closeScriptTab(0, true);
      expect(mockHud.scriptTabs.length).toBe(1);
      expect(mockHud.activeTabIndex).toBe(0);
      expect(mockHud.scriptTabs[0].title).toBe('Script 1');
      expect(mockHud.scriptTabs[0].kind).toBe('python');
      expect(mockHud.scriptTabs[0].code).toContain('from spike import PrimeHub, MotorPair');
      expect(mockHud.codeTextarea.value).toContain('from spike import PrimeHub, MotorPair');
      expect(mockHud.scriptTabs[0].readOnlyBlocks).toBe(false);
    });

    it('duplicateScriptTab captures unsaved textarea edits and deep copies visual blocks', () => {
      mockHud.activeTabIndex = 1;
      mockHud.codeTextarea.value = 'active modified code on tab 1';

      mockHud.duplicateScriptTab(1);

      expect(mockHud.scriptTabs.length).toBe(4);
      expect(mockHud.activeTabIndex).toBe(2); // inserted immediately after idx 1
      expect(mockHud.scriptTabs[2].title).toBe('Script 1 (Copy)');
      expect(mockHud.scriptTabs[2].code).toBe('active modified code on tab 1');
      expect(mockHud.scriptTabs[2].kind).toBe('blocks');

      // Check deep cloning of visualBlocks
      expect(mockHud.scriptTabs[2].visualBlocks).toBeDefined();
      expect(mockHud.scriptTabs[2].visualBlocks).toEqual(mockHud.scriptTabs[1].visualBlocks);
      expect(mockHud.scriptTabs[2].visualBlocks).not.toBe(mockHud.scriptTabs[1].visualBlocks);

      // Mutating duplicate blocks does not alter source blocks
      mockHud.scriptTabs[2].visualBlocks[0].params.speed = 999;
      expect(mockHud.scriptTabs[1].visualBlocks[0].params.speed).toBe(50);
    });

    it('duplicateScriptTab ignores out of bounds index', () => {
      mockHud.duplicateScriptTab(-5);
      expect(mockHud.scriptTabs.length).toBe(3);

      mockHud.duplicateScriptTab(99);
      expect(mockHud.scriptTabs.length).toBe(3);
    });

    it('renameScriptTab sanitizes and clamps new title', () => {
      mockHud.renameScriptTab(0, '  <Bad>:"Name"*?|  ');
      expect(mockHud.scriptTabs[0].title).toBe('BadName');

      mockHud.renameScriptTab(0, 'A'.repeat(60));
      expect(mockHud.scriptTabs[0].title.length).toBe(40);

      mockHud.renameScriptTab(0, '   '); // fallback to existing or Script 1
      expect(mockHud.scriptTabs[0].title).toBe('A'.repeat(40));
    });

    it('revertBlocksEdits restores _blocksBaselineCode and unblocks readOnlyBlocks', () => {
      const tab1 = mockHud.scriptTabs[1];
      tab1.readOnlyBlocks = true;
      tab1.code = 'modified python code';
      mockHud.activeTabIndex = 1;

      mockHud.revertBlocksEdits();

      expect(tab1.readOnlyBlocks).toBe(false);
      expect(tab1.code).toBe('code 1');
      expect(mockHud.codeTextarea.value).toBe('code 1');
    });
  });

  describe('4. Palette guard & kind tracking', () => {
    let mockHud: any;

    beforeEach(() => {
      mockHud = {
        scriptTabs: [
          { id: 'tab_0', title: 'Python Tab', code: '', kind: 'python', readOnlyBlocks: false },
          { id: 'tab_1', title: 'Blocks Tab', code: '', kind: 'blocks', readOnlyBlocks: false, visualBlocks: [] },
          { id: 'tab_2', title: 'Locked Blocks Tab', code: '', kind: 'blocks', readOnlyBlocks: true, visualBlocks: [] },
        ],
        activeTabIndex: 0,
        codeTextarea: { value: '' },
        addBlockFromPalette: SimulatorHud.prototype.addBlockFromPalette,
        renderVisualBlocks: vi.fn(),
        renderPopoutVisualBlocks: vi.fn(),
        triggerAutosave: vi.fn(),
        logConsole: vi.fn(),
      };
    });

    it('addBlockFromPalette rejects insertion when tab kind is python', () => {
      mockHud.activeTabIndex = 0;
      mockHud.addBlockFromPalette({
        category: 'motor',
        opcode: 'run_for_degrees',
        icon: '⚙️',
        label: 'Run Motor',
        colorHex: '#0055ff',
        params: { port: 'A' },
        pythonSnippet: 'motor.run(360)',
      });

      expect(mockHud.scriptTabs[0].visualBlocks).toBeUndefined();
      expect(mockHud.logConsole).toHaveBeenCalledWith(expect.stringContaining('Cannot add Word Blocks to a Python script'));
    });

    it('addBlockFromPalette rejects insertion when tab is locked read-only', () => {
      mockHud.activeTabIndex = 2;
      mockHud.addBlockFromPalette({
        category: 'motor',
        opcode: 'run_for_degrees',
        icon: '⚙️',
        label: 'Run Motor',
        colorHex: '#0055ff',
        params: { port: 'A' },
        pythonSnippet: 'motor.run(360)',
      });

      expect(mockHud.scriptTabs[2].visualBlocks.length).toBe(0);
      expect(mockHud.logConsole).toHaveBeenCalledWith(expect.stringContaining('Word Blocks are read-only'));
    });

    it('addBlockFromPalette succeeds when tab is unlocked blocks script', () => {
      mockHud.activeTabIndex = 1;
      mockHud.addBlockFromPalette({
        category: 'motor',
        opcode: 'run_for_degrees',
        icon: '⚙️',
        label: 'Run Motor',
        colorHex: '#0055ff',
        params: { port: 'A' },
        pythonSnippet: 'motor.run(360)',
      });

      expect(mockHud.scriptTabs[1].visualBlocks.length).toBe(1);
      expect(mockHud.scriptTabs[1].visualBlocks[0].opcode).toBe('run_for_degrees');
      expect(mockHud.scriptTabs[1].code).toContain('motor.run(360)');
      expect(mockHud.scriptTabs[1]._blocksBaselineCode).toContain('motor.run(360)');
    });
  });

  describe('5. Scripts Manager popover rendering & HTML escaping', () => {
    it('escapes special characters in script title inside popover', () => {
      const mockList = { innerHTML: '', querySelectorAll: () => [] };
      const mockHud: any = {
        rootElement: {
          querySelector: (sel: string) => (sel === '#scripts-manager-list' ? mockList : null),
        },
        scriptTabs: [
          { id: 'tab_0', title: '<script>alert(1)</script> & "Dangerous"', code: '', kind: 'python' },
        ],
        activeTabIndex: 0,
        renderScriptsManagerPopover: SimulatorHud.prototype.renderScriptsManagerPopover,
      };

      mockHud.renderScriptsManagerPopover();

      expect(mockList.innerHTML).not.toContain('<script>alert(1)</script>');
      expect(mockList.innerHTML).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;Dangerous&quot;');
      expect(mockList.innerHTML).toContain('🐍 Python');
    });
  });
});
