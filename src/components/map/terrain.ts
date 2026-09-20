/**
 * Classification of MapLibre `error` events for the DEM sources, kept out of the component
 * so the rule can be unit tested without a browser (spec `interactive-map`, "Terrain tiles
 * unreachable").
 *
 * What MapLibre 6 actually reports, read in node_modules/maplibre-gl/src:
 * - `tile/tile_manager.ts` `_loadTile`: a tile request that answers 404 never reaches the
 *   `error` event. The manager marks the tile errored and re-runs `update`, so the parent or
 *   the children tiles are drawn in its place. This is why `DEM_SOURCE.maxzoom = 14` costs
 *   nothing beyond the wasted requests it avoids.
 * - the same function fires `ErrorEvent(err, { tile })` for every other tile failure (500,
 *   network, CORS). One such event means one bad tile, not a dead service.
 * - `source/raster_tile_source.ts` `load`: a TileJSON that cannot be fetched or parsed fires
 *   an `ErrorEvent` with no `tile`. Nothing of the source will ever load.
 * - `style/style.ts` `addSource` attaches `sourceId` to every event of the source, both kinds
 *   included, which is how a DEM error is told apart from a base-map one.
 */

/** Shape of the parts of MapLibre's `ErrorEvent` this module reads. */
export interface MapErrorEventLike {
  sourceId?: string;
  /** Present only on tile-level failures. */
  tile?: unknown;
}

/**
 * `source`: the DEM source itself failed, nothing will load.
 * `tile`: one DEM tile failed; the surrounding terrain keeps working.
 * `none`: the error is not about a DEM source and is none of this module's business.
 */
export type DemFailure = 'none' | 'tile' | 'source';

/**
 * How many tile-level failures are tolerated before the terrain is given up. A viewport at
 * trail zoom asks for a handful of DEM tiles, so a count in that range means the service is
 * failing rather than one tile being broken; below it, keeping terrain on shows more of the
 * relief than dropping it would.
 */
export const DEM_TILE_FAILURE_LIMIT = 8;

export function classifyDemError(
  event: MapErrorEventLike,
  demSourceIds: ReadonlySet<string>,
): DemFailure {
  if (!event.sourceId || !demSourceIds.has(event.sourceId)) return 'none';
  return event.tile ? 'tile' : 'source';
}

/**
 * Terrain is dropped at once on a source-level failure, and only after
 * `DEM_TILE_FAILURE_LIMIT` tile failures, counted over the life of the map.
 */
export function shouldDropTerrain(failure: DemFailure, tileFailures: number): boolean {
  if (failure === 'source') return true;
  return failure === 'tile' && tileFailures >= DEM_TILE_FAILURE_LIMIT;
}
