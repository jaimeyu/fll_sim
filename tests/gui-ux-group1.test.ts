import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('GUI & UX Overhaul - Group 1: Default Camera & Dockable Telemetry Pane', () => {
  const viewportPath = path.resolve(__dirname, '../src/view/viewport.ts');
  const hudTsPath = path.resolve(__dirname, '../src/ui/hud.ts');
  const hudCssPath = path.resolve(__dirname, '../src/ui/hud.css');

  it('configures initial camera preset to TOP_DOWN in viewport.ts', () => {
    const viewportCode = fs.readFileSync(viewportPath, 'utf-8');
    expect(viewportCode).toContain("this.setCameraPreset('TOP_DOWN');");
    expect(viewportCode).not.toMatch(/this\.camera\s*=\s*new THREE\.PerspectiveCamera[^;]+;\s*this\.setCameraPreset\('ISO'\);/);
  });

  it('marks TOP_DOWN camera button as active in hud.ts markup', () => {
    const hudCode = fs.readFileSync(hudTsPath, 'utf-8');
    expect(hudCode).toContain('<button class="btn btn-sm btn-outline active" data-cam="TOP_DOWN">🗺️ Top-Down</button>');
    expect(hudCode).toContain('<button class="btn btn-sm btn-outline" data-cam="ISO">📐 3D Iso</button>');
  });

  it('defines #hud-telemetry-dock with dockable & minimizable structure in hud.ts', () => {
    const hudCode = fs.readFileSync(hudTsPath, 'utf-8');

    // Container
    expect(hudCode).toContain('id="hud-telemetry-dock"');
    expect(hudCode).toContain('class="hud-telemetry-dock dock-bottom"');

    // Header actions
    expect(hudCode).toContain('id="btn-telem-toggle-dock"');
    expect(hudCode).toContain('id="btn-telem-toggle-minimize"');
    expect(hudCode).toContain('id="btn-telem-close"');

    // Mini summary in header
    expect(hudCode).toContain('id="telem-mini-summary"');
    expect(hudCode).toContain('id="telem-sum-gyro"');
    expect(hudCode).toContain('id="telem-sum-dist"');
    expect(hudCode).toContain('id="telem-sum-color"');
    expect(hudCode).toContain('id="telem-sum-motors"');
    expect(hudCode).toContain('id="btn-telem-expand"');

    // 2-column dock layout
    expect(hudCode).toContain('id="telem-dock-left"');
    expect(hudCode).toContain('id="telem-dock-right"');

    // Left column subtabs
    expect(hudCode).toContain('id="btn-subtab-sensors"');
    expect(hudCode).toContain('id="btn-subtab-motors"');
    expect(hudCode).toContain('id="btn-subtab-both"');

    // Content areas
    expect(hudCode).toContain('id="telem-content-sensors"');
    expect(hudCode).toContain('id="telem-content-motors"');
    expect(hudCode).toContain('id="telem-content-logs"');
  });

  it('preserves all live telemetry element IDs for updateTelemetry bindings', () => {
    const hudCode = fs.readFileSync(hudTsPath, 'utf-8');

    const expectedIds = [
      'telem-badge-color-c',
      'telem-val-light-c',
      'telem-meter-light-c',
      'telem-swatch-c',
      'telem-rgb-c',
      'telem-badge-color-d',
      'telem-val-light-d',
      'telem-meter-light-d',
      'telem-swatch-d',
      'telem-rgb-d',
      'telem-val-dist',
      'telem-meter-dist',
      'telem-dist-prox-label',
      'telem-dist-raw',
      'telem-val-gyro',
      'telem-compass-needle',
      'btn-telem-zero-gyro',
      'telem-pos-x',
      'telem-pos-z',
      'telem-pos-yaw',
      'btn-telem-capture-pose',
      'telem-live-spd-a',
      'telem-live-spd-b',
      'btn-telem-stop-all-motors',
      'btn-telem-reset-encoders',
      'telem-motors-grid',
      'btn-filter-all',
      'btn-filter-drive',
      'btn-filter-brake',
      'btn-filter-motor',
      'telem-autoscroll-chk',
      'btn-telem-clear-logs',
      'telem-log-stream',
    ];

    for (const id of expectedIds) {
      expect(hudCode).toContain(`id="${id}"`);
    }
  });

  it('implements dock persistence with localStorage in hud.ts', () => {
    const hudCode = fs.readFileSync(hudTsPath, 'utf-8');
    expect(hudCode).toContain("'fll_telem_dock_mode'");
    expect(hudCode).toContain("'fll_telem_dock_collapsed'");
    expect(hudCode).toContain('setDockMode');
    expect(hudCode).toContain('setDockCollapsed');
  });

  it('provides CSS rules for dock modes, columns, and collapsed bar in hud.css', () => {
    const cssCode = fs.readFileSync(hudCssPath, 'utf-8');

    expect(cssCode).toContain('.hud-telemetry-dock');
    expect(cssCode).toContain('.dock-bottom');
    expect(cssCode).toContain('.dock-right');
    expect(cssCode).toContain('.dock-collapsed');
    expect(cssCode).toContain('.telem-dock-left');
    expect(cssCode).toContain('.telem-dock-right');
    expect(cssCode).toContain('.telem-mini-summary');
    expect(cssCode).toContain('.subview-both');
  });
});
