/** Site-wide constants and URL helpers shared by layouts and pages. */

export const SITE_NAME = 'Sentieri di Piateda';

export const REPO_URL = 'https://github.com/AndreaDonati/trails-of-piateda';

/** Data licence file in the repository (design D8), linked from the footer. */
export const DATA_LICENSE_URL = `${REPO_URL}/blob/main/LICENSE-DATA`;

/**
 * Prefix an internal path with the configured `base` (GitHub Pages serves the
 * site under `/trails-of-piateda/`). Accepts paths with or without a leading
 * slash and never produces a double slash. With `trailingSlash: 'always'`,
 * callers pass directory-style paths (`/mappa/`).
 */
export function withBase(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
  return `${base}/${path.replace(/^\/+/, '')}`;
}
