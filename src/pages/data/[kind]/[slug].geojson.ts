import type { APIRoute, GetStaticPaths } from 'astro';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { getEntries, getTrack, KIND_PATH, type CatalogEntry } from '../../../lib/catalog';

interface Props {
  entry: CatalogEntry;
}

export const getStaticPaths = (async () => {
  const entries = await getEntries();
  return entries.map((entry) => ({
    params: { kind: KIND_PATH[entry.kind], slug: entry.slug },
    props: { entry } satisfies Props,
  }));
}) satisfies GetStaticPaths;

/**
 * Full-resolution geometry for the detail map: one LineString feature (with elevation as the
 * third coordinate when available) followed by the GPX waypoints as Point features.
 */
export const GET: APIRoute<Props> = ({ props }) => {
  const { entry } = props;
  const track = getTrack(entry);
  const line: Feature<Geometry> = {
    type: 'Feature',
    geometry: track.line,
    properties: {
      id: entry.slug,
      kind: entry.kind,
      name: entry.data.name,
      difficulty: entry.data.difficulty,
      length_m: Math.round(track.stats.length_m),
      ascent_m: track.stats.elevation ? Math.round(track.stats.elevation.ascent_m) : null,
    },
  };
  const body: FeatureCollection = {
    type: 'FeatureCollection',
    features: [line, ...track.waypoints.features],
  };
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/geo+json' },
  });
};
