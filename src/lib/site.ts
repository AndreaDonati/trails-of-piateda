/** Site-wide constants and URL helpers shared by layouts and pages. */

export const SITE_NAME = 'Sentieri di Piateda';

/**
 * Repository behind the site, linked from the footer and from "Contribuisci". It comes from the
 * environment, like `site` and `base` in astro.config.mjs, because a fork must link to itself:
 * the Pages workflow derives owner and repository from the GitHub context, and a build that does
 * not set the variable (a local `astro dev`, a checkout without the workflow) falls back to this
 * repository. A trailing slash is dropped so the paths appended below never double it.
 */
export const REPO_URL = (process.env.REPO_URL ?? 'https://github.com/AndreaDonati/trails-of-piateda').replace(
  /\/+$/,
  '',
);

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
