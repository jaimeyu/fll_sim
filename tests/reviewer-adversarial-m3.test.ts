import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { GIT_HASH, GIT_COMMIT_HASH, APP_VERSION, DISPLAY_VERSION } from '../src/config/version';

const HUD_TS_PATH = path.resolve(__dirname, '../src/ui/hud.ts');
const HUD_CSS_PATH = path.resolve(__dirname, '../src/ui/hud.css');
const VITE_CONFIG_PATH = path.resolve(__dirname, '../vite.config.ts');
const VITE_ENV_PATH = path.resolve(__dirname, '../src/vite-env.d.ts');
const VERSION_TS_PATH = path.resolve(__dirname, '../src/config/version.ts');
const DOCS_INDEX_PATH = path.resolve(__dirname, '../docs/index.html');
const PUBLIC_DOCS_PATH = path.resolve(__dirname, '../public/docs/index.html');

describe('Reviewer Adversarial Suite: Milestone 3 (F16, F17, F18, F19)', () => {
  describe('F16 Adversarial: Brand Header Cleanup & Regression Defense', () => {
    it('STRESS-1: Ensures .hud-brand contains zero occurrences of "SPIKE Prime" even in comments or attributes', () => {
      const hudCode = fs.readFileSync(HUD_TS_PATH, 'utf-8');
      const brandMatch = hudCode.match(/<div class="hud-brand"[\s\S]*?<\/div>/);
      expect(brandMatch).not.toBeNull();
      const brandHtml = brandMatch![0];

      expect(brandHtml.toLowerCase()).not.toContain('spike prime');
      expect(brandHtml).not.toContain('hud-badge');
    });

    it('STRESS-2: Ensures .hud-brand-title exists, has correct text, and inherits font styles in hud.css', () => {
      const hudCode = fs.readFileSync(HUD_TS_PATH, 'utf-8');
      expect(hudCode).toMatch(/<span class="[^"]*hud-brand-title[^"]*">FLL Robot Simulator<\/span>/);

      const hudCss = fs.readFileSync(HUD_CSS_PATH, 'utf-8');
      expect(hudCss).toMatch(/\.hud-brand-title[\s\S]*?font-size:\s*16px/);
      expect(hudCss).toMatch(/\.hud-brand-title[\s\S]*?font-weight:\s*700/);
    });
  });

  describe('F17 Adversarial: Documentation Link & File Completeness', () => {
    it('STRESS-3: Docs index.html is non-empty, contains valid MkDocs / HTML structure, and matches public/docs', () => {
      expect(fs.existsSync(DOCS_INDEX_PATH)).toBe(true);
      expect(fs.existsSync(PUBLIC_DOCS_PATH)).toBe(true);

      const docsStat = fs.statSync(DOCS_INDEX_PATH);
      expect(docsStat.size).toBeGreaterThan(10000); // 34+ KB

      const docsHtml = fs.readFileSync(DOCS_INDEX_PATH, 'utf-8');
      expect(docsHtml).toContain('<!doctype html>');
      expect(docsHtml).toContain('<title>');
      expect(docsHtml).toContain('FLL Robot Simulator');

      // Verify docs content in docs/ matches public/docs/ exactly
      const publicHtml = fs.readFileSync(PUBLIC_DOCS_PATH, 'utf-8');
      expect(docsHtml).toBe(publicHtml);
    });

    it('STRESS-4: Docs button in hud.ts uses rel="noopener,noreferrer" when calling window.open', () => {
      const hudCode = fs.readFileSync(HUD_TS_PATH, 'utf-8');
      const listenerMatch = hudCode.match(/#btn-topbar-docs[\s\S]*?window\.open\(([^)]+)\)/);
      expect(listenerMatch).not.toBeNull();
      const openArgs = listenerMatch![1];

      expect(openArgs).toContain("'./docs/index.html'");
      expect(openArgs).toContain("'_blank'");
      expect(openArgs).toContain('noopener,noreferrer');
    });
  });

  describe('F18 Adversarial: Build-Time Version Injection & Git Fallbacks', () => {
    it('STRESS-5: src/config/version.ts exports consistent version contracts without throwing in pure Node/TS environment', () => {
      expect(typeof GIT_HASH).toBe('string');
      expect(typeof GIT_COMMIT_HASH).toBe('string');
      expect(typeof APP_VERSION).toBe('string');
      expect(typeof DISPLAY_VERSION).toBe('string');

      expect(DISPLAY_VERSION).toBe(`v${APP_VERSION}`);
      expect(APP_VERSION).toBe(`1.0.0-dev-${GIT_HASH}`);
    });

    it('STRESS-6: vite.config.ts getGitHash handles missing git, empty output, and trailing newlines gracefully', () => {
      const viteConfig = fs.readFileSync(VITE_CONFIG_PATH, 'utf-8');
      expect(viteConfig).toContain('git rev-parse --short HEAD');
      expect(viteConfig).toContain("stdio: ['ignore', 'pipe', 'ignore']");
      expect(viteConfig).toMatch(/trim\(\)\s*\|\|\s*['"]dev['"]/);
      expect(viteConfig).toMatch(/catch\s*\{\s*return\s*['"]dev['"];\s*\}/);
    });

    it('STRESS-7: Typings in vite-env.d.ts declare exactly the defines injected by vite.config.ts', () => {
      const envTypes = fs.readFileSync(VITE_ENV_PATH, 'utf-8');
      expect(envTypes).toContain('declare const __APP_VERSION__: string;');
      expect(envTypes).toContain('declare const __GIT_HASH__: string;');
      expect(envTypes).toContain('declare const __GIT_COMMIT_HASH__: string;');
    });
  });

  describe('F19 Adversarial: Telemetry Dock Version Badges & Layout Safety', () => {
    it('STRESS-8: Both telemetry version badges exist with correct id and title ordering', () => {
      const hudCode = fs.readFileSync(HUD_TS_PATH, 'utf-8');

      // #telem-version-badge in header actions
      const headerBadgeMatch = hudCode.match(/<span[^>]*id="telem-version-badge"[^>]*>/);
      expect(headerBadgeMatch).not.toBeNull();
      expect(headerBadgeMatch![0]).toMatch(/id="telem-version-badge"\s+class="telem-version-badge"\s+title="Simulator Version: \${DISPLAY_VERSION}"/);

      // #telem-sum-version in mini-summary
      const miniBadgeMatch = hudCode.match(/<span[^>]*id="telem-sum-version"[^>]*>/);
      expect(miniBadgeMatch).not.toBeNull();
      expect(miniBadgeMatch![0]).toMatch(/class="[^"]*telem-version-badge[^"]*"\s+id="telem-sum-version"\s+title="Simulator Version: \${DISPLAY_VERSION}"/);
    });

    it('STRESS-9: Telemetry version badge CSS rules enforce monospace, truncation, and accessible colors', () => {
      const hudCss = fs.readFileSync(HUD_CSS_PATH, 'utf-8');

      expect(hudCss).toMatch(/\.telem-version-badge[\s\S]*?font-family:\s*['"]JetBrains Mono['"]/);
      expect(hudCss).toMatch(/\.telem-version-badge[\s\S]*?color:\s*#38bdf8/);
      expect(hudCss).toMatch(/\.telem-version-badge[\s\S]*?background:\s*rgba\(56,\s*189,\s*248,\s*0\.12\)/);

      // Responsive media query at 480px
      expect(hudCss).toMatch(/@media\s*\(max-width:\s*480px\)[\s\S]*?\.telem-version-badge[\s\S]*?max-width:\s*120px/);
      expect(hudCss).toMatch(/@media\s*\(max-width:\s*480px\)[\s\S]*?\.telem-version-badge[\s\S]*?text-overflow:\s*ellipsis/);
    });

    it('STRESS-10: Telemetry update loop does not overwrite innerHTML of #telem-mini-summary', () => {
      const hudCode = fs.readFileSync(HUD_TS_PATH, 'utf-8');
      expect(hudCode).not.toContain("telemMiniSummary.innerHTML =");
      expect(hudCode).not.toContain("telem-mini-summary.innerHTML =");
      expect(hudCode).toContain("const sumGyro = this.rootElement.querySelector('#telem-sum-gyro')");
    });
  });
});
