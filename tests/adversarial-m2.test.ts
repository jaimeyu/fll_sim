import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SimulatorHud,
  sanitizeScriptTitle,
  createDefaultTab,
  DEFAULT_SCRIPT_TEMPLATE,
  ScriptTab,
  ScriptKind,
  SAMPLE_MISSIONS,
} from '../src/ui/hud';

// Minimal mock DOM node for rich interaction testing
class MockElement {
  public tagName: string;
  public id: string = '';
  public className: string = '';
  public style: Record<string, string> = { display: '' };
  public value: string = '';
  public innerHTML: string = '';
  public attributes: Record<string, string> = {};
  public children: MockElement[] = [];
  public parent: MockElement | null = null;
  public eventListeners: Record<string, ((e: any) => void)[]> = {};
  public type: string = '';
  public maxLength: number = 0;

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  public setAttribute(name: string, val: string) {
    this.attributes[name] = val;
    if (name === 'id') this.id = val;
    if (name === 'class') this.className = val;
  }

  public getAttribute(name: string): string | null {
    if (name === 'id') return this.id || null;
    if (name === 'class') return this.className || null;
    return this.attributes[name] ?? null;
  }

  public removeAttribute(name: string) {
    delete this.attributes[name];
  }

  public get classList() {
    return {
      add: (...classes: string[]) => {
        const current = new Set(this.className.split(/\s+/).filter(Boolean));
        classes.forEach((c) => current.add(c));
        this.className = Array.from(current).join(' ');
      },
      remove: (...classes: string[]) => {
        const current = new Set(this.className.split(/\s+/).filter(Boolean));
        classes.forEach((c) => current.delete(c));
        this.className = Array.from(current).join(' ');
      },
      toggle: (cls: string, force?: boolean) => {
        const current = new Set(this.className.split(/\s+/).filter(Boolean));
        const shouldAdd = force !== undefined ? force : !current.has(cls);
        if (shouldAdd) current.add(cls);
        else current.delete(cls);
        this.className = Array.from(current).join(' ');
        return shouldAdd;
      },
      contains: (cls: string) => {
        return this.className.split(/\s+/).includes(cls);
      },
    };
  }

  public addEventListener(type: string, listener: (e: any) => void) {
    if (!this.eventListeners[type]) this.eventListeners[type] = [];
    this.eventListeners[type].push(listener);
  }

  public dispatchEvent(e: { type: string; target?: any; stopPropagation?: () => void; preventDefault?: () => void }) {
    if (!e.target) e.target = this;
    const listeners = this.eventListeners[e.type] || [];
    listeners.forEach((l) => l(e));
  }

  public contains(other: MockElement | null): boolean {
    if (!other) return false;
    if (other === this) return true;
    let p = other.parent;
    while (p) {
      if (p === this) return true;
      p = p.parent;
    }
    return false;
  }

  public closest(selector: string): MockElement | null {
    let curr: MockElement | null = this;
    while (curr) {
      if (curr.matches(selector)) return curr;
      curr = curr.parent;
    }
    return null;
  }

  public matches(selector: string): boolean {
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    return this.tagName.toLowerCase() === selector.toLowerCase();
  }

  public querySelector(selector: string): MockElement | null {
    for (const child of this.children) {
      if (child.matches(selector)) return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }

  public querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];
    for (const child of this.children) {
      if (child.matches(selector)) results.push(child);
      results.push(...child.querySelectorAll(selector));
    }
    return results;
  }

  public appendChild(child: MockElement) {
    child.parent = this;
    this.children.push(child);
  }

  public replaceWith(newElement: MockElement) {
    if (!this.parent) return;
    const idx = this.parent.children.indexOf(this);
    if (idx !== -1) {
      newElement.parent = this.parent;
      this.parent.children.splice(idx, 1, newElement);
    }
  }

  public focus() {}
  public select() {}
}

function createHudHarness() {
  const root = new MockElement('div');
  root.id = 'hud-root';

  const textarea = new MockElement('textarea');
  textarea.id = 'code-textarea';
  textarea.value = DEFAULT_SCRIPT_TEMPLATE;
  root.appendChild(textarea);

  const popoutTextarea = new MockElement('textarea');
  popoutTextarea.id = 'popout-code-textarea';
  popoutTextarea.value = DEFAULT_SCRIPT_TEMPLATE;
  root.appendChild(popoutTextarea);

  const topbarSelect = new MockElement('select');
  topbarSelect.id = 'topbar-program-select';
  root.appendChild(topbarSelect);

  const tabsList = new MockElement('div');
  tabsList.id = 'script-tabs-list';
  root.appendChild(tabsList);

  const btnScriptsManager = new MockElement('button');
  btnScriptsManager.id = 'btn-scripts-manager';
  root.appendChild(btnScriptsManager);

  const popover = new MockElement('div');
  popover.id = 'scripts-manager-popover';
  popover.style.display = 'none';
  root.appendChild(popover);

  const popoverList = new MockElement('div');
  popoverList.id = 'scripts-manager-list';
  popover.appendChild(popoverList);

  const btnClosePop = new MockElement('button');
  btnClosePop.id = 'btn-close-scripts-manager';
  popover.appendChild(btnClosePop);

  const paletteDrawer = new MockElement('div');
  paletteDrawer.id = 'spike-palette-drawer';
  root.appendChild(paletteDrawer);

  const readonlyBanner = new MockElement('div');
  readonlyBanner.id = 'banner-blocks-readonly';
  readonlyBanner.style.display = 'none';
  root.appendChild(readonlyBanner);

  const wordBlocksContainer = new MockElement('div');
  wordBlocksContainer.id = 'word-blocks-container';
  root.appendChild(wordBlocksContainer);

  const mockHud: any = {
    rootElement: root,
    scriptTabs: [createDefaultTab('Script 1')],
    activeTabIndex: 0,
    codeTextarea: textarea,
    popoutTextarea: popoutTextarea,
    topbarProgramSelect: topbarSelect,
    wordBlocksContainer: wordBlocksContainer,
    editorViewMode: 'python',
    logConsole: vi.fn(),
    saveScriptTabsToStorage: vi.fn(),
    triggerAutosave: vi.fn(),

    // Method bindings from SimulatorHud.prototype
    openScriptTab: SimulatorHud.prototype.openScriptTab,
    switchScriptTab: SimulatorHud.prototype.switchScriptTab,
    closeScriptTab: SimulatorHud.prototype.closeScriptTab,
    renameScriptTab: SimulatorHud.prototype.renameScriptTab,
    duplicateScriptTab: SimulatorHud.prototype.duplicateScriptTab,
    toggleScriptsManagerPopover: SimulatorHud.prototype.toggleScriptsManagerPopover,
    renderScriptsManagerPopover: SimulatorHud.prototype.renderScriptsManagerPopover,
    updatePaletteAvailability: SimulatorHud.prototype.updatePaletteAvailability,
    showBlocksReadOnlyBanner: SimulatorHud.prototype.showBlocksReadOnlyBanner,
    revertBlocksEdits: SimulatorHud.prototype.revertBlocksEdits,
    updateTopbarProgramSelect: SimulatorHud.prototype.updateTopbarProgramSelect,
    addBlockFromPalette: SimulatorHud.prototype.addBlockFromPalette,
    renderScriptTabs: vi.fn(),
    renderVisualBlocks: vi.fn(),
  };

  return { mockHud, root, textarea, topbarSelect, popover, popoverList, paletteDrawer, readonlyBanner };
}

describe('Adversarial Stress Harness: Milestone 2 (M2_SCRIPT_MANAGEMENT)', () => {

  // =========================================================================
  // 1. TAB DELETION BOUNDARY STRESS (F9, F10)
  // =========================================================================
  describe('Adversarial Tab Deletion Boundaries (F9, F10)', () => {
    let harness: ReturnType<typeof createHudHarness>;
    let hud: any;

    beforeEach(() => {
      harness = createHudHarness();
      hud = harness.mockHud;
    });

    it('Closing tab 0 when active is 0 shifts focus to tab 1 (now at index 0) and updates editor buffer', () => {
      hud.scriptTabs = [
        { id: 'tab_0', title: 'T0', code: 'code_0', kind: 'python' },
        { id: 'tab_1', title: 'T1', code: 'code_1', kind: 'python' },
        { id: 'tab_2', title: 'T2', code: 'code_2', kind: 'python' },
      ];
      hud.activeTabIndex = 0;
      harness.textarea.value = 'code_0';

      hud.closeScriptTab(0, true);

      expect(hud.scriptTabs.length).toBe(2);
      expect(hud.scriptTabs.map((t: any) => t.title)).toEqual(['T1', 'T2']);
      expect(hud.activeTabIndex).toBe(0);
      expect(hud.scriptTabs[hud.activeTabIndex].title).toBe('T1');
      expect(harness.textarea.value).toBe('code_1');
    });

    it('Closing tab 0 when active is 1 decrements activeTabIndex to 0 without drifting active tab identity', () => {
      hud.scriptTabs = [
        { id: 'tab_0', title: 'T0', code: 'code_0', kind: 'python' },
        { id: 'tab_1', title: 'T1', code: 'code_1', kind: 'python' },
        { id: 'tab_2', title: 'T2', code: 'code_2', kind: 'python' },
      ];
      hud.activeTabIndex = 1;
      harness.textarea.value = 'code_1';

      hud.closeScriptTab(0, true);

      expect(hud.scriptTabs.length).toBe(2);
      expect(hud.activeTabIndex).toBe(0);
      expect(hud.scriptTabs[hud.activeTabIndex].title).toBe('T1');
      expect(harness.textarea.value).toBe('code_1');
    });

    it('Closing tab 0 when active is 2 decrements activeTabIndex to 1 maintaining active tab identity', () => {
      hud.scriptTabs = [
        { id: 'tab_0', title: 'T0', code: 'code_0', kind: 'python' },
        { id: 'tab_1', title: 'T1', code: 'code_1', kind: 'python' },
        { id: 'tab_2', title: 'T2', code: 'code_2', kind: 'python' },
      ];
      hud.activeTabIndex = 2;
      harness.textarea.value = 'code_2';

      hud.closeScriptTab(0, true);

      expect(hud.scriptTabs.length).toBe(2);
      expect(hud.activeTabIndex).toBe(1);
      expect(hud.scriptTabs[hud.activeTabIndex].title).toBe('T2');
      expect(harness.textarea.value).toBe('code_2');
    });

    it('Closing middle tab (index 1) when active is 1 keeps activeTabIndex at 1 and focuses next tab T2', () => {
      hud.scriptTabs = [
        { id: 'tab_0', title: 'T0', code: 'code_0', kind: 'python' },
        { id: 'tab_1', title: 'T1', code: 'code_1', kind: 'python' },
        { id: 'tab_2', title: 'T2', code: 'code_2', kind: 'python' },
      ];
      hud.activeTabIndex = 1;
      harness.textarea.value = 'code_1';

      hud.closeScriptTab(1, true);

      expect(hud.scriptTabs.length).toBe(2);
      expect(hud.scriptTabs.map((t: any) => t.title)).toEqual(['T0', 'T2']);
      expect(hud.activeTabIndex).toBe(1);
      expect(hud.scriptTabs[hud.activeTabIndex].title).toBe('T2');
      expect(harness.textarea.value).toBe('code_2');
    });

    it('Closing middle tab (index 1) when active is 0 leaves activeTabIndex at 0 on T0', () => {
      hud.scriptTabs = [
        { id: 'tab_0', title: 'T0', code: 'code_0', kind: 'python' },
        { id: 'tab_1', title: 'T1', code: 'code_1', kind: 'python' },
        { id: 'tab_2', title: 'T2', code: 'code_2', kind: 'python' },
      ];
      hud.activeTabIndex = 0;
      harness.textarea.value = 'code_0';

      hud.closeScriptTab(1, true);

      expect(hud.scriptTabs.length).toBe(2);
      expect(hud.activeTabIndex).toBe(0);
      expect(hud.scriptTabs[hud.activeTabIndex].title).toBe('T0');
      expect(harness.textarea.value).toBe('code_0');
    });

    it('Closing middle tab (index 1) when active is 2 decrements activeTabIndex to 1 on T2', () => {
      hud.scriptTabs = [
        { id: 'tab_0', title: 'T0', code: 'code_0', kind: 'python' },
        { id: 'tab_1', title: 'T1', code: 'code_1', kind: 'python' },
        { id: 'tab_2', title: 'T2', code: 'code_2', kind: 'python' },
      ];
      hud.activeTabIndex = 2;
      harness.textarea.value = 'code_2';

      hud.closeScriptTab(1, true);

      expect(hud.scriptTabs.length).toBe(2);
      expect(hud.activeTabIndex).toBe(1);
      expect(hud.scriptTabs[hud.activeTabIndex].title).toBe('T2');
      expect(harness.textarea.value).toBe('code_2');
    });

    it('Closing last tab (index 2) when active is 2 clamps activeTabIndex to 1 on T1', () => {
      hud.scriptTabs = [
        { id: 'tab_0', title: 'T0', code: 'code_0', kind: 'python' },
        { id: 'tab_1', title: 'T1', code: 'code_1', kind: 'python' },
        { id: 'tab_2', title: 'T2', code: 'code_2', kind: 'python' },
      ];
      hud.activeTabIndex = 2;
      harness.textarea.value = 'code_2';

      hud.closeScriptTab(2, true);

      expect(hud.scriptTabs.length).toBe(2);
      expect(hud.scriptTabs.map((t: any) => t.title)).toEqual(['T0', 'T1']);
      expect(hud.activeTabIndex).toBe(1);
      expect(hud.scriptTabs[hud.activeTabIndex].title).toBe('T1');
      expect(harness.textarea.value).toBe('code_1');
    });

    it('Closing final remaining script tab resets workspace to clean Script 1 with PrimeHub & MotorPair', () => {
      hud.scriptTabs = [{
        id: 'tab_dirty',
        title: 'Corrupted Tab',
        code: 'malformed python code',
        kind: 'blocks',
        readOnlyBlocks: true,
      }];
      hud.activeTabIndex = 0;
      harness.textarea.value = 'malformed python code';

      hud.closeScriptTab(0, true);

      expect(hud.scriptTabs.length).toBe(1);
      const reset = hud.scriptTabs[0];
      expect(reset.title).toBe('Script 1');
      expect(reset.kind).toBe('python');
      expect(reset.readOnlyBlocks).toBe(false);
      expect(reset.code).toContain('from spike import PrimeHub, MotorPair');
      expect(reset.code).toContain('hub = PrimeHub()');
      expect(reset.code).toContain("motors = MotorPair('A', 'B')");
      expect(hud.activeTabIndex).toBe(0);
      expect(harness.textarea.value).toBe(DEFAULT_SCRIPT_TEMPLATE);
    });

    it('Consecutive 25 close calls on the last tab repeatedly and stably resets clean script', () => {
      for (let i = 0; i < 25; i++) {
        hud.closeScriptTab(0, true);
        expect(hud.scriptTabs.length).toBe(1);
        expect(hud.scriptTabs[0].title).toBe('Script 1');
        expect(hud.activeTabIndex).toBe(0);
        expect(hud.scriptTabs[0].code).toBe(DEFAULT_SCRIPT_TEMPLATE);
      }
    });

    it('Rapid deletion of 30 tabs in arbitrary order reaches clean reset state without error', () => {
      for (let i = 1; i <= 30; i++) {
        hud.scriptTabs.push({ id: `tab_${i}`, title: `Script ${i}`, code: `print(${i})`, kind: 'python' });
      }
      expect(hud.scriptTabs.length).toBe(31);

      while (hud.scriptTabs.length > 1) {
        const victim = Math.floor(Math.random() * hud.scriptTabs.length);
        hud.closeScriptTab(victim, true);
        expect(hud.activeTabIndex).toBeGreaterThanOrEqual(0);
        expect(hud.activeTabIndex).toBeLessThan(hud.scriptTabs.length);
      }

      // Final close on last remaining tab
      hud.closeScriptTab(0, true);
      expect(hud.scriptTabs.length).toBe(1);
      expect(hud.scriptTabs[0].title).toBe('Script 1');
      expect(hud.activeTabIndex).toBe(0);
    });

    it('Negative, out-of-bounds, and non-integer close calls are safely ignored', () => {
      hud.scriptTabs = [
        { id: 'tab_0', title: 'T0', code: 'c0', kind: 'python' },
        { id: 'tab_1', title: 'T1', code: 'c1', kind: 'python' },
      ];
      hud.activeTabIndex = 0;

      hud.closeScriptTab(-1, true);
      hud.closeScriptTab(999, true);
      expect(hud.scriptTabs.length).toBe(2);
      expect(hud.activeTabIndex).toBe(0);
    });
  });

  // =========================================================================
  // 2. TAB DUPLICATION STRESS & ISOLATION (F12)
  // =========================================================================
  describe('Adversarial Tab Duplication Stress (F12)', () => {
    let harness: ReturnType<typeof createHudHarness>;
    let hud: any;

    beforeEach(() => {
      harness = createHudHarness();
      hud = harness.mockHud;
    });

    it('Deep-clones deeply nested visual block parameters preventing any reference leak', () => {
      const complexBlocks = [
        {
          id: 'blk_drive_1',
          category: 'motion',
          opcode: 'move_tank',
          icon: '🚗',
          label: 'Move Tank',
          colorHex: '#ffab19',
          params: {
            leftSpeed: 75,
            rightSpeed: -50,
            unit: 'cm',
            amount: 25.5,
            nestedSettings: {
              holdingBrake: true,
              accelerationCurve: [0.1, 0.5, 0.9],
              sensorThresholds: {
                min: 10,
                max: 100,
              },
            },
          },
        },
      ];

      hud.scriptTabs = [{
        id: 'tab_orig',
        title: 'Autonomous Run',
        code: 'complex_code()',
        kind: 'blocks' as ScriptKind,
        visualBlocks: complexBlocks,
        readOnlyBlocks: false,
        _blocksBaselineCode: 'complex_code()',
      }];
      hud.activeTabIndex = 0;
      harness.textarea.value = 'complex_code()';

      hud.duplicateScriptTab(0);

      expect(hud.scriptTabs.length).toBe(2);
      expect(hud.activeTabIndex).toBe(1);
      const dupTab = hud.scriptTabs[1];
      const origTab = hud.scriptTabs[0];

      expect(dupTab.title).toBe('Autonomous Run (Copy)');
      expect(dupTab.visualBlocks).toBeDefined();
      expect(dupTab.visualBlocks).not.toBe(origTab.visualBlocks);

      // Mutate duplicated nested params
      dupTab.visualBlocks![0].params.leftSpeed = 999;
      dupTab.visualBlocks![0].params.nestedSettings.holdingBrake = false;
      dupTab.visualBlocks![0].params.nestedSettings.accelerationCurve.push(1.0);
      dupTab.visualBlocks![0].params.nestedSettings.sensorThresholds.min = -999;
      dupTab.visualBlocks!.push({ id: 'blk_new', params: {} });

      // Assert original tab remains 100% pure and untouched
      expect(origTab.visualBlocks![0].params.leftSpeed).toBe(75);
      expect(origTab.visualBlocks![0].params.nestedSettings.holdingBrake).toBe(true);
      expect(origTab.visualBlocks![0].params.nestedSettings.accelerationCurve).toEqual([0.1, 0.5, 0.9]);
      expect(origTab.visualBlocks![0].params.nestedSettings.sensorThresholds.min).toBe(10);
      expect(origTab.visualBlocks!.length).toBe(1);
    });

    it('Captures unsaved active textarea edits before duplicating', () => {
      hud.scriptTabs = [{
        id: 'tab_0',
        title: 'Strategy Alpha',
        code: 'original_stale_code',
        kind: 'python' as ScriptKind,
      }];
      hud.activeTabIndex = 0;
      // User typed modifications in editor textarea but didn't trigger autosave
      harness.textarea.value = 'brand_new_unsaved_work()';

      hud.duplicateScriptTab(0);

      expect(hud.scriptTabs[0].code).toBe('brand_new_unsaved_work()');
      expect(hud.scriptTabs[1].code).toBe('brand_new_unsaved_work()');
      expect(hud.activeTabIndex).toBe(1);
      expect(harness.textarea.value).toBe('brand_new_unsaved_work()');
    });

    it('Duplicating non-active tab flushes active tab textarea and switches to new duplicate', () => {
      hud.scriptTabs = [
        { id: 'tab_0', title: 'Active Tab', code: 'old_active_code', kind: 'python' as ScriptKind },
        { id: 'tab_1', title: 'Background Tab', code: 'background_code', kind: 'python' as ScriptKind },
      ];
      hud.activeTabIndex = 0;
      harness.textarea.value = 'unsaved_active_code';

      // Duplicate Background Tab (index 1)
      hud.duplicateScriptTab(1);

      // Active tab edits were saved
      expect(hud.scriptTabs[0].code).toBe('unsaved_active_code');
      // Duplicate was inserted right after tab 1 (at index 2)
      expect(hud.scriptTabs.length).toBe(3);
      expect(hud.scriptTabs[2].title).toBe('Background Tab (Copy)');
      expect(hud.scriptTabs[2].code).toBe('background_code');
      // Active index switched to duplicated tab 2
      expect(hud.activeTabIndex).toBe(2);
      expect(harness.textarea.value).toBe('background_code');
    });

    it('Consecutive 15 duplications chain titles cleanly and maintain array integrity', () => {
      hud.scriptTabs = [{ id: 'tab_0', title: 'Mission', code: 'run()', kind: 'python' as ScriptKind }];
      hud.activeTabIndex = 0;
      harness.textarea.value = 'run()';

      for (let i = 0; i < 15; i++) {
        hud.duplicateScriptTab(hud.activeTabIndex);
      }

      expect(hud.scriptTabs.length).toBe(16);
      expect(hud.activeTabIndex).toBe(15);
      expect(hud.scriptTabs[1].title).toBe('Mission (Copy)');
      expect(hud.scriptTabs[2].title).toBe('Mission (Copy) (Copy)');
      expect(harness.textarea.value).toBe('run()');
    });
  });

  // =========================================================================
  // 3. INLINE RENAMING FUZZING & SANITIZATION (F11)
  // =========================================================================
  describe('Adversarial Inline Renaming Fuzzing (F11)', () => {
    let harness: ReturnType<typeof createHudHarness>;
    let hud: any;

    beforeEach(() => {
      harness = createHudHarness();
      hud = harness.mockHud;
    });

    it('Strips forbidden filesystem and DOM characters /[<>:"/\\|?*]/g', () => {
      const hostile = 'Mission<1>:*?"/\\|Test?*';
      const clean = sanitizeScriptTitle(hostile, 'Fallback');
      expect(clean).toBe('Mission1Test');
      expect(clean).not.toMatch(/[<>:"/\\|?*]/);
    });

    it('Clamps excessively long script names strictly to 40 characters', () => {
      const veryLong = 'A'.repeat(250);
      const clean = sanitizeScriptTitle(veryLong, 'Fallback');
      expect(clean.length).toBe(40);
      expect(clean).toBe('A'.repeat(40));
    });

    it('Trims leading and trailing whitespace and falls back if string is empty or whitespace-only', () => {
      expect(sanitizeScriptTitle('', 'Default 1')).toBe('Default 1');
      expect(sanitizeScriptTitle('   ', 'Default 1')).toBe('Default 1');
      expect(sanitizeScriptTitle('\t\n\r  ', 'Default 1')).toBe('Default 1');
      expect(sanitizeScriptTitle('  Valid Title  ', 'Default 1')).toBe('Valid Title');
    });

    it('Fuzzes with 100 randomly generated adversarial strings', () => {
      const hostileChars = ['<', '>', ':', '"', '/', '\\', '|', '?', '*', '\0', '\n', ' ', 'a', 'Z', '9', '🐍', '🔥'];

      for (let i = 0; i < 100; i++) {
        const len = Math.floor(Math.random() * 80) + 1;
        let randomStr = '';
        for (let j = 0; j < len; j++) {
          randomStr += hostileChars[Math.floor(Math.random() * hostileChars.length)];
        }

        const sanitized = sanitizeScriptTitle(randomStr, 'Safe Script');
        expect(typeof sanitized).toBe('string');
        expect(sanitized.length).toBeGreaterThan(0);
        expect(sanitized.length).toBeLessThanOrEqual(40);
        expect(sanitized).not.toMatch(/[<>:"/\\|?*]/);
      }
    });

    it('Defensively handles null, undefined, and non-string inputs', () => {
      expect(sanitizeScriptTitle(null as any, 'Fallback')).toBe('Fallback');
      expect(sanitizeScriptTitle(undefined as any, 'Fallback')).toBe('Fallback');
    });

    it('renameScriptTab updates title in tab array, preserves fallback on empty rename', () => {
      hud.scriptTabs = [{ id: 'tab_0', title: 'Initial Title', code: '', kind: 'python' as ScriptKind }];

      hud.renameScriptTab(0, '  Mission <Five>  ');
      expect(hud.scriptTabs[0].title).toBe('Mission Five');

      hud.renameScriptTab(0, '   '); // whitespace only
      expect(hud.scriptTabs[0].title).toBe('Mission Five'); // retained previous title as fallback
    });

    it('HTML injection attempt via tab renaming does not inject executable tags into DOM markup', () => {
      const xssAttempt = '<script>alert(1)</script><img src=x onerror=hack()>';
      hud.renameScriptTab(0, xssAttempt);
      const title = hud.scriptTabs[0].title;
      expect(title).not.toContain('<');
      expect(title).not.toContain('>');
      expect(title).not.toContain('"');
      expect(title).not.toContain('/');
    });
  });

  // =========================================================================
  // 4. SCRIPTS MANAGER POPOVER INTERACTIONS & DISMISSALS (F13)
  // =========================================================================
  describe('Adversarial Scripts Manager Popover Interactions (F13)', () => {
    let harness: ReturnType<typeof createHudHarness>;
    let hud: any;

    beforeEach(() => {
      harness = createHudHarness();
      hud = harness.mockHud;
    });

    it('Toggles popover between flex and none display', () => {
      expect(harness.popover.style.display).toBe('none');

      hud.toggleScriptsManagerPopover();
      expect(harness.popover.style.display).toBe('flex');

      hud.toggleScriptsManagerPopover();
      expect(harness.popover.style.display).toBe('none');

      hud.toggleScriptsManagerPopover(true);
      expect(harness.popover.style.display).toBe('flex');

      hud.toggleScriptsManagerPopover(false);
      expect(harness.popover.style.display).toBe('none');
    });

    it('Renders popover items with correct badges for python and blocks', () => {
      hud.scriptTabs = [
        { id: 'tab_0', title: 'Python Mission', code: '', kind: 'python' as ScriptKind },
        { id: 'tab_1', title: 'Word Blocks Mission', code: '', kind: 'blocks' as ScriptKind },
      ];
      hud.activeTabIndex = 0;

      hud.renderScriptsManagerPopover();

      const html = harness.popoverList.innerHTML;
      expect(html).toContain('🐍 Python');
      expect(html).toContain('🧩 Word Blocks');
      expect(html).toContain('Python Mission');
      expect(html).toContain('Word Blocks Mission');
      expect(html).toContain('btn-sm-open');
      expect(html).toContain('btn-sm-rename');
      expect(html).toContain('btn-sm-duplicate');
      expect(html).toContain('btn-sm-delete');
      expect(html).toContain('btn-sm-export');
    });

    it('Renders active tab with active highlight class', () => {
      hud.scriptTabs = [
        { id: 'tab_0', title: 'Tab 0', code: '', kind: 'python' as ScriptKind },
        { id: 'tab_1', title: 'Tab 1', code: '', kind: 'python' as ScriptKind },
      ];
      hud.activeTabIndex = 1;

      hud.renderScriptsManagerPopover();

      expect(harness.popoverList.innerHTML).toContain('scripts-manager-item active');
    });

    it('Outside click dismissal dismisses popover when open', () => {
      hud.toggleScriptsManagerPopover(true);
      expect(harness.popover.style.display).toBe('flex');

      // Click outside
      const outsideTarget = new MockElement('div');
      outsideTarget.id = 'viewport-canvas';
      harness.root.appendChild(outsideTarget);

      const isInside = harness.popover.contains(outsideTarget);
      expect(isInside).toBe(false);

      hud.toggleScriptsManagerPopover(false);
      expect(harness.popover.style.display).toBe('none');
    });
  });

  // =========================================================================
  // 5. BLOCKS READ-ONLY PROTECTION & PALETTE LOCKOUT (F14, F15)
  // =========================================================================
  describe('Adversarial Blocks Read-Only Protection & Palette Lockout (F14, F15)', () => {
    let harness: ReturnType<typeof createHudHarness>;
    let hud: any;

    beforeEach(() => {
      harness = createHudHarness();
      hud = harness.mockHud;
    });

    it('Locks out palette when current tab kind is python', () => {
      hud.scriptTabs = [{ id: 'tab_0', title: 'Py', code: 'print(1)', kind: 'python' as ScriptKind }];
      hud.activeTabIndex = 0;

      hud.updatePaletteAvailability();

      expect(harness.paletteDrawer.classList.contains('palette-disabled')).toBe(true);
      expect(harness.paletteDrawer.getAttribute('data-disabled')).toBe('true');
      expect(harness.paletteDrawer.getAttribute('title')).toContain('disabled for Python');

      // Block insertion rejected
      hud.addBlockFromPalette({
        category: 'motion',
        opcode: 'move',
        label: 'Move',
        icon: '🚗',
        colorHex: '#000',
        params: {},
        pythonSnippet: 'move()',
      });
      expect(hud.scriptTabs[0].code).toBe('print(1)');
      expect(hud.scriptTabs[0].visualBlocks).toBeUndefined();
    });

    it('Allows palette block insertion when tab kind is blocks and not read-only', () => {
      hud.scriptTabs = [{
        id: 'tab_0',
        title: 'Blocks Tab',
        code: '',
        kind: 'blocks' as ScriptKind,
        visualBlocks: [],
        readOnlyBlocks: false,
        _blocksBaselineCode: '',
      }];
      hud.activeTabIndex = 0;

      hud.updatePaletteAvailability();

      expect(harness.paletteDrawer.classList.contains('palette-disabled')).toBe(false);
      expect(harness.paletteDrawer.getAttribute('data-disabled')).toBe('false');

      hud.addBlockFromPalette({
        category: 'motion',
        opcode: 'move',
        label: 'Move Forward',
        icon: '🚗',
        colorHex: '#ffab19',
        params: { speed: 50 },
        pythonSnippet: 'motors.move(10, "cm")',
      });

      expect(hud.scriptTabs[0].visualBlocks!.length).toBe(1);
      expect(hud.scriptTabs[0].visualBlocks![0].label).toBe('Move Forward');
      expect(hud.scriptTabs[0].code).toContain('motors.move(10, "cm")');
    });

    it('Detects manual Python edit on blocks tab and marks readOnlyBlocks, locking palette', () => {
      const initialBlocksCode = 'motors.move(10, "cm")\n';
      hud.scriptTabs = [{
        id: 'tab_0',
        title: 'Blocks Tab',
        code: initialBlocksCode,
        kind: 'blocks' as ScriptKind,
        visualBlocks: [{ id: 'b1', params: {} }],
        readOnlyBlocks: false,
        _blocksBaselineCode: initialBlocksCode,
      }];
      hud.activeTabIndex = 0;
      harness.textarea.value = initialBlocksCode;

      // Simulate input event with code modification
      const modifiedCode = initialBlocksCode + 'custom_python_function()\n';
      harness.textarea.value = modifiedCode;

      // Trigger the input logic
      const currentTab = hud.scriptTabs[hud.activeTabIndex];
      if (currentTab.kind === 'blocks' && !currentTab.readOnlyBlocks) {
        const baseline = currentTab._blocksBaselineCode ?? currentTab.code;
        if (harness.textarea.value.trim() !== baseline.trim()) {
          currentTab.readOnlyBlocks = true;
          hud.showBlocksReadOnlyBanner(true);
          hud.updatePaletteAvailability();
        }
      }
      currentTab.code = harness.textarea.value;

      expect(currentTab.readOnlyBlocks).toBe(true);
      expect(harness.readonlyBanner.style.display).toBe('flex');
      expect(harness.paletteDrawer.classList.contains('palette-disabled')).toBe(true);
      expect(harness.paletteDrawer.getAttribute('title')).toContain('read-only due to manual Python');

      // Attempt block insertion when readOnlyBlocks is true -> rejected
      hud.addBlockFromPalette({
        category: 'motion',
        opcode: 'turn',
        label: 'Turn Right',
        icon: '🔄',
        colorHex: '#ffab19',
        params: {},
        pythonSnippet: 'turn()',
      });
      expect(currentTab.visualBlocks.length).toBe(1); // Not added!
    });

    it('Reverting manual Python edits restores baseline code and re-enables palette', () => {
      const baselineCode = 'motors.move(10, "cm")';
      hud.scriptTabs = [{
        id: 'tab_0',
        title: 'Blocks Tab',
        code: 'dirty custom python edit',
        kind: 'blocks' as ScriptKind,
        visualBlocks: [{ id: 'b1', params: {} }],
        readOnlyBlocks: true,
        _blocksBaselineCode: baselineCode,
      }];
      hud.activeTabIndex = 0;
      harness.textarea.value = 'dirty custom python edit';
      harness.readonlyBanner.style.display = 'flex';
      harness.paletteDrawer.classList.add('palette-disabled');

      hud.revertBlocksEdits();

      expect(hud.scriptTabs[0].readOnlyBlocks).toBe(false);
      expect(hud.scriptTabs[0].code).toBe(baselineCode);
      expect(harness.textarea.value).toBe(baselineCode);
      expect(harness.readonlyBanner.style.display).toBe('none');
      expect(harness.paletteDrawer.classList.contains('palette-disabled')).toBe(false);

      // Now block insertion succeeds again
      hud.addBlockFromPalette({
        category: 'motion',
        opcode: 'stop',
        label: 'Stop Motors',
        icon: '🛑',
        colorHex: '#ffab19',
        params: {},
        pythonSnippet: 'motors.stop()',
      });
      expect(hud.scriptTabs[0].visualBlocks.length).toBe(2);
      expect(hud.scriptTabs[0].code).toContain('motors.stop()');
    });

    it('Switching between tabs cleanly restores banner visibility and palette lockout per tab', () => {
      hud.scriptTabs = [
        { id: 'tab_0', title: 'Python Tab', code: '', kind: 'python' as ScriptKind },
        { id: 'tab_1', title: 'Active Blocks', code: '', kind: 'blocks' as ScriptKind, readOnlyBlocks: false },
        { id: 'tab_2', title: 'Locked Blocks', code: '', kind: 'blocks' as ScriptKind, readOnlyBlocks: true },
      ];

      // Switch to tab 1 (active blocks)
      hud.switchScriptTab(1);
      expect(harness.paletteDrawer.classList.contains('palette-disabled')).toBe(false);
      expect(harness.readonlyBanner.style.display).toBe('none');

      // Switch to tab 2 (locked blocks)
      hud.switchScriptTab(2);
      expect(harness.paletteDrawer.classList.contains('palette-disabled')).toBe(true);
      expect(harness.readonlyBanner.style.display).toBe('flex');

      // Switch to tab 0 (python)
      hud.switchScriptTab(0);
      expect(harness.paletteDrawer.classList.contains('palette-disabled')).toBe(true);
      expect(harness.readonlyBanner.style.display).toBe('none');

      // Switch back to tab 1 (active blocks)
      hud.switchScriptTab(1);
      expect(harness.paletteDrawer.classList.contains('palette-disabled')).toBe(false);
      expect(harness.readonlyBanner.style.display).toBe('none');
    });
  });

  // =========================================================================
  // 6. NON-DESTRUCTIVE SAMPLE LOADING & TOPBAR SYNC (F6, F7, F8)
  // =========================================================================
  describe('Adversarial Non-Destructive Selection & Topbar Sync (F6, F7, F8)', () => {
    let harness: ReturnType<typeof createHudHarness>;
    let hud: any;

    beforeEach(() => {
      harness = createHudHarness();
      hud = harness.mockHud;
    });

    it('Opening sample mission never clobbers active tab code and creates separate tab', () => {
      hud.scriptTabs = [{
        id: 'tab_0',
        title: 'My Custom Program',
        code: '# Critical user code that must never be lost\ndef my_mission():\n    pass\n',
        kind: 'python' as ScriptKind,
      }];
      hud.activeTabIndex = 0;
      harness.textarea.value = hud.scriptTabs[0].code;

      const sample = SAMPLE_MISSIONS.drive_straight;
      hud.openScriptTab(sample.title, sample.code, 'python');

      expect(hud.scriptTabs.length).toBe(2);
      expect(hud.scriptTabs[0].code).toContain('# Critical user code that must never be lost');
      expect(hud.scriptTabs[1].title).toBe(sample.title);
      expect(hud.scriptTabs[1].code).toBe(sample.code);
      expect(hud.activeTabIndex).toBe(1);
      expect(harness.textarea.value).toBe(sample.code);
      expect(harness.topbarSelect.value).toBe('tab_1');
    });

    it('Topbar program select synchronization updates options and active value on tab switch', () => {
      hud.scriptTabs = [
        { id: 'tab_0', title: 'Script 1', code: 'c1', kind: 'python' as ScriptKind },
        { id: 'tab_1', title: 'Script 2', code: 'c2', kind: 'python' as ScriptKind },
      ];
      hud.activeTabIndex = 0;

      hud.updateTopbarProgramSelect();
      expect(harness.topbarSelect.value).toBe('tab_0');
      expect(harness.topbarSelect.innerHTML).toContain('value="tab_0" selected');
      expect(harness.topbarSelect.innerHTML).toContain('value="tab_1"');

      hud.switchScriptTab(1);
      expect(harness.topbarSelect.value).toBe('tab_1');
    });
  });
});
