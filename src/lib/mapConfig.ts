/**
 * Map configuration (design D4): tile providers, attribution and track styling.
 * This module is the only place where tile URLs appear, so swapping a provider
 * is a change to this file alone. It imports only types from maplibre-gl so it
 * can be used from Astro frontmatter and Vitest without a browser.
 */
import type {
  ExpressionSpecification,
  RasterDEMSourceSpecification,
  RasterSourceSpecification,
} from 'maplibre-gl';

// --- Base map -----------------------------------------------------------------

export const BASEMAP_ATTRIBUTION =
  '© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)';

/** OpenTopoMap raster tiles: keyless, contours and relief already rendered. */
export const BASEMAP_SOURCE: RasterSourceSpecification = {
  type: 'raster',
  tiles: [
    'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
    'https://b.tile.opentopomap.org/{z}/{x}/{y}.png',
    'https://c.tile.opentopomap.org/{z}/{x}/{y}.png',
  ],
  tileSize: 256,
  maxzoom: 17,
  attribution: BASEMAP_ATTRIBUTION,
};

// --- Terrain ------------------------------------------------------------------

export const TERRAIN_PROVIDER = {
  name: 'Mapterhorn',
  url: 'https://mapterhorn.com/attribution',
} as const;

/** Plain-text form for the site footer. */
export const TERRAIN_ATTRIBUTION = `© ${TERRAIN_PROVIDER.name}`;

/** HTML form for the in-map attribution control (the provider asks for a link). */
export const TERRAIN_ATTRIBUTION_HTML = `<a href="${TERRAIN_PROVIDER.url}" target="_blank" rel="noopener">© ${TERRAIN_PROVIDER.name}</a>`;

/**
 * Mapterhorn raster-dem. Its TileJSON (checked 2026-09-20) declares
 * `encoding: "terrarium"` and `tileSize: 512`, but MapLibre 6 reads `encoding`
 * only from the source options, not from the TileJSON, so both are repeated
 * here. `maxzoom` is 14 because the service returns 404 above that over the
 * Valtellina; MapLibre ignores 404s silently but the requests are wasted.
 */
export const DEM_SOURCE: RasterDEMSourceSpecification = {
  type: 'raster-dem',
  url: 'https://tiles.mapterhorn.com/tilejson.json',
  encoding: 'terrarium',
  tileSize: 512,
  maxzoom: 14,
  attribution: TERRAIN_ATTRIBUTION_HTML,
};

/*
 * Alternative DEM, kept as a one-line swap (design D4): AWS Terrain Tiles,
 * Terrarium encoding, no key. Attribution would become
 * "Terrain Tiles © Mapzen / AWS Open Data". Replace DEM_SOURCE with:
 *
 * export const DEM_SOURCE: RasterDEMSourceSpecification = {
 *   type: 'raster-dem',
 *   tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
 *   encoding: 'terrarium',
 *   tileSize: 256,
 *   maxzoom: 15,
 * };
 */

/**
 * Source ids used in the style. The terrain and the hillshade use two source
 * entries pointing at the same tiles, as in MapLibre's 3D-terrain example: the
 * terrain source is overscaled per tile size while the hillshade needs the
 * source at its native zoom, and sharing one source produces seams.
 */
export const SOURCE_IDS = {
  basemap: 'opentopomap',
  terrain: 'terrain-dem',
  hillshade: 'hillshade-dem',
  tracks: 'tracks',
} as const;

export const LAYER_IDS = {
  basemap: 'basemap',
  hillshade: 'hillshade',
  casing: 'tracks-casing',
  trail: 'tracks-trail',
  route: 'tracks-route',
} as const;

/** Overview default; mountain relief around Piateda reads better slightly exaggerated. */
export const DEFAULT_TERRAIN_EXAGGERATION = 1.2;

/** Combined attribution for pages that show both providers (footer, overview). */
export const OVERVIEW_ATTRIBUTION = `${BASEMAP_ATTRIBUTION} | ${TERRAIN_ATTRIBUTION}`;

/** Piateda town centre; used when a map has no data to fit. */
export const DEFAULT_CENTER: [number, number] = [9.93, 46.16];
export const DEFAULT_ZOOM = 11;

// --- Track styling --------------------------------------------------------------

export type Difficulty = 'T' | 'E' | 'EE' | 'EEA';
export type TrackKind = 'trail' | 'route';

/**
 * Same hex values as `--color-difficulty-*` in src/styles/tokens.css (Open
 * Color green 9, blue 8, red 8, gray 9). Duplicated on purpose: MapLibre paint
 * cannot read CSS custom properties (design D12). tests/mapConfig.test.ts
 * fails when the two sets differ.
 */
export const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  T: '#2b8a3e',
  E: '#1971c2',
  EE: '#e03131',
  EEA: '#212529',
};

/** Colour used when `difficulty` is missing or unknown. */
export const DIFFICULTY_FALLBACK_COLOR = '#495057';

/** Same value as `--color-track-casing`; white outline under every line so green reads over the topo map. */
export const CASING_COLOR = '#ffffff';

export const LINE_WIDTH = 3;
export const LINE_WIDTH_HOVER = 5;
/** Casing is drawn as a wider line underneath; 2 px visible on each side. */
export const CASING_WIDTH = LINE_WIDTH + 4;
export const CASING_WIDTH_HOVER = LINE_WIDTH_HOVER + 4;

/** `line-dasharray` per kind. Values are multiples of line width. Trails solid, routes dashed. */
export const DASH_PATTERNS: Record<TrackKind, number[] | undefined> = {
  trail: undefined,
  route: [2, 1.5],
};

/** `line-color` expression selecting the difficulty colour from the feature property. */
export const DIFFICULTY_COLOR_EXPRESSION: ExpressionSpecification = [
  'match',
  ['get', 'difficulty'],
  'T',
  DIFFICULTY_COLORS.T,
  'E',
  DIFFICULTY_COLORS.E,
  'EE',
  DIFFICULTY_COLORS.EE,
  'EEA',
  DIFFICULTY_COLORS.EEA,
  DIFFICULTY_FALLBACK_COLOR,
];

/** Italian labels for the UI. */
export const KIND_LABELS: Record<TrackKind, string> = {
  trail: 'Sentiero',
  route: 'Percorso',
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  T: 'Turistico',
  E: 'Escursionistico',
  EE: 'Escursionisti esperti',
  EEA: 'Escursionisti esperti con attrezzatura',
};
