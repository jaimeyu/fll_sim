import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  sanitizeScriptTitle,
  createDefaultTab,
  DEFAULT_SCRIPT_TEMPLATE,
  SimulatorHud,
  ScriptTab,
} from '../src/ui/hud';

describe('Auditor Adversarial Stress Test Suite: Milestone 2 Script Management', () => {
  describe('Adversarial 1: Title Sanitization & Length Clamping Edge Cases', () => {
    it('strips dangerous path traversal and shell characters', () => {
      const malicious = '../../../etc/passwd:?*<>';
      const sanitized = sanitizeScriptTitle(malicious, 'Fallback');
      expect(sanitized).toBe('......etcpasswd');
      expect(sanitized).not.toMatch(/[<>:"/\\|?*]/);
    });

    it('clamps titles exceeding 40 characters without corruption', () => {
      const longTitle = 'A'.repeat(100);
      const sanitized = sanitizeScriptTitle(longTitle);
      expect(sanitized.length).toBe(40);
      expect(sanitized).toBe('A'.repeat(40));
    });

    it('falls back to default title when sanitized string is whitespace or empty', () => {
      expect(sanitizeScriptTitle('   ', 'Custom Fallback')).toBe('Custom Fallback');
      expect(sanitizeScriptTitle('<>:"/\\|?*', 'Script 99')).toBe('Script 99');
      expect(sanitizeScriptTitle('', 'Default 1')).toBe('Default 1');
    });

    it('handles unicode, emojis, and non-ASCII titles cleanly', () => {
      const emojiTitle = '🚀 FLL Mission 1 (Submerged)';
      const sanitized = sanitizeScriptTitle(emojiTitle);
      expect(sanitized).toBe('🚀 FLL Mission 1 (Submerged)');
    });
  });

  describe('Adversarial 2: Tab Deletion Edge Cases & Zero-Tab Prevention', () => {
    let mockHud: any;

    beforeEach(() => {
      mockHud = {
        scriptTabs: [
          { id: 'tab_0', title: 'Script 1', code: 'print(1)', kind: 'python' },
          { id: 'tab_1', title: 'Script 2', code: 'print(2)', kind: 'python' },
          { id: 'tab_2', title: 'Script 3', code: 'print(3)', kind: 'python' },
        ],
        activeTabIndex: 2,
        codeTextarea: { value: 'print(3)' },
        popoutTextarea: { value: 'print(3)' },
        topbarProgramSelect: { value: 'tab_2' },
        renderScriptTabs: vi.fn(),
        updateTopbarProgramSelect: vi.fn(),
        renderScriptsManagerPopover: vi.fn(),
        saveScriptTabsToStorage: vi.fn(),
        showBlocksReadOnlyBanner: vi.fn(),
        updatePaletteAvailability: vi.fn(),
      };
      Object.setPrototypeOf(mockHud, SimulatorHud.prototype);
    });

    it('closing preceding tab correctly shifts activeTabIndex and maintains code consistency', () => {
      // Active is tab 2 (Script 3). Close tab 0 (Script 1).
      mockHud.closeScriptTab(0, true);
      expect(mockHud.scriptTabs.length).toBe(2);
      expect(mockHud.activeTabIndex).toBe(1);
      expect(mockHud.scriptTabs[mockHud.activeTabIndex].title).toBe('Script 3');
      expect(mockHud.codeTextarea.value).toBe('print(3)');
    });

    it('closing currently active tail tab clamps activeTabIndex to new tail', () => {
      // Active is tab 2 (Script 3). Close tab 2.
      mockHud.closeScriptTab(2, true);
      expect(mockHud.scriptTabs.length).toBe(2);
      expect(mockHud.activeTabIndex).toBe(1);
      expect(mockHud.scriptTabs[mockHud.activeTabIndex].title).toBe('Script 2');
      expect(mockHud.codeTextarea.value).toBe('print(2)');
    });

    it('closing tabs repeatedly down to zero resets to clean blank starter tab', () => {
      mockHud.closeScriptTab(0, true);
      mockHud.closeScriptTab(0, true);
      expect(mockHud.scriptTabs.length).toBe(1);
      expect(mockHud.activeTabIndex).toBe(0);

      // Now close the last remaining tab
      mockHud.closeScriptTab(0, true);
      expect(mockHud.scriptTabs.length).toBe(1);
      expect(mockHud.activeTabIndex).toBe(0);
      expect(mockHud.scriptTabs[0].title).toBe('Script 1');
      expect(mockHud.scriptTabs[0].kind).toBe('python');
      expect(mockHud.scriptTabs[0].code).toBe(DEFAULT_SCRIPT_TEMPLATE);
      expect(mockHud.codeTextarea.value).toBe(DEFAULT_SCRIPT_TEMPLATE);
    });

    it('out of bounds deletion calls do not mutate state', () => {
      mockHud.closeScriptTab(-1, true);
      mockHud.closeScriptTab(99, true);
      expect(mockHud.scriptTabs.length).toBe(3);
      expect(mockHud.activeTabIndex).toBe(2);
    });
  });

  describe('Adversarial 3: Unsaved Textarea Flushing on Tab Switch & Duplication', () => {
    let mockHud: any;

    beforeEach(() => {
      mockHud = {
        scriptTabs: [
          { id: 'tab_0', title: 'Script 1', code: 'initial code 1', kind: 'python' },
          { id: 'tab_1', title: 'Script 2', code: 'initial code 2', kind: 'python' },
        ],
        activeTabIndex: 0,
        codeTextarea: { value: 'MODIFIED UNSAVED CODE IN TAB 0' },
        popoutTextarea: { value: 'MODIFIED UNSAVED CODE IN TAB 0' },
        topbarProgramSelect: { value: 'tab_0' },
        renderScriptTabs: vi.fn(),
        updateTopbarProgramSelect: vi.fn(),
        renderScriptsManagerPopover: vi.fn(),
        saveScriptTabsToStorage: vi.fn(),
        showBlocksReadOnlyBanner: vi.fn(),
        updatePaletteAvailability: vi.fn(),
      };
      Object.setPrototypeOf(mockHud, SimulatorHud.prototype);
    });

    it('switchScriptTab flushes unsaved textarea buffer into departing tab', () => {
      mockHud.switchScriptTab(1);
      expect(mockHud.scriptTabs[0].code).toBe('MODIFIED UNSAVED CODE IN TAB 0');
      expect(mockHud.activeTabIndex).toBe(1);
      expect(mockHud.codeTextarea.value).toBe('initial code 2');
    });

    it('duplicateScriptTab captures unsaved textarea edits into duplicate tab', () => {
      mockHud.duplicateScriptTab(0);
      expect(mockHud.scriptTabs.length).toBe(3);
      expect(mockHud.activeTabIndex).toBe(1);
      expect(mockHud.scriptTabs[1].title).toBe('Script 1 (Copy)');
      expect(mockHud.scriptTabs[1].code).toBe('MODIFIED UNSAVED CODE IN TAB 0');
      expect(mockHud.scriptTabs[0].code).toBe('MODIFIED UNSAVED CODE IN TAB 0');
    });

    it('duplicateScriptTab isolates nested visualBlocks from mutation', () => {
      mockHud.scriptTabs[0].visualBlocks = [
        {
          id: 'blk_1',
          opcode: 'motor_run',
          category: 'motors',
          label: 'Run motor',
          colorHex: '#00ffff',
          params: { speed: 50, direction: 'forward' },
        },
      ];
      mockHud.scriptTabs[0].kind = 'blocks';

      mockHud.duplicateScriptTab(0);
      const originalBlock = mockHud.scriptTabs[0].visualBlocks[0];
      const duplicatedBlock = mockHud.scriptTabs[1].visualBlocks[0];

      expect(duplicatedBlock).toBeDefined();
      expect(duplicatedBlock).not.toBe(originalBlock); // distinct object reference
      expect(duplicatedBlock.params).not.toBe(originalBlock.params); // distinct params reference

      // Mutating duplicate params does not affect original
      duplicatedBlock.params.speed = 100;
      expect(originalBlock.params.speed).toBe(50);
    });
  });

  describe('Adversarial 4: Script Kind Protection & Read-Only Banner State', () => {
    let mockHud: any;

    beforeEach(() => {
      mockHud = {
        scriptTabs: [
          {
            id: 'tab_0',
            title: 'Blocks Program',
            code: 'hub.light_matrix.write("HI")',
            kind: 'blocks',
            visualBlocks: [],
            readOnlyBlocks: false,
            _blocksBaselineCode: 'hub.light_matrix.write("HI")',
          },
          {
            id: 'tab_1',
            title: 'Pure Python',
            code: 'print("hello world")',
            kind: 'python',
            visualBlocks: [],
            readOnlyBlocks: false,
          },
        ],
        activeTabIndex: 0,
        codeTextarea: { value: 'hub.light_matrix.write("HI")' },
        popoutTextarea: { value: 'hub.light_matrix.write("HI")' },
        rootElement: {
          querySelector: vi.fn().mockImplementation((sel: string) => {
            if (sel === '#spike-palette-drawer') {
              return {
                classList: { toggle: vi.fn() },
                setAttribute: vi.fn(),
                removeAttribute: vi.fn(),
              };
            }
            if (sel === '#banner-blocks-readonly') {
              return { style: { display: 'none' } };
            }
            return null;
          }),
        },
        logConsole: vi.fn(),
        renderVisualBlocks: vi.fn(),
        saveScriptTabsToStorage: vi.fn(),
      };
      Object.setPrototypeOf(mockHud, SimulatorHud.prototype);
    });

    it('rejects adding palette blocks to a python script', () => {
      mockHud.activeTabIndex = 1; // Pure Python tab
      const paletteItem: any = {
        category: 'motors',
        opcode: 'motor_run',
        label: 'Run Motor',
        colorHex: '#00ffff',
        params: {},
        pythonSnippet: 'motor.run()',
      };

      mockHud.addBlockFromPalette(paletteItem);
      expect(mockHud.scriptTabs[1].code).toBe('print("hello world")');
      expect(mockHud.logConsole).toHaveBeenCalledWith(
        expect.stringContaining('Cannot add Word Blocks to a Python script')
      );
    });

    it('rejects adding palette blocks when blocks are marked read-only', () => {
      mockHud.activeTabIndex = 0;
      mockHud.scriptTabs[0].readOnlyBlocks = true;

      const paletteItem: any = {
        category: 'motors',
        opcode: 'motor_run',
        label: 'Run Motor',
        colorHex: '#00ffff',
        params: {},
        pythonSnippet: 'motor.run()',
      };

      mockHud.addBlockFromPalette(paletteItem);
      expect(mockHud.logConsole).toHaveBeenCalledWith(
        expect.stringContaining('Word Blocks are read-only')
      );
    });

    it('revertBlocksEdits successfully restores baseline code and re-enables blocks', () => {
      mockHud.activeTabIndex = 0;
      mockHud.scriptTabs[0].code = 'COMPLETELY OVERWRITTEN PYTHON CODE';
      mockHud.scriptTabs[0].readOnlyBlocks = true;

      mockHud.revertBlocksEdits();

      expect(mockHud.scriptTabs[0].code).toBe('hub.light_matrix.write("HI")');
      expect(mockHud.scriptTabs[0].readOnlyBlocks).toBe(false);
      expect(mockHud.codeTextarea.value).toBe('hub.light_matrix.write("HI")');
      expect(mockHud.logConsole).toHaveBeenCalledWith(
        expect.stringContaining('Reverted manual Python edits')
      );
    });
  });

  describe('Adversarial 5: Scripts Manager Popover Item Actions & Escaping', () => {
    let mockHud: any;
    let listElement: any;

    beforeEach(() => {
      listElement = {
        innerHTML: '',
        querySelectorAll: vi.fn().mockReturnValue([]),
      };

      mockHud = {
        scriptTabs: [
          {
            id: 'tab_0',
            title: '<script>alert("xss")</script>',
            code: 'pass',
            kind: 'python',
          },
          {
            id: 'tab_1',
            title: 'Normal Tab & "Quotes"',
            code: 'pass',
            kind: 'blocks',
          },
        ],
        activeTabIndex: 0,
        rootElement: {
          querySelector: vi.fn().mockImplementation((sel: string) => {
            if (sel === '#scripts-manager-list') return listElement;
            return null;
          }),
        },
      };
      Object.setPrototypeOf(mockHud, SimulatorHud.prototype);
    });

    it('escapes HTML special characters in script titles to prevent DOM injection', () => {
      mockHud.renderScriptsManagerPopover();
      expect(listElement.innerHTML).not.toContain('<script>alert');
      expect(listElement.innerHTML).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      expect(listElement.innerHTML).toContain('Normal Tab &amp; &quot;Quotes&quot;');
    });

    it('renders correct kind badges for python and blocks', () => {
      mockHud.renderScriptsManagerPopover();
      expect(listElement.innerHTML).toContain('🐍 Python');
      expect(listElement.innerHTML).toContain('🧩 Word Blocks');
    });
  });
});
