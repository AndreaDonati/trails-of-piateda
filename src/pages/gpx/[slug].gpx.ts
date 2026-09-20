import type { APIRoute, GetStaticPaths } from 'astro';
import { getEntries, readTrackBytes, type CatalogEntry } from '../../lib/catalog';

interface Props {
  entry: CatalogEntry;
}

// Slugs are unique across trails and routes (enforced by checkCatalogLayout), so the download
// URL does not need the kind.
export const getStaticPaths = (async () => {
  const entries = await getEntries();
  return entries.map((entry) => ({ params: { slug: entry.slug }, props: { entry } satisfies Props }));
}) satisfies GetStaticPaths;

/** The contributor's track.gpx, byte for byte, under a stable URL and filename. */
export const GET: APIRoute<Props> = ({ props }) => {
  return new Response(readTrackBytes(props.entry), {
    headers: { 'Content-Type': 'application/gpx+xml' },
  });
};
