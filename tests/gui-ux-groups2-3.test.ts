import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SimulatorHud } from '../src/ui/hud';

describe('GUI & UX Overhaul - Group 2 & Group 3: Editor Toolbar, Profiler, Unified Import & Visual Block Pan-Zoom', () => {
  const hudTsPath = path.resolve(__dirname, '../src/ui/hud.ts');
  const hudCssPath = path.resolve(__dirname, '../src/ui/hud.css');

  // =========================================================================
  // Group 2: Right Sidebar Code Panel & Profiler Integration
  // =========================================================================
  describe('Group 2: Editor Header, Profiler Relocation & Unified Import', () => {
    it('relocates fixed bottom FPS meter to #btn-editor-fps-profiler in editor header', () => {
      const hudCode = fs.readFileSync(hudTsPath, 'utf-8');

      // Editor header profiler button and inner elements
      expect(hudCode).toContain('id="btn-editor-fps-profiler"');
      expect(hudCode).toContain('class="btn btn-xs btn-outline btn-fps-profiler"');
      expect(hudCode).toContain('id="editor-fps-dot"');
      expect(hudCode).toContain('id="editor-fps-val"');
      expect(hudCode).toContain('id="editor-fps-ms"');

      // Wire profiler modal opener
      expect(hudCode).toContain("btnEditorFps?.addEventListener('click'");
      expect(hudCode).toContain('this.openProfilerModal()');
    });

    it('hides #hud-bottom-fps-meter to keep 3D viewport clean while preserving DOM reference', () => {
      const hudCode = fs.readFileSync(hudTsPath, 'utf-8');
      const cssCode = fs.readFileSync(hudCssPath, 'utf-8');

      // Inline style display none in markup
      expect(hudCode).toContain('id="hud-bottom-fps-meter" class="hud-bottom-fps-meter" style="display: none;"');

      // CSS rule with display: none !important
      expect(cssCode).toMatch(/\.hud-bottom-fps-meter\s*\{[^}]*display:\s*none\s*!important/);
    });

    it('redesigns sample mission selector to compact #sample-select dropdown in .sample-mission-bar', () => {
      const hudCode = fs.readFileSync(hudTsPath, 'utf-8');

      expect(hudCode).toContain('class="sample-mission-bar" id="sample-mission-bar"');
      expect(hudCode).toContain('<select id="sample-select"');
      expect(hudCode).toContain('value="drive_straight"');
      expect(hudCode).toContain('value="gyro_turn"');
      expect(hudCode).toContain('value="line_follower"');
      expect(hudCode).toContain('value="line_squaring"');
    });

    it('provides unified import code button #btn-import-code accepting all supported formats', () => {
      const hudCode = fs.readFileSync(hudTsPath, 'utf-8');

      expect(hudCode).toContain('id="btn-import-code"');
      expect(hudCode).toContain('id="input-import-code"');
      expect(hudCode).toContain('accept=".py,.llsp,.llsp3,.sb3,.json"');
    });

    it('implements handleUnifiedImportFile supporting both Python and Spike Scratch projects', () => {
      const hudCode = fs.readFileSync(hudTsPath, 'utf-8');

      expect(hudCode).toContain('handleUnifiedImportFile(file: File)');
      expect(hudCode).toContain('registerImportedMissionInSelect(importId: string, displayName: string)');
      expect(hudCode).toContain("['llsp', 'llsp3', 'sb3', 'json'].includes(ext)");
    });
  });

  // =========================================================================
  // Group 3: Visual Block Viewer Pan & Zoom Viewport
  // =========================================================================
  describe('Group 3: Visual Block Viewer Pan & Zoom Viewport', () => {
    it('wraps visual blocks in #scratch-blocks-container with pan/zoom viewport and toolbar', () => {
      const hudCode = fs.readFileSync(hudTsPath, 'utf-8');

      expect(hudCode).toContain('id="scratch-blocks-container"');
      expect(hudCode).toContain('id="scratch-zoom-toolbar"');
      expect(hudCode).toContain('id="btn-scratch-zoom-in"');
      expect(hudCode).toContain('id="btn-scratch-zoom-out"');
      expect(hudCode).toContain('id="btn-scratch-zoom-reset"');
      expect(hudCode).toContain('id="scratch-zoom-level"');
      expect(hudCode).toContain('id="scratch-zoom-viewport"');
      expect(hudCode).toContain('id="scratch-zoom-content"');
      expect(hudCode).toContain('id="word-blocks-container"');
    });

    it('provides zoom methods that clamp scale between 0.4 and 2.5', () => {
      const mockHud = {
        scratchZoomScale: 1.0,
        scratchPanX: 0,
        scratchPanY: 0,
        updateScratchTransform: vi.fn(),
        setScratchZoom: SimulatorHud.prototype.setScratchZoom,
        resetScratchZoomAndPan: SimulatorHud.prototype.resetScratchZoomAndPan,
        getScratchZoomState: SimulatorHud.prototype.getScratchZoomState,
      };

      // Default state
      expect(mockHud.getScratchZoomState().scale).toBe(1.0);
      expect(mockHud.getScratchZoomState().panX).toBe(0);
      expect(mockHud.getScratchZoomState().panY).toBe(0);

      // Normal zoom
      mockHud.setScratchZoom(1.5, 20, 30);
      expect(mockHud.getScratchZoomState().scale).toBe(1.5);
      expect(mockHud.getScratchZoomState().panX).toBe(20);
      expect(mockHud.getScratchZoomState().panY).toBe(30);
      expect(mockHud.updateScratchTransform).toHaveBeenCalled();

      // Clamping upper limit to 2.5
      mockHud.setScratchZoom(5.0);
      expect(mockHud.getScratchZoomState().scale).toBe(2.5);

      // Clamping lower limit to 0.4
      mockHud.setScratchZoom(0.1);
      expect(mockHud.getScratchZoomState().scale).toBe(0.4);

      // Reset
      mockHud.resetScratchZoomAndPan();
      expect(mockHud.getScratchZoomState().scale).toBe(1.0);
      expect(mockHud.getScratchZoomState().panX).toBe(0);
      expect(mockHud.getScratchZoomState().panY).toBe(0);
    });

    it('applies transform matrix to #scratch-zoom-content and updates percentage label in updateScratchTransform', () => {
      const contentEl = { style: { transform: '' } };
      const labelEl = { textContent: '' };

      const mockTransformHud = {
        rootElement: {
          querySelector: (sel: string) => {
            if (sel === '#scratch-zoom-content') return contentEl;
            if (sel === '#scratch-zoom-level') return labelEl;
            return null;
          },
        },
        scratchZoomScale: 1.8,
        scratchPanX: 50,
        scratchPanY: -40,
        updateScratchTransform: SimulatorHud.prototype.updateScratchTransform,
      };

      mockTransformHud.updateScratchTransform();
      expect(contentEl.style.transform).toBe('translate(50px, -40px) scale(1.8)');
      expect(labelEl.textContent).toBe('180%');
    });

    it('provides CSS rules for mission bar, profiler button, and pan-zoom viewport in hud.css', () => {
      const cssCode = fs.readFileSync(hudCssPath, 'utf-8');

      // Group 2 CSS classes
      expect(cssCode).toContain('.sample-mission-bar');
      expect(cssCode).toContain('.sample-select-label');
      expect(cssCode).toContain('.editor-header-actions');
      expect(cssCode).toContain('.btn-fps-profiler');
      expect(cssCode).toContain('.fps-pulse-dot');

      // Group 3 CSS classes
      expect(cssCode).toContain('.scratch-blocks-container');
      expect(cssCode).toContain('.scratch-zoom-toolbar');
      expect(cssCode).toContain('.scratch-zoom-viewport');
      expect(cssCode).toContain('.scratch-zoom-content');
      expect(cssCode).toContain('.scratch-zoom-level');
      expect(cssCode).toContain('.zoom-btn');
    });
  });
});
