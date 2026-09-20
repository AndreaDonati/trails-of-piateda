import { describe, expect, it } from 'vitest';
import { formatPhotoCount } from '../src/components/map/format';
import {
  classifyDemError,
  shouldDropTerrain,
  DEM_TILE_FAILURE_LIMIT,
} from '../src/components/map/terrain';

describe('formatPhotoCount', () => {
  it('names the empty case in words', () => {
    expect(formatPhotoCount(0)).toBe('Nessuna foto');
  });

  it('keeps "foto" invariable for one and for many', () => {
    expect(formatPhotoCount(1)).toBe('1 foto');
    expect(formatPhotoCount(12)).toBe('12 foto');
  });

  it('returns null when the feature carries no usable count', () => {
    // Detail features have no `photos` property at all; the panel then shows no line.
    expect(formatPhotoCount(undefined)).toBeNull();
    expect(formatPhotoCount(null)).toBeNull();
    expect(formatPhotoCount('3')).toBeNull();
    expect(formatPhotoCount(Number.NaN)).toBeNull();
    expect(formatPhotoCount(-1)).toBeNull();
  });
});

const DEM_SOURCES: ReadonlySet<string> = new Set(['terrain-dem', 'hillshade-dem']);

describe('classifyDemError', () => {
  it('ignores errors of other sources and errors without a source', () => {
    expect(classifyDemError({ sourceId: 'opentopomap', tile: {} }, DEM_SOURCES)).toBe('none');
    expect(classifyDemError({}, DEM_SOURCES)).toBe('none');
  });

  it('reads a DEM event without a tile as a failure of the source itself', () => {
    // What MapLibre fires when the TileJSON cannot be fetched: nothing of the DEM will load.
    expect(classifyDemError({ sourceId: 'terrain-dem' }, DEM_SOURCES)).toBe('source');
  });

  it('reads a DEM event carrying a tile as a single tile failure', () => {
    expect(classifyDemError({ sourceId: 'hillshade-dem', tile: {} }, DEM_SOURCES)).toBe('tile');
  });
});

describe('shouldDropTerrain', () => {
  it('drops terrain at once when the source itself failed', () => {
    expect(shouldDropTerrain('source', 0)).toBe(true);
  });

  it('keeps terrain while tile failures stay under the limit', () => {
    expect(shouldDropTerrain('tile', 1)).toBe(false);
    expect(shouldDropTerrain('tile', DEM_TILE_FAILURE_LIMIT - 1)).toBe(false);
  });

  it('drops terrain once tile failures reach the limit', () => {
    expect(shouldDropTerrain('tile', DEM_TILE_FAILURE_LIMIT)).toBe(true);
  });

  it('never drops terrain for an error that is not about the DEM', () => {
    expect(shouldDropTerrain('none', DEM_TILE_FAILURE_LIMIT * 10)).toBe(false);
  });
});
