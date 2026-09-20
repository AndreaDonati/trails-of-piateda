/**
 * Catalog access for pages and endpoints.
 *
 * Exported API:
 * - checkCatalogLayout(root?)     – build-time check of the content/ directory structure (spec
 *                                   "Catalog entry structure"); returns the slugs found per kind
 * - getEntries()                  – every trail and route as a CatalogEntry (kind, slug, url, dir, data),
 *                                   sorted by name
 * - getTrack(entry)               – parsed GPX for an entry: stats, full-resolution line, simplified
 *                                   line, waypoints (memoised, see gpx.ts)
 * - readTrackBytes(entry)         – the original track.gpx bytes, for the download endpoint
 * - getPhotos(entry)              – derived photos of an entry, sorted along the track, with the
 *                                   URLs of the display and thumbnail images (memoised, see photos.ts)
 * - getOverview()                 – FeatureCollection of the entries with status open/maintenance,
 *                                   simplified geometry, properties listed in OverviewProperties
 * - entryUrl(kind, slug, base?)   – page URL: <base>/sentieri/<slug>/ or <base>/percorsi/<slug>/
 * - KIND_PATH, SLUG_PATTERN, CONTENT_ROOT
 *
 * Paths are relative to the project root, which Astro makes the working directory during
 * sync/dev/build. `import.meta.url` is not usable here because endpoints are bundled into
 * dist/ chunks at build time.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { CollectionEntry } from 'astro:content';
import type { Feature, FeatureCollection, LineString } from 'geojson';
import { loadTrack, type Track } from './gpx';
import { loadPhotos, type DerivedPhoto } from './photos';

export type Kind = 'trail' | 'route';

/** URL path segment per kind (Italian, user-facing). */
export const KIND_PATH: Record<Kind, 'sentieri' | 'percorsi'> = { trail: 'sentieri', route: 'percorsi' };

const KIND_LAYOUT: Record<Kind, { dir: 'trails' | 'routes'; meta: string }> = {
  trail: { dir: 'trails', meta: 'trail.yaml' },
  route: { dir: 'routes', meta: 'route.yaml' },
};

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const TRACK_FILE = 'track.gpx';
export const CONTENT_ROOT = 'content';

export type TrailData = CollectionEntry<'trails'>['data'];
export type RouteData = CollectionEntry<'routes'>['data'];

interface EntryBase {
  slug: string;
  /** Page URL including the site base, with trailing slash. */
  url: string;
  /** Entry directory relative to the project root, e.g. content/trails/piateda-ambria */
  dir: string;
}
export type CatalogEntry =
  | (EntryBase & { kind: 'trail'; data: TrailData })
  | (EntryBase & { kind: 'route'; data: RouteData });

/**
 * Verifies the directory layout of the catalog and the uniqueness of slugs across kinds.
 * Throws an Error whose message starts with the offending directory. Dotfiles (.DS_Store,
 * .gitkeep) are ignored everywhere. A missing content/trails or content/routes directory is
 * accepted as an empty collection.
 */
export function checkCatalogLayout(root: string = CONTENT_ROOT): Record<'trails' | 'routes', string[]> {
  const found: Record<'trails' | 'routes', string[]> = { trails: [], routes: [] };
  const owners = new Map<string, string>();

  for (const kind of ['trail', 'route'] as const) {
    const { dir, meta } = KIND_LAYOUT[kind];
    const kindDir = join(root, dir);
    if (!existsSync(kindDir)) continue;

    for (const name of readdirSync(kindDir).sort()) {
      if (name.startsWith('.')) continue;
      const entryDir = join(kindDir, name);
      if (!statSync(entryDir).isDirectory()) {
        throw new Error(`${entryDir}: only entry directories are allowed directly under ${kindDir}/`);
      }
      if (!SLUG_PATTERN.test(name)) {
        throw new Error(
          `${entryDir}: directory name "${name}" must match ${SLUG_PATTERN} (lowercase letters and digits separated by single hyphens)`,
        );
      }

      const files = readdirSync(entryDir).filter((f: string) => !f.startsWith('.'));
      for (const required of [meta, TRACK_FILE]) {
        if (!files.includes(required)) throw new Error(`${entryDir}: missing ${required}`);
      }
      for (const f of files) {
        if (f === meta || f === TRACK_FILE) continue;
        if (f === 'photos' && statSync(join(entryDir, f)).isDirectory()) continue;
        throw new Error(`${entryDir}: unexpected file "${f}" (allowed: ${meta}, ${TRACK_FILE} and a photos/ directory)`);
      }

      const other = owners.get(name);
      if (other) {
        throw new Error(
          `${entryDir}: slug "${name}" is already used by ${other}; slugs must be unique across trails and routes because both share the /gpx/ download URL`,
        );
      }
      owners.set(name, entryDir);
      found[dir].push(name);
    }
  }
  return found;
}

export function entryUrl(kind: Kind, slug: string, base: string = import.meta.env.BASE_URL): string {
  return `${base.replace(/\/+$/, '')}/${KIND_PATH[kind]}/${slug}/`;
}

function toEntry<K extends Kind>(kind: K, e: { id: string; data: unknown }): CatalogEntry {
  const base: EntryBase = {
    slug: e.id,
    url: entryUrl(kind, e.id),
    dir: join(CONTENT_ROOT, KIND_LAYOUT[kind].dir, e.id),
  };
  return kind === 'trail'
    ? { ...base, kind: 'trail', data: e.data as TrailData }
    : { ...base, kind: 'route', data: e.data as RouteData };
}

export async function getEntries(): Promise<CatalogEntry[]> {
  // Dynamic import: content.config.ts imports this module for checkCatalogLayout, and a static
  // import of astro:content from here would make the content config depend on the module it
  // configures. It also keeps unit tests of the layout check free of the Astro runtime.
  const { getCollection } = await import('astro:content');
  const [trails, routes] = await Promise.all([getCollection('trails'), getCollection('routes')]);
  return [...trails.map((e) => toEntry('trail', e)), ...routes.map((e) => toEntry('route', e))].sort((a, b) =>
    a.data.name.localeCompare(b.data.name, 'it'),
  );
}

export function getTrack(entry: CatalogEntry): Track {
  return loadTrack(join(entry.dir, TRACK_FILE));
}

export function readTrackBytes(entry: CatalogEntry): Uint8Array<ArrayBuffer> {
  return new Uint8Array(readFileSync(join(entry.dir, TRACK_FILE)));
}

/**
 * Photos of an entry, validated and positioned against its track (spec "Entry photos" and
 * "Derived photo data"). Empty when the entry has no photos/ directory.
 */
export function getPhotos(entry: CatalogEntry): Promise<DerivedPhoto[]> {
  return loadPhotos({
    dir: entry.dir,
    slug: entry.slug,
    photos: entry.data.photos,
    cover: entry.data.cover,
    points: getTrack(entry).points,
  });
}

export interface OverviewProperties {
  id: string;
  kind: Kind;
  name: string;
  difficulty: TrailData['difficulty'];
  length_m: number;
  /** null when the track has no elevation data. */
  ascent_m: number | null;
  url: string;
  /**
   * Number of photos of the entry. Only the count: the overview map shows no photos, and
   * carrying their positions here would grow the single overview request for nothing (design D10).
   */
  photos: number;
}

export async function getOverview(): Promise<FeatureCollection<LineString, OverviewProperties>> {
  const entries = (await getEntries()).filter((e) => e.data.status !== 'closed');
  const features = await Promise.all(
    entries.map(async (e): Promise<Feature<LineString, OverviewProperties>> => {
      const track = getTrack(e);
      const photos = await getPhotos(e);
      return {
        type: 'Feature',
        geometry: track.simplified,
        properties: {
          id: e.slug,
          kind: e.kind,
          name: e.data.name,
          difficulty: e.data.difficulty,
          length_m: Math.round(track.stats.length_m),
          ascent_m: track.stats.elevation ? Math.round(track.stats.elevation.ascent_m) : null,
          url: e.url,
          photos: photos.length,
        },
      };
    }),
  );
  return { type: 'FeatureCollection', features };
}
