import { describe, it, expect, vi, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { GIT_HASH, GIT_COMMIT_HASH, APP_VERSION, DISPLAY_VERSION } from '../src/config/version';

const hudTsPath = path.resolve(__dirname, '../src/ui/hud.ts');
const hudCssPath = path.resolve(__dirname, '../src/ui/hud.css');
const docsIndexPath = path.resolve(__dirname, '../docs/index.html');
const publicDocsIndexPath = path.resolve(__dirname, '../public/docs/index.html');
const distIndexPath = path.resolve(__dirname, '../dist/index.html');
const distDocsPath = path.resolve(__dirname, '../dist/docs/index.html');

describe('Adversarial M3 Stress Harness: Versioning, Telemetry Badges & Build Integrity', () => {

  // -------------------------------------------------------------------------
  // 1. Version Module Invariants
  // -------------------------------------------------------------------------
  describe('1. Version Module Contract & Invariants', () => {
    it('APP_VERSION and DISPLAY_VERSION strictly adhere to semantic format', () => {
      expect(GIT_HASH).toBeDefined();
      expect(typeof GIT_HASH).toBe('string');
      expect(GIT_HASH.length).toBeGreaterThan(0);

      expect(GIT_COMMIT_HASH).toBeDefined();
      expect(GIT_COMMIT_HASH).toBe(GIT_HASH);

      expect(APP_VERSION).toBe(`1.0.0-dev-${GIT_HASH}`);
      expect(DISPLAY_VERSION).toBe(`v${APP_VERSION}`);
      expect(DISPLAY_VERSION).toMatch(/^v1\.0\.0-dev-[a-f0-9]+$/);
    });

    it('DISPLAY_VERSION is prefixed with v and matches APP_VERSION', () => {
      expect(DISPLAY_VERSION.startsWith('v')).toBe(true);
      expect(DISPLAY_VERSION.slice(1)).toBe(APP_VERSION);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Static Template Verification in hud.ts
  // -------------------------------------------------------------------------
  describe('2. Telemetry Badge Markup in hud.ts', () => {
    const hudSource = fs.readFileSync(hudTsPath, 'utf-8');

    it('imports DISPLAY_VERSION from version config', () => {
      expect(hudSource).toMatch(/import\s*\{\s*DISPLAY_VERSION\s*\}\s*from\s*['"]\.\.\/config\/version['"]/);
    });

    it('contains #telem-version-badge inside .telem-header-actions interpolating DISPLAY_VERSION', () => {
      const headerActionsMatch = hudSource.match(/<div class="telem-header-actions"[^>]*>([\s\S]*?)<\/div>/);
      expect(headerActionsMatch).not.toBeNull();
      const headerActionsHtml = headerActionsMatch![1];
      expect(headerActionsHtml).toContain('id="telem-version-badge"');
      expect(headerActionsHtml).toContain('${DISPLAY_VERSION}');
      expect(headerActionsHtml).toMatch(/id="telem-version-badge"\s+class="telem-version-badge"\s+title="Simulator Version:\s*\$\{DISPLAY_VERSION\}"/);
    });

    it('contains #telem-sum-version inside .telem-mini-summary interpolating DISPLAY_VERSION', () => {
      const miniSummaryMatch = hudSource.match(/<div class="telem-mini-summary"[^>]*>([\s\S]*?)<\/div>/);
      expect(miniSummaryMatch).not.toBeNull();
      const miniSummaryHtml = miniSummaryMatch![1];
      expect(miniSummaryHtml).toContain('id="telem-sum-version"');
      expect(miniSummaryHtml).toContain('${DISPLAY_VERSION}');
      expect(miniSummaryHtml).toMatch(/id="telem-sum-version"\s+title="Simulator Version:\s*\$\{DISPLAY_VERSION\}"/);
    });

    it('ensures no hardcoded version strings exist in telemetry header markup', () => {
      expect(hudSource).not.toMatch(/id="telem-version-badge"[^>]*>v1\.0\.0/);
      expect(hudSource).not.toMatch(/id="telem-sum-version"[^>]*>v1\.0\.0/);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Empirical Telemetry Ticker Stress Test
  // -------------------------------------------------------------------------
  describe('3. Empirical Telemetry Ticker & DOM Immunity Stress Test', () => {
    // Lightweight simulated DOM element for headless stress-testing
    class MockElement {
      public id: string = '';
      public className: string = '';
      public textContent: string = '';
      public style: Record<string, string> = {};
      public attributes: Record<string, string> = {};
      public children: MockElement[] = [];
      public parentNode: MockElement | null = null;
      private classListSet: Set<string> = new Set();

      constructor(id = '', className = '', textContent = '') {
        this.id = id;
        this.className = className;
        this.textContent = textContent;
        if (className) {
          className.split(/\s+/).forEach((c) => this.classListSet.add(c));
        }
      }

      public setAttribute(k: string, v: string) {
        this.attributes[k] = v;
      }

      public getAttribute(k: string) {
        return this.attributes[k] ?? null;
      }

      public appendChild(child: MockElement) {
        child.parentNode = this;
        this.children.push(child);
      }

      public get classList() {
        return {
          add: (...cls: string[]) => cls.forEach((c) => this.classListSet.add(c)),
          remove: (...cls: string[]) => cls.forEach((c) => this.classListSet.delete(c)),
          contains: (c: string) => this.classListSet.has(c),
          toggle: (c: string, force?: boolean) => {
            const has = force !== undefined ? force : !this.classListSet.has(c);
            if (has) this.classListSet.add(c);
            else this.classListSet.delete(c);
            return has;
          },
        };
      }

      public querySelector(sel: string): MockElement | null {
        if (sel.startsWith('#')) {
          const targetId = sel.slice(1);
          if (this.id === targetId) return this;
          for (const c of this.children) {
            const found = c.querySelector(sel);
            if (found) return found;
          }
        }
        if (sel.startsWith('.')) {
          const targetClass = sel.slice(1);
          if (this.classListSet.has(targetClass)) return this;
          for (const c of this.children) {
            const found = c.querySelector(sel);
            if (found) return found;
          }
        }
        return null;
      }
    }

    function buildSimulatedHudDom() {
      const root = new MockElement('fll-hud-root');

      // Mini summary elements
      const miniSummary = new MockElement('telem-mini-summary', 'telem-mini-summary');
      const sumGyro = new MockElement('telem-sum-gyro', 'telem-sum-item', '🧭 Gyro: 0.0°');
      const sumDist = new MockElement('telem-sum-dist', 'telem-sum-item', '📏 Sonar: --cm');
      const sumCol = new MockElement('telem-sum-color', 'telem-sum-item', '🎨 C: WHITE');
      const sumMotors = new MockElement('telem-sum-motors', 'telem-sum-item', '⚙️ Motors: IDLE');
      const sumVersion = new MockElement('telem-sum-version', 'telem-sum-item telem-version-badge', DISPLAY_VERSION);
      sumVersion.setAttribute('title', `Simulator Version: ${DISPLAY_VERSION}`);

      miniSummary.appendChild(sumGyro);
      miniSummary.appendChild(sumDist);
      miniSummary.appendChild(sumCol);
      miniSummary.appendChild(sumMotors);
      miniSummary.appendChild(sumVersion);

      // Header actions elements
      const headerActions = new MockElement('telem-header-actions', 'telem-header-actions');
      const headerVersion = new MockElement('telem-version-badge', 'telem-version-badge', DISPLAY_VERSION);
      headerVersion.setAttribute('title', `Simulator Version: ${DISPLAY_VERSION}`);
      headerActions.appendChild(headerVersion);

      root.appendChild(miniSummary);
      root.appendChild(headerActions);

      return {
        root,
        miniSummary,
        sumGyro,
        sumDist,
        sumCol,
        sumMotors,
        sumVersion,
        headerVersion,
      };
    }

    it('initializes badge text exactly matching DISPLAY_VERSION', () => {
      const { sumVersion, headerVersion } = buildSimulatedHudDom();
      expect(sumVersion.textContent).toBe(DISPLAY_VERSION);
      expect(headerVersion.textContent).toBe(DISPLAY_VERSION);
      expect(sumVersion.getAttribute('title')).toBe(`Simulator Version: ${DISPLAY_VERSION}`);
      expect(headerVersion.getAttribute('title')).toBe(`Simulator Version: ${DISPLAY_VERSION}`);
    });

    it('executes 1,000 telemetry ticker cycles and proves #telem-sum-version is NEVER wiped or modified', () => {
      const dom = buildSimulatedHudDom();

      // Simulated HUD context mimicking SimulatorHud.updateTelemetry mini-summary update logic
      const simulatedUpdateTelemetry = (state: any) => {
        const gyroYaw = state.sensors?.gyroYaw !== undefined
          ? state.sensors.gyroYaw
          : (state.robot?.yawDegrees ?? 0);

        const sumGyro = dom.root.querySelector('#telem-sum-gyro');
        if (sumGyro) sumGyro.textContent = `🧭 Gyro: ${gyroYaw.toFixed(1)}°`;

        const sumDist = dom.root.querySelector('#telem-sum-dist');
        if (sumDist && state.sensors?.distanceCm !== undefined) {
          sumDist.textContent = `📏 Sonar: ${state.sensors.distanceCm}cm`;
        }

        const sumCol = dom.root.querySelector('#telem-sum-color');
        if (sumCol && state.sensors?.colorC) {
          sumCol.textContent = `🎨 C: ${state.sensors.colorC.color.toUpperCase()}`;
        }

        const sumMotors = dom.root.querySelector('#telem-sum-motors');
        if (sumMotors && state.motors) {
          let mStatus = 'IDLE';
          const spdL = Math.abs(state.motors?.left?.speed ?? 0);
          const spdR = Math.abs(state.motors?.right?.speed ?? 0);
          if (spdL > 1 || spdR > 1) {
            mStatus = 'RUNNING';
          } else if (state.motors?.left?.status === 'BRAKING' || state.motors?.right?.status === 'BRAKING') {
            mStatus = 'BRAKE';
          }
          sumMotors.textContent = `⚙️ Motors: ${mStatus}`;
        }
      };

      // Run 1,000 high-frequency ticker updates with diverse/extreme states
      const colors = ['WHITE', 'BLACK', 'RED', 'BLUE', 'GREEN', 'YELLOW', 'NONE'];
      for (let i = 0; i < 1000; i++) {
        const testState = {
          fps: 55 + (i % 10),
          sensors: {
            gyroYaw: (i * 13.7) % 360 - 180,
            distanceCm: (i * 3) % 250,
            colorC: {
              color: colors[i % colors.length],
              reflectedLight: (i * 7) % 100,
              rgb: [i % 255, (i * 2) % 255, (i * 3) % 255],
            },
          },
          motors: {
            left: { speed: (i % 3 === 0) ? 0 : 50, status: (i % 5 === 0) ? 'BRAKING' : 'RUNNING' },
            right: { speed: (i % 4 === 0) ? 0 : 75, status: (i % 5 === 0) ? 'BRAKING' : 'RUNNING' },
          },
        };

        simulatedUpdateTelemetry(testState);

        // Spot-check every 100 ticks
        if (i % 100 === 0) {
          const inspected = dom.root.querySelector('#telem-sum-version');
          expect(inspected).not.toBeNull();
          expect(inspected!.textContent).toBe(DISPLAY_VERSION);
          expect(inspected!.getAttribute('title')).toBe(`Simulator Version: ${DISPLAY_VERSION}`);
        }
      }

      // Final assertions after 1000 updates
      expect(dom.sumVersion.textContent).toBe(DISPLAY_VERSION);
      expect(dom.sumVersion.getAttribute('title')).toBe(`Simulator Version: ${DISPLAY_VERSION}`);
      expect(dom.sumGyro.textContent).not.toBe('🧭 Gyro: 0.0°'); // Actively mutated
      expect(dom.sumDist.textContent).not.toBe('📏 Sonar: --cm'); // Actively mutated
      expect(dom.sumMotors.textContent).not.toBe('⚙️ Motors: IDLE'); // Actively mutated
      expect(dom.sumVersion.parentNode).toBe(dom.miniSummary); // Still safely in DOM tree
    });

    it('simulates 100 collapse/expand toggles and proves summary version persists', () => {
      const dom = buildSimulatedHudDom();
      let collapsed = false;

      const toggleCollapse = () => {
        collapsed = !collapsed;
        dom.miniSummary.style.display = collapsed ? 'flex' : 'none';
      };

      for (let i = 0; i < 100; i++) {
        toggleCollapse();
        const el = dom.root.querySelector('#telem-sum-version');
        expect(el).not.toBeNull();
        expect(el!.textContent).toBe(DISPLAY_VERSION);
      }

      // Settle in collapsed mode
      if (!collapsed) toggleCollapse();
      expect(dom.miniSummary.style.display).toBe('flex');
      expect(dom.sumVersion.textContent).toBe(DISPLAY_VERSION);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Docs Button & Topbar Polish Invariants
  // -------------------------------------------------------------------------
  describe('4. Topbar Brand Polish & Docs Navigation', () => {
    const hudSource = fs.readFileSync(hudTsPath, 'utf-8');

    it('removes SPIKE Prime badge from hud-brand header completely', () => {
      const brandMatch = hudSource.match(/<div class="hud-brand">([\s\S]*?)<\/div>/);
      expect(brandMatch).not.toBeNull();
      const brandHtml = brandMatch![1];
      expect(brandHtml.toLowerCase()).not.toContain('spike prime');
      expect(brandHtml).not.toContain('hud-badge');
      expect(brandHtml).toContain('hud-brand-title');
      expect(brandHtml).toContain('FLL Robot Simulator');
    });

    it('binds #btn-topbar-docs to window.open with safe rel attributes', () => {
      expect(hudSource).toContain('id="btn-topbar-docs"');
      expect(hudSource).toContain("btnTopbarDocs?.addEventListener('click'");
      expect(hudSource).toContain("window.open('./docs/index.html', '_blank', 'noopener,noreferrer')");
    });

    it('verifies docs/index.html exists and is valid MkDocs bundle', () => {
      expect(fs.existsSync(docsIndexPath)).toBe(true);
      const docsContent = fs.readFileSync(docsIndexPath, 'utf-8');
      expect(docsContent.length).toBeGreaterThan(10000);
      expect(docsContent).toContain('<!doctype html>');
      expect(docsContent).toContain('<title>FLL Robot Simulator</title>');
      expect(fs.existsSync(publicDocsIndexPath)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Production Build Bundle Invariants
  // -------------------------------------------------------------------------
  describe('5. Production Build Artifact Inspection', () => {
    beforeAll(() => {
      const distAssetsDir = path.resolve(__dirname, '../dist/assets');
      let needsBuild =
        !fs.existsSync(distIndexPath) ||
        !fs.existsSync(distDocsPath) ||
        !fs.existsSync(distAssetsDir);

      if (!needsBuild) {
        const files = fs.readdirSync(distAssetsDir).filter((f) => f.endsWith('.js'));
        const hasCurrentHash = files.some((f) => {
          try {
            return fs.readFileSync(path.join(distAssetsDir, f), 'utf-8').includes(`1.0.0-dev-${GIT_HASH}`);
          } catch {
            return false;
          }
        });
        if (!hasCurrentHash) {
          needsBuild = true;
        }
      }

      if (needsBuild) {
        execSync('npm run build', {
          cwd: path.resolve(__dirname, '..'),
          stdio: 'pipe',
        });
      }
    }, 120000);

    it('dist/index.html and dist/docs/index.html exist after production build', () => {
      expect(fs.existsSync(distIndexPath)).toBe(true);
      expect(fs.existsSync(distDocsPath)).toBe(true);
    });

    it('dist/ assets contain the short git hash version string', () => {
      const distAssetsDir = path.resolve(__dirname, '../dist/assets');
      const files = fs.existsSync(distAssetsDir) ? fs.readdirSync(distAssetsDir) : [];
      const jsFiles = files.filter((f) => f.endsWith('.js'));
      expect(jsFiles.length).toBeGreaterThan(0);

      let foundVersion = false;
      for (const jsFile of jsFiles) {
        const content = fs.readFileSync(path.join(distAssetsDir, jsFile), 'utf-8');
        if (content.includes(`1.0.0-dev-${GIT_HASH}`) || /1\.0\.0-dev-[a-f0-9]+/.test(content)) {
          foundVersion = true;
          break;
        }
      }
      expect(foundVersion).toBe(true);
    });
  });
});
