import type { APIRoute } from 'astro';
import { getOverview } from '../../lib/catalog';

/** Every open or maintenance entry with simplified geometry, one request for the overview map. */
export const GET: APIRoute = async () => {
  return new Response(JSON.stringify(await getOverview()), {
    headers: { 'Content-Type': 'application/geo+json' },
  });
};
