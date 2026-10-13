/**
 * Application build version and Git commit hash metadata.
 * Injected at build time via Vite's `define` configuration.
 */
export const GIT_HASH: string = typeof __GIT_HASH__ !== 'undefined' ? __GIT_HASH__ : 'dev';
export const GIT_COMMIT_HASH: string = typeof __GIT_COMMIT_HASH__ !== 'undefined' ? __GIT_COMMIT_HASH__ : GIT_HASH;
export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : `1.0.0-dev-${GIT_HASH}`;
export const DISPLAY_VERSION: string = `v${APP_VERSION}`;
