import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { execSync } from 'child_process';

function getGitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || 'dev';
  } catch {
    return 'dev';
  }
}

const gitHash = getGitHash();
const appVersion = `1.0.0-dev-${gitHash}`;

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __GIT_HASH__: JSON.stringify(gitHash),
    __GIT_COMMIT_HASH__: JSON.stringify(gitHash),
  },
  plugins: [wasm(), topLevelAwait()],
  server: {
    port: 3000,
    open: false,
  },
  build: {
    target: 'esnext',
  },
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d-compat'],
  },
  test: {
    testTimeout: 20000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/types/**',
        'src/vite-env.d.ts',
      ],
    },
  },
});
