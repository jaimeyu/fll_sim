/**
 * Utility for resolving public asset paths relative to the application's base URL.
 * Ensures robust asset loading on local dev servers, subfolder deployments,
 * and GitHub Pages (e.g. https://<user>.github.io/fll_sim/).
 */
export function resolveAssetUrl(relativePath: string): string {
  const clean = relativePath.replace(/^\.?\//, '');

  if (typeof window !== 'undefined' && window.location) {
    // Respect Vite's configured base URL (e.g., './' or '/fll_sim/')
    const base = import.meta.env?.BASE_URL || './';

    try {
      // If base is relative (like './'), resolve against the page's directory
      const pageDir = window.location.pathname.endsWith('/')
        ? window.location.pathname
        : window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1) || '/';
      
      const baseUrl = new URL(base, `${window.location.origin}${pageDir}`);
      return new URL(clean, baseUrl).href;
    } catch {
      const pageDir = window.location.pathname.endsWith('/')
        ? window.location.pathname
        : window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1) || '/';
      return `${window.location.origin}${pageDir}${clean}`;
    }
  }

  return `./${clean}`;
}
