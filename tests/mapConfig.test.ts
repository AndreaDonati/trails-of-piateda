import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BASEMAP_SOURCE,
  CASING_COLOR,
  DEM_SOURCE,
  DIFFICULTY_COLORS,
  DIFFICULTY_COLOR_EXPRESSION,
} from '../src/lib/mapConfig';

/** Parse `--name: #hex;` declarations from the tokens file. */
function readTokens(css: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const match of css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    tokens[match[1]!] = match[2]!.toLowerCase();
  }
  return tokens;
}

// Read from disk: Astro's Vite config returns an empty string for `?raw` CSS imports under Vitest.
const tokensCss = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');

describe('mapConfig colours match tokens.css (design D12)', () => {
  const tokens = readTokens(tokensCss);

  it('difficulty colours are identical in both files', () => {
    expect(tokens['color-difficulty-t']).toBeDefined();
    expect(DIFFICULTY_COLORS).toEqual({
      T: tokens['color-difficulty-t'],
      E: tokens['color-difficulty-e'],
      EE: tokens['color-difficulty-ee'],
      EEA: tokens['color-difficulty-eea'],
    });
  });

  it('casing colour matches --color-track-casing', () => {
    expect(CASING_COLOR).toBe(tokens['color-track-casing']);
  });

  it('the line-color expression uses the same four colours', () => {
    const literals = DIFFICULTY_COLOR_EXPRESSION.filter(
      (v): v is string => typeof v === 'string' && v.startsWith('#'),
    );
    for (const colour of Object.values(DIFFICULTY_COLORS)) {
      expect(literals).toContain(colour);
    }
  });
});

describe('tile sources', () => {
  it('base map lists the three OpenTopoMap subdomains', () => {
    expect(BASEMAP_SOURCE.tiles).toHaveLength(3);
    for (const sub of ['a', 'b', 'c']) {
      expect(BASEMAP_SOURCE.tiles).toContain(
        `https://${sub}.tile.opentopomap.org/{z}/{x}/{y}.png`,
      );
    }
    expect(BASEMAP_SOURCE.maxzoom).toBe(17);
  });

  it('DEM source declares the encoding explicitly', () => {
    // MapLibre 6 does not read `encoding` from TileJSON; forgetting it renders garbage terrain.
    expect(DEM_SOURCE.encoding).toBe('terrarium');
  });
});
