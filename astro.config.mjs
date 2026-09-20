// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// Deployment target. GitHub Pages serves the site under the repository
// sub-path, so both values come from the environment (set in the Pages
// workflow) with local defaults that work for `astro dev` and `astro preview`.
const site = process.env.SITE_URL ?? 'http://localhost:4321';
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  site,
  base,
  output: 'static',
  trailingSlash: 'always',
  integrations: [react()],
});
