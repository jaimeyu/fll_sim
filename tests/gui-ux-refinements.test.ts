import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SimulatorHud } from '../src/ui/hud';

describe('GUI & UX Refinements: Startup View, Pop-out Code Editor, and Telemetry Overview Mode', () => {
  const hudTsPath = path.resolve(__dirname, '../src/ui/hud.ts');
  const hudCssPath = path.resolve(__dirname, '../src/ui/hud.css');

  // =========================================================================
  // 1. App Startup View
  // =========================================================================
  describe('1. App Startup View: Full 3D Field Visibility', () => {
    it('initializes with drawer closed, display:none, and no active activity icon', () => {
      const hudCode = fs.readFileSync(hudTsPath, 'utf-8');

      // isDrawerOpen defaults to false
      expect(hudCode).toContain('private isDrawerOpen: boolean = false;');

      // hud-drawer-panel has inline style display: none
      expect(hudCode).toContain('<aside class="hud-drawer-panel" id="hud-drawer-panel" style="display: none;">');

      // #act-btn-code does not have active class in initial HTML
      expect(hudCode).toContain('<button class="activity-btn" id="act-btn-code" title="💻 Python Code Editor" data-view="code">');
    });
  });

  // =========================================================================
  // 2. Code Box Spacing, Removal of Focus Bar & formatBlockLabel Fix
  // =========================================================================
  describe('2. Code Box Spacing & formatBlockLabel Integrity', () => {
    it('removes drawer-camera-focus-bar from template markup', () => {
      const hudCode = fs.readFileSync(hudTsPath, 'utf-8');

      expect(hudCode).not.toContain('id="drawer-camera-focus-bar"');
      expect(hudCode).not.toContain('class="drawer-camera-focus-bar"');
    });

    it('removes mission-select-container flex stretching class from #sample-mission-bar', () => {
      const hudCode = fs.readFileSync(hudTsPath, 'utf-8');
      const cssCode = fs.readFileSync(hudCssPath, 'utf-8');

      expect(hudCode).toContain('<div class="sample-mission-bar" id="sample-mission-bar">');
      expect(hudCode).not.toContain('class="sample-mission-bar mission-select-container"');

      // CSS specifies flex-shrink: 0 and compact margins
      expect(cssCode).toMatch(/\.sample-mission-bar\s*\{[^}]*flex-shrink:\s*0/);
    });

    it('formats word block labels cleanly without tag pollution or nested span corruption', () => {
      const mockFormat = SimulatorHud.prototype.formatBlockLabel;

      // 1. Parameter substitution
      const r1 = mockFormat('set movement motors to [A + B]');
      expect(r1).toBe('set movement motors to <span class="word-block-pill">A + B</span>');

      // 2. Condition substitution
      const r2 = mockFormat('wait until <color is red>');
      expect(r2).toBe('wait until <span class="word-block-pill pill-condition">&lt;color is red&gt;</span>');

      // 3. Mixed parameter and condition
      const r3 = mockFormat('move [10] cm until <distance < [5] cm>');
      expect(r3).toContain('<span class="word-block-pill">10</span>');
      expect(r3).toContain('<span class="word-block-pill pill-condition">');
      expect(r3).not.toContain('&lt;span class=');

      // 4. Input with existing raw span tags should not produce corrupted &lt;span&gt;
      const r4 = mockFormat('set speed to <span>[50]</span>%');
      expect(r4).not.toContain('&lt;span');
      expect(r4).toContain('<span class="word-block-pill">50</span>');
    });
  });

  // =========================================================================
  // 3. Pop-out Code Editor Modal
  // =========================================================================
  describe('3. Pop-out Code Editor Modal', () => {
    it('provides pop-out button #btn-popout-code-editor in editor header', () => {
      const hudCode = fs.readFileSync(hudTsPath, 'utf-8');

      expect(hudCode).toContain('id="btn-popout-code-editor"');
      expect(hudCode).toContain('⤢ Pop Out');
    });

    it('declares #modal-popout-code-editor markup with view modes, controls, and editor containers', () => {
      const hudCode = fs.readFileSync(hudTsPath, 'utf-8');

      expect(hudCode).toContain('id="modal-popout-code-editor"');
      expect(hudCode).toContain('class="hud-popout-code-modal"');
      expect(hudCode).toContain('id="btn-popout-mode-blocks"');
      expect(hudCode).toContain('id="btn-popout-mode-python"');
      expect(hudCode).toContain('id="btn-popout-dock-back"');
      expect(hudCode).toContain('id="btn-close-popout-code"');
      expect(hudCode).toContain('id="popout-scratch-blocks-container"');
      expect(hudCode).toContain('id="popout-word-blocks-container"');
      expect(hudCode).toContain('id="popout-python-code-editor"');
      expect(hudCode).toContain('id="btn-popout-run"');
      expect(hudCode).toContain('id="btn-popout-stop"');
      expect(hudCode).toContain('id="btn-popout-reset"');
      expect(hudCode).toContain('id="btn-popout-import-code"');
    });

    it('implements modal state methods open/close/toggle/zoom', () => {
      const mockHud: any = {
        isPopoutCodeEditorOpen: false,
        popoutModal: { style: { display: 'none' } },
        popoutTextarea: { value: '' },
        codeTextarea: { value: 'print("hello")' },
        editorViewMode: 'python',
        scriptTabs: [{ id: 'tab-1', title: 'Script 1', code: 'print("hello")' }],
        activeTabIndex: 0,
        popoutZoomScale: 1.0,
        popoutPanX: 0,
        popoutPanY: 0,
        setPopoutEditorViewMode: vi.fn(),
        renderPopoutVisualBlocks: vi.fn(),
        updatePopoutScratchTransform: vi.fn(),
        setEditorViewMode: vi.fn(),
        saveScriptTabsToStorage: vi.fn(),
        openPopoutCodeEditor: SimulatorHud.prototype.openPopoutCodeEditor,
        closePopoutCodeEditor: SimulatorHud.prototype.closePopoutCodeEditor,
        togglePopoutCodeEditor: SimulatorHud.prototype.togglePopoutCodeEditor,
        getIsPopoutCodeEditorOpen: SimulatorHud.prototype.getIsPopoutCodeEditorOpen,
        setPopoutScratchZoom: SimulatorHud.prototype.setPopoutScratchZoom,
        resetPopoutScratchZoomAndPan: SimulatorHud.prototype.resetPopoutScratchZoomAndPan,
        getPopoutScratchZoomState: SimulatorHud.prototype.getPopoutScratchZoomState,
      };

      // Open
      mockHud.openPopoutCodeEditor();
      expect(mockHud.getIsPopoutCodeEditorOpen()).toBe(true);
      expect(mockHud.popoutModal.style.display).toBe('flex');
      expect(mockHud.popoutTextarea.value).toBe('print("hello")');

      // Close
      mockHud.popoutTextarea.value = 'print("updated in modal")';
      mockHud.closePopoutCodeEditor();
      expect(mockHud.getIsPopoutCodeEditorOpen()).toBe(false);
      expect(mockHud.popoutModal.style.display).toBe('none');
      expect(mockHud.codeTextarea.value).toBe('print("updated in modal")');
      expect(mockHud.scriptTabs[0].code).toBe('print("updated in modal")');

      // Toggle
      mockHud.togglePopoutCodeEditor();
      expect(mockHud.getIsPopoutCodeEditorOpen()).toBe(true);
      mockHud.togglePopoutCodeEditor();
      expect(mockHud.getIsPopoutCodeEditorOpen()).toBe(false);

      // Pan & Zoom
      mockHud.setPopoutScratchZoom(1.5);
      expect(mockHud.getPopoutScratchZoomState().scale).toBe(1.5);
      mockHud.resetPopoutScratchZoomAndPan();
      expect(mockHud.getPopoutScratchZoomState().scale).toBe(1.0);
    });

    it('styles .hud-popout-code-modal in CSS with responsive dimensions and cyber dark theme', () => {
      const cssCode = fs.readFileSync(hudCssPath, 'utf-8');

      expect(cssCode).toContain('.hud-popout-code-modal');
      expect(cssCode).toMatch(/\.popout-code-card\s*\{[^}]*width:\s*92vw/);
      expect(cssCode).toMatch(/\.popout-code-card\s*\{[^}]*max-width:\s*1400px/);
      expect(cssCode).toMatch(/\.popout-code-card\s*\{[^}]*height:\s*86vh/);
      expect(cssCode).toMatch(/\.popout-code-card\s*\{[^}]*max-height:\s*900px/);
    });

    it('enables pointer-events: auto on .hud-popout-code-modal and .hud-robot-design-modal so all clicks register', () => {
      const cssCode = fs.readFileSync(hudCssPath, 'utf-8');

      // Top-level root override includes modal classes
      expect(cssCode).toMatch(/\.hud-robot-design-modal,\s*\.hud-popout-code-modal\s*\{\s*pointer-events:\s*auto;/);
      // Dedicated modal class definitions have pointer-events: auto
      expect(cssCode).toMatch(/\.hud-popout-code-modal\s*\{[^}]*pointer-events:\s*auto;/);
      expect(cssCode).toMatch(/\.hud-robot-design-modal\s*\{[^}]*pointer-events:\s*auto;/);
    });

    it('provides top bar code editor modal button #btn-topbar-code for direct access', () => {
      const hudCode = fs.readFileSync(hudTsPath, 'utf-8');

      expect(hudCode).toContain('id="btn-topbar-code"');
      expect(hudCode).toContain('💻 Code Editor');
      expect(hudCode).toContain("btnTopbarCode?.addEventListener('click'");
    });
  });

  // =========================================================================
  // 4. Bottom Bar Boxes Compacting & View Mode
  // =========================================================================
  describe('4. Bottom Bar Compacting & View Modes', () => {
    it('sets Overview (All) as default active subtab in telem-left-tabs-bar and adds Detailed View', () => {
      const hudCode = fs.readFileSync(hudTsPath, 'utf-8');

      expect(hudCode).toContain('id="btn-subtab-both"');
      expect(hudCode).toContain('🔲 Overview (All)');
      expect(hudCode).toContain('class="telem-subtab-btn active" data-subtab="both" id="btn-subtab-both"');

      expect(hudCode).toContain('id="btn-subtab-detailed"');
      expect(hudCode).toContain('🔍 Detailed View');

      expect(hudCode).toContain('private telemSubView: \'both\' | \'detailed\' | \'sensors\' | \'motors\' = \'both\';');
    });

    it('implements getTelemSubView and setTelemSubView methods', () => {
      const mockHud: any = {
        telemSubView: 'both',
        rootElement: {
          querySelectorAll: vi.fn(() => []),
        },
        updateDockViewLayout: vi.fn(),
        getTelemSubView: SimulatorHud.prototype.getTelemSubView,
        setTelemSubView: SimulatorHud.prototype.setTelemSubView,
      };

      expect(mockHud.getTelemSubView()).toBe('both');
      mockHud.setTelemSubView('detailed');
      expect(mockHud.getTelemSubView()).toBe('detailed');
      expect(mockHud.updateDockViewLayout).toHaveBeenCalled();
    });

    it('reduces bottom dock height to 220px in CSS', () => {
      const cssCode = fs.readFileSync(hudCssPath, 'utf-8');

      expect(cssCode).toMatch(/\.hud-telemetry-dock\.dock-bottom\s*\{[^}]*height:\s*220px/);
      expect(cssCode).toMatch(/\.hud-telemetry-dock\.dock-bottom\s*\{[^}]*min-height:\s*180px/);
    });

    it('compacts sensor cards and motor cards in subview-both mode for zero-scroll visibility', () => {
      const cssCode = fs.readFileSync(hudCssPath, 'utf-8');

      // 2x2 grid for sensors
      expect(cssCode).toMatch(/\.telem-dock-left\.subview-both\s+\.telem-sensors-grid\s*\{[^}]*grid-template-columns:\s*1fr\s+1fr/);

      // 3x2 grid for motors
      expect(cssCode).toMatch(/\.telem-dock-left\.subview-both\s+\.telem-motors-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*1fr\)/);

      // Swatch row hidden in compact overview mode
      expect(cssCode).toMatch(/\.telem-dock-left\.subview-both\s+\.sensor-color-swatch-row\s*\{[^}]*display:\s*none/);

      // Detailed mode allows scrolling
      expect(cssCode).toMatch(/\.telem-dock-left\.subview-detailed\s+\.telem-left-content\s*\{[^}]*overflow-y:\s*auto/);
    });
  });
});
