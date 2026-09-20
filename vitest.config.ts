/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

// getViteConfig returns Astro's Vite config typed as Vite's UserConfig, which
// does not know about Vitest's `test` key; the reference above widens it.
export default getViteConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
