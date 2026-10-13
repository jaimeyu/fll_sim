import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  SimulatorHud,
  SAMPLE_MISSIONS,
  createDefaultTab,
  sanitizeScriptTitle,
  DEFAULT_SCRIPT_TEMPLATE,
  ScriptTab,
  ScriptKind,
} from '../src/ui/hud';

describe('Adversarial Challenger Suite: Milestone 2 Script Management & Non-Destructive Loading', () => {
  let mockLocalStorage: Record<string, string>;

  beforeEach(() => {
    mockLocalStorage = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mockLocalStorage[k] || null,
      setItem: (k: string, v: string) => { mockLocalStorage[k] = v; },
      removeItem: (k: string) => { delete mockLocalStorage[k]; },
      clear: () => { mockLocalStorage = {}; },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Helper to build a functional mock Hud with simulated DOM and event listeners
  function createSimulatedHud() {
    const topbarSelect = {
      value: 'tab_0',
      innerHTML: '',
    };
    const sampleSelect = {
      value: '',
    };
    const textarea = {
      value: '# Starter User Script\nprint("Hello Robot")',
    };
    const popoutTextarea = {
      value: '# Starter User Script\nprint("Hello Robot")',
    };

    const hud: any = {
      scriptTabs: [
        {
          id: 'tab_0',
          title: 'Custom Script',
          code: textarea.value,
          kind: 'python',
          readOnlyBlocks: false,
        },
      ],
      activeTabIndex: 0,
      codeTextarea: textarea,
      popoutTextarea: popoutTextarea,
      topbarProgramSelect: topbarSelect,
      importedMissions: new Map<string, { title: string; code: string; visualBlocks?: any[] }>(),
      logConsole: vi.fn(),

      // Wire prototype methods
      openScriptTab: SimulatorHud.prototype.openScriptTab,
      switchScriptTab: SimulatorHud.prototype.switchScriptTab,
      closeScriptTab: SimulatorHud.prototype.closeScriptTab,
      renameScriptTab: SimulatorHud.prototype.renameScriptTab,
      duplicateScriptTab: SimulatorHud.prototype.duplicateScriptTab,
      updateTopbarProgramSelect: SimulatorHud.prototype.updateTopbarProgramSelect,
      renderScriptTabs: vi.fn(),
      renderVisualBlocks: vi.fn(),
      renderScriptsManagerPopover: vi.fn(),
      saveScriptTabsToStorage: vi.fn(),
      showBlocksReadOnlyBanner: vi.fn(),
      updatePaletteAvailability: vi.fn(),
    };

    // Simulated #sample-select change listener matching hud.ts lines 2591-2620
    hud.triggerSampleSelect = (val: string) => {
      sampleSelect.value = val;
      if (!val) return;

      if (hud.importedMissions.has(val)) {
        const imp = hud.importedMissions.get(val)!;
        const impTitle = imp.title.split('.')[0].trim();
        const existingIdx = hud.scriptTabs.findIndex((t: any) => t.title === impTitle || t.title === imp.title);
        if (existingIdx !== -1) {
          hud.switchScriptTab(existingIdx);
        } else {
          const kind: ScriptKind = imp.visualBlocks && imp.visualBlocks.length > 0 ? 'blocks' : 'python';
          hud.openScriptTab(impTitle, imp.code, kind, imp.visualBlocks);
        }
        hud.logConsole(`Loaded ${imp.title}`);
      } else {
        const selected = SAMPLE_MISSIONS[val];
        if (selected) {
          const sampleTitle = selected.title.split(':')[0].trim();
          const existingIdx = hud.scriptTabs.findIndex((t: any) => t.title === sampleTitle || t.title === selected.title);
          if (existingIdx !== -1) {
            hud.switchScriptTab(existingIdx);
          } else {
            const kind: ScriptKind = selected.visualBlocks && selected.visualBlocks.length > 0 ? 'blocks' : 'python';
            hud.openScriptTab(sampleTitle, selected.code, kind, selected.visualBlocks);
          }
          hud.logConsole(`Loaded ${selected.title}`);
        }
      }
    };

    // Simulated #topbar-program-select change listener matching hud.ts lines 2820-2855
    hud.triggerTopbarProgramSelect = (val: string) => {
      topbarSelect.value = val;
      if (!val || val === '---') return;

      if (val.startsWith('tab_')) {
        const idx = parseInt(val.replace('tab_', ''), 10);
        if (!isNaN(idx) && idx >= 0 && idx < hud.scriptTabs.length) {
          if (idx !== hud.activeTabIndex) {
            hud.switchScriptTab(idx);
          }
        }
      } else if (val.startsWith('sample_')) {
        const key = val.replace('sample_', '');
        const sample = SAMPLE_MISSIONS[key];
        if (sample) {
          const sampleTitle = sample.title.split(':')[0].trim();
          const existingIdx = hud.scriptTabs.findIndex((t: any) => t.title === sampleTitle || t.title === sample.title);
          if (existingIdx !== -1) {
            hud.switchScriptTab(existingIdx);
          } else {
            const kind: ScriptKind = sample.visualBlocks && sample.visualBlocks.length > 0 ? 'blocks' : 'python';
            hud.openScriptTab(sampleTitle, sample.code, kind, sample.visualBlocks);
          }
          hud.logConsole(`Loaded ${sample.title} into editor.`);
        }
      } else if (SAMPLE_MISSIONS[val]) {
        const sample = SAMPLE_MISSIONS[val];
        const sampleTitle = sample.title.split(':')[0].trim();
        const existingIdx = hud.scriptTabs.findIndex((t: any) => t.title === sampleTitle || t.title === sample.title);
        if (existingIdx !== -1) {
          hud.switchScriptTab(existingIdx);
        } else {
          const kind: ScriptKind = sample.visualBlocks && sample.visualBlocks.length > 0 ? 'blocks' : 'python';
          hud.openScriptTab(sampleTitle, sample.code, kind, sample.visualBlocks);
        }
        hud.logConsole(`Loaded ${sample.title} into editor.`);
      }
    };

    hud.updateTopbarProgramSelect();
    return { hud, topbarSelect, sampleSelect, textarea };
  }

  // =========================================================================
  // Challenge 1: Code Clobbering Stress Harness (F6, F7)
  // =========================================================================
  describe('Challenge 1: Non-Destructive Loading & Code Clobbering Stress Harness', () => {
    it('1.1: repeated selection of sample script 50 times never clobbers active code nor creates duplicate tabs', () => {
      const { hud, textarea } = createSimulatedHud();

      // Modify active tab 0 code with custom work
      const userCustomCode = '# IMPORTANT AUTONOMOUS MISSION\nmotors.move(100, "cm")\ngyro.reset()';
      textarea.value = userCustomCode;

      // 1st selection: opens "Mission 1"
      hud.triggerSampleSelect('drive_straight');
      expect(hud.scriptTabs.length).toBe(2);
      expect(hud.activeTabIndex).toBe(1);
      expect(hud.scriptTabs[0].code).toBe(userCustomCode);

      // User makes custom edits in Mission 1
      const mission1CustomCode = '# Mission 1 modified by user\nmotors.move(50, "cm")\nhub.speaker.beep()';
      textarea.value = mission1CustomCode;

      // Repeatedly select 'drive_straight' 50 times
      for (let i = 0; i < 50; i++) {
        hud.triggerSampleSelect('drive_straight');
        expect(hud.scriptTabs.length).toBe(2);
        expect(hud.activeTabIndex).toBe(1);
        expect(textarea.value).toBe(mission1CustomCode);
        expect(hud.scriptTabs[0].code).toBe(userCustomCode);
      }

      // Switch back to tab 0
      hud.switchScriptTab(0);
      expect(hud.activeTabIndex).toBe(0);
      expect(textarea.value).toBe(userCustomCode);

      // Re-trigger 'drive_straight' from tab 0: should switch to tab 1 without clobbering
      hud.triggerSampleSelect('drive_straight');
      expect(hud.scriptTabs.length).toBe(2);
      expect(hud.activeTabIndex).toBe(1);
      expect(textarea.value).toBe(mission1CustomCode);
      expect(hud.scriptTabs[0].code).toBe(userCustomCode);
    });

    it('1.2: round-robin interleaved switching across all sample missions preserves independent custom edits in all tabs', () => {
      const { hud, textarea } = createSimulatedHud();

      const sampleKeys = Object.keys(SAMPLE_MISSIONS);
      expect(sampleKeys.length).toBeGreaterThanOrEqual(2);

      // Open every sample mission and apply unique modifications
      const customCodeMap = new Map<string, string>();
      sampleKeys.forEach((key, idx) => {
        hud.triggerSampleSelect(key);
        const uniqueEdit = `# Custom edits for sample: ${key}\nstep = ${idx * 10}\nprint("running ${key}")`;
        textarea.value = uniqueEdit;
        customCodeMap.set(key, uniqueEdit);
      });

      const totalTabs = hud.scriptTabs.length;
      expect(totalTabs).toBe(sampleKeys.length + 1); // starter tab + sample tabs

      // Interleave switching in arbitrary order 40 times
      const testSequence = [
        ...sampleKeys,
        ...[...sampleKeys].reverse(),
        ...sampleKeys,
        ...[...sampleKeys].reverse(),
      ];

      testSequence.forEach((key) => {
        hud.triggerSampleSelect(key);
        const expectedCode = customCodeMap.get(key);
        expect(textarea.value).toBe(expectedCode);
      });

      // Total tab count must strictly remain unchanged
      expect(hud.scriptTabs.length).toBe(totalTabs);
    });

    it('1.3: repeated selection of imported scripts preserves user code and switches cleanly', () => {
      const { hud, textarea } = createSimulatedHud();

      const importId = 'imported_mission_alpha';
      const importCode = '# Imported Alpha Code\nfrom spike import PrimeHub\nhub = PrimeHub()';
      hud.importedMissions.set(importId, {
        title: 'Alpha Mission.py',
        code: importCode,
      });

      // Open imported mission
      hud.triggerSampleSelect(importId);
      expect(hud.scriptTabs.length).toBe(2);
      expect(hud.activeTabIndex).toBe(1);
      expect(textarea.value).toBe(importCode);

      // Modify imported code in editor
      const modifiedImportCode = importCode + '\n# Custom modification by team';
      textarea.value = modifiedImportCode;

      // Select it 20 times repeatedly
      for (let i = 0; i < 20; i++) {
        hud.triggerSampleSelect(importId);
        expect(hud.scriptTabs.length).toBe(2);
        expect(hud.activeTabIndex).toBe(1);
        expect(textarea.value).toBe(modifiedImportCode);
      }
    });

    it('1.4: topbarProgramSelect switching between tabs and samples preserves tab code integrity without clobbering', () => {
      const { hud, textarea, topbarSelect } = createSimulatedHud();

      textarea.value = '# Tab 0 original';

      // Select sample via topbar
      hud.triggerTopbarProgramSelect('sample_drive_straight');
      expect(hud.scriptTabs.length).toBe(2);
      expect(hud.activeTabIndex).toBe(1);

      textarea.value = '# Tab 1 custom modifications';

      // Switch back to tab_0 via topbar
      hud.triggerTopbarProgramSelect('tab_0');
      expect(hud.activeTabIndex).toBe(0);
      expect(topbarSelect.value).toBe('tab_0');
      expect(textarea.value).toBe('# Tab 0 original');

      // Switch back to tab_1 via topbar
      hud.triggerTopbarProgramSelect('tab_1');
      expect(hud.activeTabIndex).toBe(1);
      expect(topbarSelect.value).toBe('tab_1');
      expect(textarea.value).toBe('# Tab 1 custom modifications');

      // Verify Tab 0 was not clobbered
      expect(hud.scriptTabs[0].code).toBe('# Tab 0 original');
      expect(hud.scriptTabs[1].code).toBe('# Tab 1 custom modifications');
    });

    it('1.5: large scripts (15,000+ characters) are preserved without truncation during rapid switching', () => {
      const { hud, textarea } = createSimulatedHud();

      const massiveCode = '# MASSIVE SCRIPT\n' + 'motors.start(50)\nsensors.wait()\n'.repeat(500);
      textarea.value = massiveCode;

      hud.triggerSampleSelect('drive_straight');
      expect(hud.scriptTabs[0].code.length).toBe(massiveCode.length);
      expect(hud.scriptTabs[0].code).toBe(massiveCode);

      hud.switchScriptTab(0);
      expect(textarea.value.length).toBe(massiveCode.length);
      expect(textarea.value).toBe(massiveCode);
    });
  });

  // =========================================================================
  // Challenge 2: Dropdown Synchronization Invariants (F8)
  // =========================================================================
  describe('Challenge 2: Dropdown Value Synchronization Invariants', () => {
    function createSyncHud() {
      const topbarSelect = {
        value: '',
        innerHTML: '',
      };
      const textarea = { value: 'initial' };

      const hud: any = {
        scriptTabs: [createDefaultTab('Script 1')],
        activeTabIndex: 0,
        codeTextarea: textarea,
        topbarProgramSelect: topbarSelect,
        openScriptTab: SimulatorHud.prototype.openScriptTab,
        switchScriptTab: SimulatorHud.prototype.switchScriptTab,
        closeScriptTab: SimulatorHud.prototype.closeScriptTab,
        renameScriptTab: SimulatorHud.prototype.renameScriptTab,
        duplicateScriptTab: SimulatorHud.prototype.duplicateScriptTab,
        updateTopbarProgramSelect: SimulatorHud.prototype.updateTopbarProgramSelect,
        renderScriptTabs: vi.fn(),
        renderVisualBlocks: vi.fn(),
        renderScriptsManagerPopover: vi.fn(),
        saveScriptTabsToStorage: vi.fn(),
        showBlocksReadOnlyBanner: vi.fn(),
        updatePaletteAvailability: vi.fn(),
      };

      hud.updateTopbarProgramSelect();
      return { hud, topbarSelect };
    }

    it('2.1: invariant topbarProgramSelect.value === "tab_" + activeTabIndex holds after openScriptTab', () => {
      const { hud, topbarSelect } = createSyncHud();
      expect(topbarSelect.value).toBe('tab_0');

      for (let i = 1; i <= 10; i++) {
        hud.openScriptTab(`Script ${i + 1}`, `code_${i}`);
        expect(hud.activeTabIndex).toBe(i);
        expect(topbarSelect.value).toBe(`tab_${i}`);
      }
    });

    it('2.2: invariant holds during randomized traversal across 10 tabs via switchScriptTab', () => {
      const { hud, topbarSelect } = createSyncHud();

      for (let i = 1; i <= 9; i++) {
        hud.openScriptTab(`Tab ${i + 1}`, `code_${i}`);
      }
      expect(hud.scriptTabs.length).toBe(10);

      const traversal = [3, 0, 8, 2, 7, 1, 9, 4, 6, 5, 0, 9];
      traversal.forEach((targetIdx) => {
        hud.switchScriptTab(targetIdx);
        expect(hud.activeTabIndex).toBe(targetIdx);
        expect(topbarSelect.value).toBe(`tab_${targetIdx}`);
      });
    });

    it('2.3: invariant holds after duplicateScriptTab inserting into arbitrary positions', () => {
      const { hud, topbarSelect } = createSyncHud();

      hud.openScriptTab('Tab 2', 'code 2');
      hud.openScriptTab('Tab 3', 'code 3');
      expect(hud.scriptTabs.length).toBe(3);

      // Duplicate middle tab (index 1) -> new duplicate inserted at index 2
      hud.duplicateScriptTab(1);
      expect(hud.activeTabIndex).toBe(2);
      expect(topbarSelect.value).toBe('tab_2');
      expect(hud.scriptTabs[2].title).toBe('Tab 2 (Copy)');

      // Duplicate tail tab
      hud.duplicateScriptTab(hud.scriptTabs.length - 1);
      const tailIdx = hud.scriptTabs.length - 1;
      expect(hud.activeTabIndex).toBe(tailIdx);
      expect(topbarSelect.value).toBe(`tab_${tailIdx}`);
    });

    it('2.4: invariant holds after renameScriptTab with sanitization and HTML escaping', () => {
      const { hud, topbarSelect } = createSyncHud();

      // sanitizeScriptTitle strips illegal chars /[<>:"/\\|?*]/g, preserving &
      hud.renameScriptTab(0, 'Mission "Alpha" & <Beta>');
      expect(hud.scriptTabs[0].title).toBe('Mission Alpha & Beta');
      expect(topbarSelect.value).toBe('tab_0');
      // In option HTML, & is escaped to &amp;
      expect(topbarSelect.innerHTML).toContain('Mission Alpha &amp; Beta');
      expect(topbarSelect.innerHTML).not.toContain('<Beta>');

      // Directly assigned title with unescaped HTML characters is safely escaped in dropdown
      hud.scriptTabs[0].title = 'Direct <Dangerous> & "Quotes"';
      hud.updateTopbarProgramSelect();
      expect(topbarSelect.innerHTML).toContain('Direct &lt;Dangerous&gt; &amp; &quot;Quotes&quot;');
      expect(topbarSelect.innerHTML).not.toContain('<Dangerous>');
    });

    it('2.5: invariant holds after closing preceding tab, active tab, and tail tab', () => {
      const { hud, topbarSelect } = createSyncHud();

      // Setup 5 tabs
      for (let i = 1; i < 5; i++) {
        hud.openScriptTab(`Tab ${i + 1}`, `code ${i}`);
      }
      hud.switchScriptTab(3); // Active is index 3
      expect(hud.activeTabIndex).toBe(3);
      expect(topbarSelect.value).toBe('tab_3');

      // Close preceding tab at index 1 -> active index decrements to 2
      hud.closeScriptTab(1, true);
      expect(hud.activeTabIndex).toBe(2);
      expect(topbarSelect.value).toBe('tab_2');

      // Close active tab at index 2 -> clamps to new element at index 2
      hud.closeScriptTab(2, true);
      expect(hud.activeTabIndex).toBe(2);
      expect(topbarSelect.value).toBe('tab_2');

      // Close tail tab
      hud.closeScriptTab(hud.scriptTabs.length - 1, true);
      expect(hud.activeTabIndex).toBe(hud.scriptTabs.length - 1);
      expect(topbarSelect.value).toBe(`tab_${hud.activeTabIndex}`);
    });

    it('2.6: invariant holds after closing all tabs down to single tab reset', () => {
      const { hud, topbarSelect } = createSyncHud();

      hud.openScriptTab('Tab 2', 'code 2');
      hud.openScriptTab('Tab 3', 'code 3');

      // Close all tabs one by one
      while (hud.scriptTabs.length > 1) {
        hud.closeScriptTab(0, true);
      }
      expect(hud.scriptTabs.length).toBe(1);
      expect(hud.activeTabIndex).toBe(0);
      expect(topbarSelect.value).toBe('tab_0');

      // Close final remaining tab -> triggers F10 clean reset to 'Script 1'
      hud.closeScriptTab(0, true);
      expect(hud.scriptTabs.length).toBe(1);
      expect(hud.scriptTabs[0].title).toBe('Script 1');
      expect(hud.activeTabIndex).toBe(0);
      expect(topbarSelect.value).toBe('tab_0');
    });

    it('2.7: edge case observation: re-selecting already active sample in topbar does not re-sync unless active index changed', () => {
      const { hud, topbarSelect } = createSimulatedHud();

      // Select sample drive_straight
      hud.triggerTopbarProgramSelect('sample_drive_straight');
      expect(hud.scriptTabs.length).toBe(2);
      expect(hud.activeTabIndex).toBe(1);
      expect(topbarSelect.value).toBe('tab_1');

      // If user clicks the same sample in topbar again, browser sets topbarSelect.value to 'sample_drive_straight'.
      // Because existingIdx === activeTabIndex, switchScriptTab returns early.
      // We observe that topbarProgramSelect.value remains 'sample_drive_straight' until switchScriptTab or updateTopbarProgramSelect is called.
      hud.triggerTopbarProgramSelect('sample_drive_straight');
      // Empirical verification: code remains intact and activeTabIndex is 1
      expect(hud.activeTabIndex).toBe(1);
      expect(hud.scriptTabs[1].title).toBe('Mission 1');

      // Calling updateTopbarProgramSelect restores synchronization
      hud.updateTopbarProgramSelect();
      expect(topbarSelect.value).toBe('tab_1');
    });
  });

  // =========================================================================
  // Challenge 3: Defensive Resilience on Partial / Mock Hud Objects
  // =========================================================================
  describe('Challenge 3: Execution Resilience on Partial / Mock Hud Objects', () => {
    it('3.1: prototype methods survive bare mock with ZERO DOM elements without throwing', () => {
      const bareMock: any = {
        scriptTabs: [
          { id: 'tab_0', title: 'Script 1', code: 'c1', kind: 'python' },
          { id: 'tab_1', title: 'Script 2', code: 'c2', kind: 'python' },
        ],
        activeTabIndex: 0,
        // Notice: NO codeTextarea, NO popoutTextarea, NO topbarProgramSelect, NO rootElement
      };

      // Test openScriptTab
      expect(() => {
        SimulatorHud.prototype.openScriptTab.call(bareMock, 'New Tab', 'new code');
      }).not.toThrow();
      expect(bareMock.scriptTabs.length).toBe(3);
      expect(bareMock.activeTabIndex).toBe(2);

      // Test switchScriptTab
      expect(() => {
        SimulatorHud.prototype.switchScriptTab.call(bareMock, 0);
      }).not.toThrow();
      expect(bareMock.activeTabIndex).toBe(0);

      // Test renameScriptTab
      expect(() => {
        SimulatorHud.prototype.renameScriptTab.call(bareMock, 0, 'Sanitized Title');
      }).not.toThrow();
      expect(bareMock.scriptTabs[0].title).toBe('Sanitized Title');

      // Test duplicateScriptTab
      expect(() => {
        SimulatorHud.prototype.duplicateScriptTab.call(bareMock, 0);
      }).not.toThrow();
      expect(bareMock.scriptTabs.length).toBe(4);
      expect(bareMock.scriptTabs[1].title).toBe('Sanitized Title (Copy)');

      // Test updateTopbarProgramSelect with null element
      expect(() => {
        SimulatorHud.prototype.updateTopbarProgramSelect.call(bareMock);
      }).not.toThrow();

      // Test toggleScriptsManagerPopover with null element
      expect(() => {
        SimulatorHud.prototype.toggleScriptsManagerPopover.call(bareMock);
      }).not.toThrow();

      // Test renderScriptsManagerPopover with null element
      expect(() => {
        SimulatorHud.prototype.renderScriptsManagerPopover.call(bareMock);
      }).not.toThrow();

      // Test closeScriptTab
      expect(() => {
        SimulatorHud.prototype.closeScriptTab.call(bareMock, 0, true);
      }).not.toThrow();
      expect(bareMock.scriptTabs.length).toBe(3);
    });

    it('3.2: prototype methods gracefully handle negative and out-of-bounds indices', () => {
      const mock: any = {
        scriptTabs: [{ id: 'tab_0', title: 'Script 1', code: 'alpha', kind: 'python' }],
        activeTabIndex: 0,
      };

      // Out of bounds switchScriptTab (negative and excessive)
      SimulatorHud.prototype.switchScriptTab.call(mock, -1);
      expect(mock.activeTabIndex).toBe(0);
      SimulatorHud.prototype.switchScriptTab.call(mock, 999);
      expect(mock.activeTabIndex).toBe(0);

      // Out of bounds closeScriptTab
      SimulatorHud.prototype.closeScriptTab.call(mock, -1, true);
      expect(mock.scriptTabs.length).toBe(1);
      SimulatorHud.prototype.closeScriptTab.call(mock, 999, true);
      expect(mock.scriptTabs.length).toBe(1);

      // Out of bounds renameScriptTab
      SimulatorHud.prototype.renameScriptTab.call(mock, -1, 'Bad');
      SimulatorHud.prototype.renameScriptTab.call(mock, 999, 'Bad');
      expect(mock.scriptTabs[0].title).toBe('Script 1');

      // Out of bounds duplicateScriptTab
      SimulatorHud.prototype.duplicateScriptTab.call(mock, -1);
      SimulatorHud.prototype.duplicateScriptTab.call(mock, 999);
      expect(mock.scriptTabs.length).toBe(1);
    });

    it('3.3: rapid loop deleting 100 tabs sequentially stabilizes at exactly 1 clean reset tab', () => {
      const mock: any = {
        scriptTabs: Array.from({ length: 100 }, (_, i) => ({
          id: `tab_${i}`,
          title: `Script ${i}`,
          code: `code_${i}`,
          kind: 'python',
        })),
        activeTabIndex: 50,
      };

      for (let i = 0; i < 150; i++) {
        SimulatorHud.prototype.closeScriptTab.call(mock, 0, true);
      }

      expect(mock.scriptTabs.length).toBe(1);
      expect(mock.activeTabIndex).toBe(0);
      expect(mock.scriptTabs[0].title).toBe('Script 1');
      expect(mock.scriptTabs[0].code).toBe(DEFAULT_SCRIPT_TEMPLATE);
      expect(mock.scriptTabs[0].kind).toBe('python');
    });

    it('3.4: title sanitization edge cases (empty string, illegal characters, length > 40)', () => {
      expect(sanitizeScriptTitle('')).toBe('Script 1');
      expect(sanitizeScriptTitle('   ')).toBe('Script 1');
      expect(sanitizeScriptTitle('   ', 'Custom Fallback')).toBe('Custom Fallback');
      expect(sanitizeScriptTitle('Mission<>:"/\\|?*Illegal')).toBe('MissionIllegal');
      expect(sanitizeScriptTitle('a'.repeat(60))).toBe('a'.repeat(40));
    });
  });

  // =========================================================================
  // Challenge 4: Script Kind Protection & Read-Only Locks (F14, F15)
  // =========================================================================
  describe('Challenge 4: Script Kind Protection & Word Blocks Read-Only State', () => {
    it('4.1: addBlockFromPalette rejects adding blocks to a Python script', () => {
      const mockHud: any = {
        scriptTabs: [
          {
            id: 'tab_0',
            title: 'Python Script',
            code: 'print("pure python")',
            kind: 'python',
            readOnlyBlocks: false,
          },
        ],
        activeTabIndex: 0,
        logConsole: vi.fn(),
        addBlockFromPalette: SimulatorHud.prototype.addBlockFromPalette,
      };

      const blockItem: any = {
        category: 'movement',
        opcode: 'move_forward',
        icon: '🚗',
        label: 'Move Forward',
        colorHex: '#0090f5',
        pythonSnippet: 'motors.move(10, "cm")',
      };

      mockHud.addBlockFromPalette(blockItem);
      expect(mockHud.scriptTabs[0].code).toBe('print("pure python")');
      expect(mockHud.scriptTabs[0].visualBlocks).toBeUndefined();
      expect(mockHud.logConsole).toHaveBeenCalledWith(expect.stringContaining('Cannot add Word Blocks to a Python script'));
    });

    it('4.2: addBlockFromPalette rejects adding blocks when readOnlyBlocks is locked', () => {
      const mockHud: any = {
        scriptTabs: [
          {
            id: 'tab_0',
            title: 'Blocks Script',
            code: 'motors.move(10, "cm")',
            kind: 'blocks',
            visualBlocks: [{ id: 'b1', label: 'Move' }],
            readOnlyBlocks: true,
          },
        ],
        activeTabIndex: 0,
        logConsole: vi.fn(),
        addBlockFromPalette: SimulatorHud.prototype.addBlockFromPalette,
      };

      const blockItem: any = {
        category: 'movement',
        opcode: 'move_forward',
        icon: '🚗',
        label: 'Move Forward',
        colorHex: '#0090f5',
        pythonSnippet: 'motors.move(20, "cm")',
      };

      mockHud.addBlockFromPalette(blockItem);
      expect(mockHud.scriptTabs[0].visualBlocks.length).toBe(1);
      expect(mockHud.logConsole).toHaveBeenCalledWith(expect.stringContaining('Word Blocks are read-only'));
    });

    it('4.3: duplicateScriptTab deep-clones visualBlocks so mutating duplicate does not corrupt original', () => {
      const originalBlocks = [
        {
          id: 'b1',
          category: 'movement',
          params: { distance: '20', unit: 'cm' },
        },
      ];

      const mockHud: any = {
        scriptTabs: [
          {
            id: 'tab_0',
            title: 'Original Blocks',
            code: 'motors.move(20, "cm")',
            kind: 'blocks',
            visualBlocks: originalBlocks,
            readOnlyBlocks: false,
            _blocksBaselineCode: 'motors.move(20, "cm")',
          },
        ],
        activeTabIndex: 0,
        duplicateScriptTab: SimulatorHud.prototype.duplicateScriptTab,
      };

      mockHud.duplicateScriptTab(0);
      expect(mockHud.scriptTabs.length).toBe(2);

      const dupTab = mockHud.scriptTabs[1];
      expect(dupTab.title).toBe('Original Blocks (Copy)');
      expect(dupTab.kind).toBe('blocks');
      expect(dupTab.visualBlocks).not.toBe(originalBlocks); // Different reference

      // Mutate duplicated block params
      dupTab.visualBlocks[0].params.distance = '999';

      // Original must NOT be mutated
      expect(originalBlocks[0].params.distance).toBe('20');
      expect(mockHud.scriptTabs[0].visualBlocks[0].params.distance).toBe('20');
    });

    it('4.4: revertBlocksEdits restores baseline code and unlocks readOnlyBlocks', () => {
      const baseline = 'from spike import PrimeHub\nhub = PrimeHub()\n# Word blocks baseline';
      const modified = baseline + '\n# Custom manual edits';

      const textarea = { value: modified };
      const mockHud: any = {
        scriptTabs: [
          {
            id: 'tab_0',
            title: 'Blocks Script',
            code: modified,
            kind: 'blocks',
            visualBlocks: [{ id: 'b1', label: 'Start' }],
            readOnlyBlocks: true,
            _blocksBaselineCode: baseline,
          },
        ],
        activeTabIndex: 0,
        codeTextarea: textarea,
        showBlocksReadOnlyBanner: vi.fn(),
        updatePaletteAvailability: vi.fn(),
        revertBlocksEdits: SimulatorHud.prototype.revertBlocksEdits,
      };

      mockHud.revertBlocksEdits();

      expect(mockHud.scriptTabs[0].code).toBe(baseline);
      expect(mockHud.scriptTabs[0].readOnlyBlocks).toBe(false);
      expect(textarea.value).toBe(baseline);
      expect(mockHud.showBlocksReadOnlyBanner).toHaveBeenCalledWith(false);
      expect(mockHud.updatePaletteAvailability).toHaveBeenCalled();
    });
  });
});
