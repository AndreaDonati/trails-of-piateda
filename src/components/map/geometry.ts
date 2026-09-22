/** Small GeoJSON helpers; no dependency on MapLibre so they are unit-testable. */
import type { Feature, FeatureCollection, LineString, MultiLineString, Point, Position } from 'geojson';

export type TrackProperties = {
  id: string;
  kind: 'trail' | 'route';
  name: string;
  difficulty?: string;
  length_m?: number;
  ascent_m?: number;
  url?: string;
  /**
   * Number of photos of the entry, written by `getOverview` (`OverviewProperties.photos`).
   * Present in the overview data only: the detail map gets the photos themselves as props
   * (design D10), so the selection panel treats a missing value as "unknown" and shows nothing.
   */
  photos?: number;
};

export type LineFeature = Feature<LineString | MultiLineString, TrackProperties>;
export type WaypointFeature = Feature<Point, { name?: string }>;

export function isLineFeature(f: Feature): f is LineFeature {
  return f.geometry?.type === 'LineString' || f.geometry?.type === 'MultiLineString';
}

export function isPointFeature(f: Feature): f is WaypointFeature {
  return f.geometry?.type === 'Point';
}

/** Flat list of positions of one line feature, in drawing order. */
export function linePositions(f: LineFeature): Position[] {
  return f.geometry.type === 'LineString' ? f.geometry.coordinates : f.geometry.coordinates.flat();
}

/** [west, south, east, north] over every coordinate, or null when the collection has none. */
export function collectionBounds(fc: FeatureCollection): [number, number, number, number] | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  const visit = ([lon, lat]: Position) => {
    if (lon === undefined || lat === undefined) return;
    if (lon < west) west = lon;
    if (lon > east) east = lon;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  };
  for (const f of fc.features) {
    if (isLineFeature(f)) linePositions(f).forEach(visit);
    else if (isPointFeature(f)) visit(f.geometry.coordinates);
  }
  return Number.isFinite(west) ? [west, south, east, north] : null;
}

/** A GeoJSON position as the `[lng, lat]` pair MapLibre takes. */
export function toLngLat(position: Position): [number, number] {
  return [position[0] ?? 0, position[1] ?? 0];
}

/**
 * Where the start marker goes: the point the page resolved when it gave one, the track's
 * first recorded point otherwise (spec `interactive-map`, "Declared start differs from the
 * recorded track"). Null only when there is neither.
 */
export function startMarkerPosition(
  declared: [number, number] | null | undefined,
  ends: { start: Position; end: Position } | null,
): [number, number] | null {
  if (declared) return declared;
  return ends ? toLngLat(ends.start) : null;
}

/** First point of the first line and last point of the last line. */
export function trackEndpoints(lines: LineFeature[]): { start: Position; end: Position } | null {
  const first = lines[0];
  const last = lines[lines.length - 1];
  if (!first || !last) return null;
  const startPositions = linePositions(first);
  const endPositions = linePositions(last);
  const start = startPositions[0];
  const end = endPositions[endPositions.length - 1];
  return start && end ? { start, end } : null;
}
