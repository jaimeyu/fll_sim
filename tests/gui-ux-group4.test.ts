import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SimulatorHud, DEFAULT_PORT_MAPPING } from '../src/ui/hud';

describe('GUI & UX Overhaul - Group 4 & Group 5: Top Bar Robot Design & Port Mapping Inspector', () => {
  const hudTsPath = path.resolve(__dirname, '../src/ui/hud.ts');
  const hudCssPath = path.resolve(__dirname, '../src/ui/hud.css');

  // =========================================================================
  // Static Markup & Wiring Checks
  // =========================================================================
  describe('Markup & DOM Structure', () => {
    it('defines #btn-topbar-robot-design in topbar actions next to telemetry and inspector', () => {
      const hudCode = fs.readFileSync(hudTsPath, 'utf-8');

      expect(hudCode).toContain('id="btn-topbar-robot-design"');
      expect(hudCode).toContain('title="Robot Design & Hardware Port Inspector"');
      expect(hudCode).toContain('🤖 Robot Design');
    });

    it('implements #modal-robot-design with .hud-robot-design-modal class and clean header', () => {
      const hudCode = fs.readFileSync(hudTsPath, 'utf-8');

      expect(hudCode).toContain('id="modal-robot-design" class="hud-robot-design-modal" style="display: none;"');
      expect(hudCode).toContain('id="modal-robot-design-backdrop"');
      expect(hudCode).toContain('id="btn-close-robot-design"');
      expect(hudCode).toContain('Robot Design &amp; Hardware Port Inspector');
    });

    it('defines Section A: Robot Architecture Presets & CAD Upload', () => {
      const hudCode = fs.readFileSync(hudTsPath, 'utf-8');

      // Presets
      expect(hudCode).toContain('id="preset-card-advanced"');
      expect(hudCode).toContain('Advanced Driving Base');
      expect(hudCode).toContain('id="preset-card-compact"');
      expect(hudCode).toContain('Compact SPIKE Base');

      // Upload CAD button and hidden file input
      expect(hudCode).toContain('id="btn-upload-robot-cad"');
      expect(hudCode).toContain('id="input-robot-cad-file"');
      expect(hudCode).toContain('accept=".io,.ldr,.mpd,.dat"');

      // Quick link to CAD Inspector
      expect(hudCode).toContain('id="btn-design-open-cad-inspector"');
    });

    it('defines Section B: Hardware Port Mapping Inspector with all peripheral controls', () => {
      const hudCode = fs.readFileSync(hudTsPath, 'utf-8');

      // Drive Left and Right
      expect(hudCode).toContain('id="select-port-drive-left" data-role="drive-left"');
      expect(hudCode).toContain('id="select-port-drive-right" data-role="drive-right"');
      expect(hudCode).toContain('id="badge-port-drive-left"');
      expect(hudCode).toContain('id="badge-port-drive-right"');

      // Auxiliaries C-F
      expect(hudCode).toContain('id="select-port-aux1" data-role="aux1"');
      expect(hudCode).toContain('id="select-port-aux2" data-role="aux2"');
      expect(hudCode).toContain('id="select-port-aux3" data-role="aux3"');
      expect(hudCode).toContain('id="select-port-aux4" data-role="aux4"');

      // Optical and Distance Sensors
      expect(hudCode).toContain('id="select-port-color-left" data-role="color-left"');
      expect(hudCode).toContain('id="select-port-color-right" data-role="color-right"');
      expect(hudCode).toContain('id="select-port-ultrasonic" data-role="ultrasonic"');

      // Internal IMU
      expect(hudCode).toContain('Hub Gyro (Fixed internal IMU, Status: Connected)');

      // Save button
      expect(hudCode).toContain('id="btn-save-port-mapping"');
    });
  });

  // =========================================================================
  // Functional Logic & Methods
  // =========================================================================
  describe('Modal Interaction & Port Mapping State', () => {
    it('provides openRobotDesignModal, closeRobotDesignModal, and toggleRobotDesignModal', () => {
      const mockModal = { style: { display: 'none' } };
      const mockHud = {
        robotDesignModal: mockModal,
        isRobotDesignModalOpen: false,
        openRobotDesignModal: SimulatorHud.prototype.openRobotDesignModal,
        closeRobotDesignModal: SimulatorHud.prototype.closeRobotDesignModal,
        toggleRobotDesignModal: SimulatorHud.prototype.toggleRobotDesignModal,
        syncPortMappingUI: vi.fn(),
      };

      // Open
      mockHud.openRobotDesignModal();
      expect(mockHud.isRobotDesignModalOpen).toBe(true);
      expect(mockModal.style.display).toBe('flex');
      expect(mockHud.syncPortMappingUI).toHaveBeenCalled();

      // Close
      mockHud.closeRobotDesignModal();
      expect(mockHud.isRobotDesignModalOpen).toBe(false);
      expect(mockModal.style.display).toBe('none');

      // Toggle Open
      mockHud.toggleRobotDesignModal();
      expect(mockHud.isRobotDesignModalOpen).toBe(true);
      expect(mockModal.style.display).toBe('flex');

      // Toggle Close
      mockHud.toggleRobotDesignModal();
      expect(mockHud.isRobotDesignModalOpen).toBe(false);
      expect(mockModal.style.display).toBe('none');
    });

    it('selects robot presets and saves to localStorage', () => {
      const mockLocalStorage: Record<string, string> = {};
      vi.stubGlobal('localStorage', {
        getItem: (k: string) => mockLocalStorage[k] || null,
        setItem: (k: string, v: string) => { mockLocalStorage[k] = v; },
        removeItem: (k: string) => { delete mockLocalStorage[k]; },
        clear: () => {},
      });

      const onPresetChange = vi.fn();
      const mockCardAdv = { classList: { toggle: vi.fn() }, querySelector: vi.fn().mockReturnValue({ textContent: '', className: '' }) };
      const mockCardComp = { classList: { toggle: vi.fn() }, querySelector: vi.fn().mockReturnValue({ textContent: '', className: '' }) };

      const mockHud = {
        rootElement: {
          querySelector: (sel: string) => {
            if (sel === '#preset-card-advanced') return mockCardAdv;
            if (sel === '#preset-card-compact') return mockCardComp;
            return null;
          },
        },
        activeRobotPreset: 'advanced',
        ROBOT_PRESET_STORAGE_KEY: 'fll_robot_active_preset',
        callbacks: { onRobotPresetChange: onPresetChange },
        logConsole: vi.fn(),
        selectRobotPreset: SimulatorHud.prototype.selectRobotPreset,
        getActiveRobotPreset: SimulatorHud.prototype.getActiveRobotPreset,
      };

      // Select compact
      mockHud.selectRobotPreset('compact');
      expect(mockHud.getActiveRobotPreset()).toBe('compact');
      expect(mockLocalStorage['fll_robot_active_preset']).toBe('compact');
      expect(onPresetChange).toHaveBeenCalledWith('compact');

      // Select advanced
      mockHud.selectRobotPreset('advanced');
      expect(mockHud.getActiveRobotPreset()).toBe('advanced');
      expect(mockLocalStorage['fll_robot_active_preset']).toBe('advanced');
      expect(onPresetChange).toHaveBeenCalledWith('advanced');

      vi.unstubAllGlobals();
    });

    it('persists port mappings to localStorage and triggers callbacks', () => {
      const mockLocalStorage: Record<string, string> = {};
      vi.stubGlobal('localStorage', {
        getItem: (k: string) => mockLocalStorage[k] || null,
        setItem: (k: string, v: string) => { mockLocalStorage[k] = v; },
        removeItem: (k: string) => { delete mockLocalStorage[k]; },
        clear: () => {},
      });

      const onPortChange = vi.fn();
      const statusTextEl = { textContent: '' };

      const mockHud = {
        rootElement: {
          querySelector: (sel: string) => (sel === '#port-save-status-text' ? statusTextEl : null),
        },
        portMappings: { ...DEFAULT_PORT_MAPPING, driveLeft: 'B', driveRight: 'A' },
        PORT_STORAGE_KEY: 'fll_robot_port_mappings',
        callbacks: { onPortMappingChange: onPortChange },
        logConsole: vi.fn(),
        updatePortStatusBadges: vi.fn(),
        savePortMappings: SimulatorHud.prototype.savePortMappings,
        getPortMappings: SimulatorHud.prototype.getPortMappings,
      };

      mockHud.savePortMappings();
      expect(mockHud.updatePortStatusBadges).toHaveBeenCalled();
      expect(onPortChange).toHaveBeenCalledWith(expect.objectContaining({ driveLeft: 'B', driveRight: 'A' }));
      expect(mockLocalStorage['fll_robot_port_mappings']).toBeDefined();

      const parsed = JSON.parse(mockLocalStorage['fll_robot_port_mappings']);
      expect(parsed.driveLeft).toBe('B');
      expect(parsed.driveRight).toBe('A');

      vi.unstubAllGlobals();
    });

    it('updates port status badges when components are remapped or disabled', () => {
      const badges: Record<string, { textContent: string; className: string }> = {
        'badge-port-drive-left': { textContent: '', className: '' },
        'badge-port-drive-right': { textContent: '', className: '' },
        'badge-port-aux1': { textContent: '', className: '' },
        'badge-port-aux2': { textContent: '', className: '' },
        'badge-port-aux3': { textContent: '', className: '' },
        'badge-port-aux4': { textContent: '', className: '' },
        'badge-port-color-left': { textContent: '', className: '' },
        'badge-port-color-right': { textContent: '', className: '' },
        'badge-port-ultrasonic': { textContent: '', className: '' },
      };

      const mockHud = {
        rootElement: {
          querySelector: (sel: string) => badges[sel.replace('#', '')] || null,
        },
        portMappings: {
          ...DEFAULT_PORT_MAPPING,
          driveLeft: 'C', // Remapped from A
          ultrasonic: 'None', // Disabled
        },
        updatePortStatusBadges: SimulatorHud.prototype.updatePortStatusBadges,
      };

      mockHud.updatePortStatusBadges();

      // Normal mapped
      expect(badges['badge-port-drive-right'].className).toBe('port-status-badge status-mapped');
      expect(badges['badge-port-drive-right'].textContent).toContain('Connected & Mapped');

      // Remapped
      expect(badges['badge-port-drive-left'].className).toBe('port-status-badge status-remapped');
      expect(badges['badge-port-drive-left'].textContent).toContain('Remapped');

      // Disabled
      expect(badges['badge-port-ultrasonic'].className).toBe('port-status-badge status-disabled');
      expect(badges['badge-port-ultrasonic'].textContent).toContain('Disabled');
    });
  });

  // =========================================================================
  // CSS Stylesheet Verification
  // =========================================================================
  describe('CSS Styling Rules in hud.css', () => {
    it('contains all required style classes for robot design modal and port inspector', () => {
      const cssCode = fs.readFileSync(hudCssPath, 'utf-8');

      expect(cssCode).toContain('.hud-robot-design-modal');
      expect(cssCode).toContain('.modal-robot-design-backdrop');
      expect(cssCode).toContain('.robot-design-modal-card');
      expect(cssCode).toContain('.robot-design-modal-header');
      expect(cssCode).toContain('.robot-design-modal-body');
      expect(cssCode).toContain('.robot-preset-grid');
      expect(cssCode).toContain('.robot-preset-card');
      expect(cssCode).toContain('.robot-preset-card.active');
      expect(cssCode).toContain('.port-mapping-grid');
      expect(cssCode).toContain('.port-item-card');
      expect(cssCode).toContain('.port-status-badge');
      expect(cssCode).toContain('.port-status-badge.status-mapped');
      expect(cssCode).toContain('.port-status-badge.status-remapped');
      expect(cssCode).toContain('.port-status-badge.status-disabled');
      expect(cssCode).toContain('.port-select');
      expect(cssCode).toContain('.robot-design-modal-footer');
    });
  });
});
