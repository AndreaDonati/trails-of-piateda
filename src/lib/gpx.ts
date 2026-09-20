/**
 * GPX parsing, validation and derived statistics (design D3).
 *
 * Exported API:
 * - parseGpx(xml, label)            – validate a GPX 1.1 string and extract track points and waypoints
 * - computeStats(points, label)     – length, bbox and (when every point has <ele>) elevation statistics
 * - simplifyLine(points)            – Douglas-Peucker at SIMPLIFY_TOLERANCE_M, for the overview file
 * - loadTrack(gpxPath, label)       – read + parse + stats + simplification, memoised per file within a build
 * - haversineMeters(a, b)           – great-circle distance, exported for tests
 * - SMOOTHING_WINDOW, PROFILE_STEP_M, SIMPLIFY_TOLERANCE_M – tunables, documented where declared
 *
 * `label` is the path shown in error and warning messages (e.g.
 * `content/trails/piateda-ambria/track.gpx`) so a failed build names the entry.
 */
import { readFileSync, statSync } from 'node:fs';
import { DOMParser, type Document, type Element } from '@xmldom/xmldom';
import { simplify } from '@turf/simplify';
import type { Feature, FeatureCollection, LineString, Point, Position } from 'geojson';
import { describeArea, isInsideArea } from './area';

export interface TrackPoint {
  lon: number;
  lat: number;
  /** Metres above sea level; null when the point has no <ele>. */
  ele: number | null;
}

/** [minLon, minLat, maxLon, maxLat] */
export type BBox = [number, number, number, number];

export interface ProfileSample {
  /** Distance from the start along the track, metres. */
  d: number;
  /** Smoothed elevation at that distance, metres. */
  ele: number;
}

export interface ElevationStats {
  ascent_m: number;
  descent_m: number;
  min_m: number;
  max_m: number;
  profile: ProfileSample[];
}

export interface TrackStats {
  length_m: number;
  bbox: BBox;
  /** null when elevation could not be derived (see computeStats). */
  elevation: ElevationStats | null;
}

export interface WaypointProperties {
  name: string | null;
}

export interface ParsedGpx {
  points: TrackPoint[];
  waypoints: FeatureCollection<Point, WaypointProperties>;
}

export interface Track extends ParsedGpx {
  stats: TrackStats;
  /** Full-resolution geometry: [lon, lat, ele] when ele is available, else [lon, lat]. */
  line: LineString;
  /** 2D geometry simplified for the overview; vertices are a subset of the original points. */
  simplified: LineString;
}

/**
 * Number of consecutive points averaged when smoothing elevation (centred window).
 *
 * Handheld GPS altitude jitters by a few metres from one point to the next; summed over
 * a long track that jitter becomes hundreds of metres of phantom ascent. Five points at
 * the 5–15 m spacing typical of a recording average over 20–60 m of trail, which removes
 * most of the jitter while still counting short genuine climbs. A point-based window was
 * chosen over a distance-based one because it is independent of recording rate and simpler
 * to reason about; the trade-off is that densely recorded tracks are smoothed over a
 * shorter distance. Must be odd.
 */
export const SMOOTHING_WINDOW = 5;

/** Distance step of the resampled elevation profile, metres. 25 m gives 400 samples for 10 km. */
export const PROFILE_STEP_M = 25;

/** Maximum distance a simplified overview line may deviate from the original track, metres. */
export const SIMPLIFY_TOLERANCE_M = 5;

const EARTH_RADIUS_M = 6371008.8;
/** Metres per degree of latitude (2πR / 360). */
const METERS_PER_DEGREE = (2 * Math.PI * EARTH_RADIUS_M) / 360;

export class GpxError extends Error {
  constructor(label: string, detail: string, options?: ErrorOptions) {
    super(`${label}: ${detail}`, options);
    this.name = 'GpxError';
  }
}

/**
 * Descendants of `parent` whose *local* name is `name`, in document order.
 *
 * Binding the GPX namespace to a prefix (`<gpx:gpx xmlns:gpx="…/GPX/1/1"><gpx:trk>`) is as valid
 * as the usual default-namespace form, but a lookup by qualified name (`getElementsByTagName`)
 * misses it and the file would be rejected as having no track. The namespace is left as a
 * wildcard rather than pinned to `http://www.topografix.com/GPX/1/1` because files that declare
 * no namespace at all are common in the wild and were accepted before; the root element and the
 * `version` attribute are what decide whether the document is GPX 1.1.
 *
 * This is also why the track and waypoint extraction below reads the DOM directly instead of
 * going through `@tmcw/togeojson`: that library matches qualified names throughout, so on a
 * prefixed document it returns no features.
 */
function byLocalName(parent: Document | Element, name: string): Element[] {
  return Array.from(parent.getElementsByTagNameNS('*', name));
}

/** Numeric value of an attribute, or null when absent or not a finite number. */
function numberAttribute(el: Element, name: string): number | null {
  const raw = el.getAttribute(name);
  if (raw === null) return null;
  const n = Number(raw.trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Position of a `<trkpt>` or `<wpt>`: [lon, lat], with the elevation appended when the element
 * carries a numeric `<ele>`. Null when lat/lon are missing or not numbers, which is how a
 * malformed point is dropped from the track.
 */
function position(el: Element): Position | null {
  const lon = numberAttribute(el, 'lon');
  const lat = numberAttribute(el, 'lat');
  if (lon === null || lat === null) return null;
  const raw = byLocalName(el, 'ele')[0]?.textContent?.trim();
  const ele = raw === undefined || raw === '' ? Number.NaN : Number(raw);
  return Number.isFinite(ele) ? [lon, lat, ele] : [lon, lat];
}

export function parseGpx(xml: string, label: string): ParsedGpx {
  const parseProblems: string[] = [];
  const parser = new DOMParser({
    // xmldom throws only on fatal errors and logs the rest; collect recoverable
    // errors too so a malformed file never passes as valid.
    onError: (level, message) => {
      if (level !== 'warning') parseProblems.push(message);
    },
  });

  let doc;
  try {
    doc = parser.parseFromString(xml, 'text/xml');
  } catch (err) {
    throw new GpxError(label, `not well-formed XML (${(err as Error).message.split('\n')[0]})`);
  }
  if (parseProblems.length > 0) {
    throw new GpxError(label, `not well-formed XML (${parseProblems[0]})`);
  }

  const root = doc.documentElement;
  if (!root || root.localName !== 'gpx') {
    throw new GpxError(label, `root element must be <gpx>, found <${root?.localName ?? 'nothing'}>`);
  }
  const version = root.getAttribute('version');
  if (version !== '1.1') {
    throw new GpxError(label, `GPX version 1.1 is required, found version="${version ?? ''}"`);
  }
  const tracks = byLocalName(doc, 'trk');
  if (tracks.length === 0) {
    const hint = byLocalName(doc, 'rte').length > 0 ? ' (the file only has <rte> routes)' : '';
    throw new GpxError(label, `at least one <trk> track is required${hint}`);
  }
  // Counted before the points are read so that a file with one point is reported as having one,
  // not as having none: a point whose lat/lon are unusable is a different error, below.
  const trkptCount = byLocalName(doc, 'trkpt').length;
  if (trkptCount < 2) {
    throw new GpxError(label, `at least two track points are required, found ${trkptCount}`);
  }

  // Segments and multiple tracks are concatenated in file order: a recording with GPS
  // pauses is still one hike, and the gap between segments is real walked distance.
  const points: TrackPoint[] = [];
  for (const trk of tracks) {
    for (const trkpt of byLocalName(trk, 'trkpt')) {
      const c = position(trkpt);
      if (c === null) continue;
      points.push({ lon: c[0] as number, lat: c[1] as number, ele: c.length > 2 ? (c[2] as number) : null });
    }
  }
  if (points.length < 2) {
    throw new GpxError(label, `at least two track points with numeric lat/lon are required, found ${points.length}`);
  }

  points.forEach((p, i) => {
    if (!isInsideArea(p.lon, p.lat)) {
      throw new GpxError(
        label,
        `track point ${i + 1} at lat ${p.lat}, lon ${p.lon} is outside the area of interest (${describeArea()})`,
      );
    }
  });

  const waypoints: Feature<Point, WaypointProperties>[] = [];
  for (const wpt of byLocalName(doc, 'wpt')) {
    const c = position(wpt);
    if (c === null) continue;
    const name = byLocalName(wpt, 'name')[0]?.textContent?.trim();
    waypoints.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: c },
      properties: { name: name !== undefined && name.length > 0 ? name : null },
    });
  }

  return { points, waypoints: { type: 'FeatureCollection', features: waypoints } };
}

export function haversineMeters(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Centred moving average. Near the ends the window shrinks symmetrically (the first and
 * last sample are left as recorded) rather than one-sidedly: a one-sided window pulls the
 * ends towards the interior and under-reports the ascent of a track that starts or ends
 * on a slope, while a symmetric one reproduces a linear ramp exactly.
 */
export function smooth(values: number[], window: number = SMOOTHING_WINDOW): number[] {
  const half = Math.floor(window / 2);
  const last = values.length - 1;
  return values.map((_, i) => {
    const reach = Math.min(half, i, last - i);
    let sum = 0;
    for (let j = i - reach; j <= i + reach; j++) sum += values[j] as number;
    return sum / (2 * reach + 1);
  });
}

export function computeStats(points: TrackPoint[], label: string): TrackStats {
  const cumulative: number[] = [0];
  const bbox: BBox = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < points.length; i++) {
    const p = points[i] as TrackPoint;
    if (i > 0) cumulative.push((cumulative[i - 1] as number) + haversineMeters(points[i - 1] as TrackPoint, p));
    if (p.lon < bbox[0]) bbox[0] = p.lon;
    if (p.lat < bbox[1]) bbox[1] = p.lat;
    if (p.lon > bbox[2]) bbox[2] = p.lon;
    if (p.lat > bbox[3]) bbox[3] = p.lat;
  }
  const length_m = cumulative[cumulative.length - 1] as number;

  // Elevation statistics need <ele> on every point: interpolating across gaps would
  // hide the problem and produce numbers that look precise but are not.
  const missing = points.filter((p) => p.ele === null).length;
  if (missing > 0) {
    console.warn(
      `${label}: ${missing} of ${points.length} track points have no <ele>; elevation statistics are unavailable for this entry`,
    );
    return { length_m, bbox, elevation: null };
  }

  // Ascent, descent and the extremes in one pass. `Math.min(...smoothed)` would pass every
  // point as a separate argument and throw RangeError somewhere above 100 000 of them, which a
  // multi-day recording at 1 Hz reaches; nothing here may scale with the point count other than
  // by iterating over it.
  const smoothed = smooth(points.map((p) => p.ele as number));
  let ascent_m = 0;
  let descent_m = 0;
  let min_m = Infinity;
  let max_m = -Infinity;
  for (let i = 0; i < smoothed.length; i++) {
    const ele = smoothed[i] as number;
    if (ele < min_m) min_m = ele;
    if (ele > max_m) max_m = ele;
    if (i === 0) continue;
    const delta = ele - (smoothed[i - 1] as number);
    if (delta > 0) ascent_m += delta;
    else descent_m -= delta;
  }

  return {
    length_m,
    bbox,
    elevation: { ascent_m, descent_m, min_m, max_m, profile: resampleProfile(cumulative, smoothed) },
  };
}

/** Linear interpolation of `ele` every PROFILE_STEP_M along `cumulative`, plus the final point. */
function resampleProfile(cumulative: number[], ele: number[]): ProfileSample[] {
  const total = cumulative[cumulative.length - 1] as number;
  const samples: ProfileSample[] = [];
  let i = 0;
  const at = (d: number): number => {
    while (i < cumulative.length - 2 && (cumulative[i + 1] as number) < d) i++;
    const d0 = cumulative[i] as number;
    const d1 = cumulative[i + 1] as number;
    const e0 = ele[i] as number;
    const e1 = ele[i + 1] as number;
    // Duplicate points give a zero-length segment; avoid dividing by zero.
    const t = d1 > d0 ? Math.min(1, Math.max(0, (d - d0) / (d1 - d0))) : 0;
    return e0 + (e1 - e0) * t;
  };
  for (let d = 0; d < total; d += PROFILE_STEP_M) {
    samples.push({ d, ele: round1(at(d)) });
  }
  samples.push({ d: round1(total), ele: round1(ele[ele.length - 1] as number) });
  return samples;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Douglas-Peucker simplification with the tolerance expressed in metres.
 *
 * The points are projected to a local equirectangular plane (metres east/north of the
 * track's centre latitude) before calling turf, so the tolerance is isotropic and in
 * metres instead of degrees, which at this latitude are worth 77 km east-west and 111 km
 * north-south. The projection's scale error over a track spanning 0.05° of latitude is
 * about 0.05 %, i.e. millimetres at 5 m. highQuality skips turf's radial pre-pass, whose
 * bound is on vertex-to-vertex distance rather than distance to the line.
 */
export function simplifyLine(points: { lon: number; lat: number }[]): LineString {
  const [minLat, maxLat] = points.reduce(
    ([lo, hi], p) => [Math.min(lo, p.lat), Math.max(hi, p.lat)],
    [Infinity, -Infinity],
  );
  const kx = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180)) * METERS_PER_DEGREE;
  const ky = METERS_PER_DEGREE;
  const projected: Feature<LineString> = {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: points.map((p) => [p.lon * kx, p.lat * ky]) },
  };
  const out = simplify(projected, { tolerance: SIMPLIFY_TOLERANCE_M, highQuality: true, mutate: true });
  // Undo the projection; rounding to 1e-7° (about 1 cm) removes floating-point residue
  // so the vertices are the original coordinates as written in the GPX.
  const coordinates = out.geometry.coordinates.map(([x, y]) => [round7((x as number) / kx), round7((y as number) / ky)]);
  return { type: 'LineString', coordinates };
}

function round7(n: number): number {
  return Math.round(n * 1e7) / 1e7;
}

const cache = new Map<string, Track>();

/**
 * Read, validate and process one track.gpx. Results are memoised on path + mtime + size so
 * the detail endpoint, the overview endpoint and the pages processing the same entry in one
 * build parse it once and the "no <ele>" warning is printed once per entry.
 */
export function loadTrack(gpxPath: string, label: string = gpxPath): Track {
  const st = statSync(gpxPath);
  const key = `${gpxPath} ${st.mtimeMs} ${st.size}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const track = describeFailures(label, () => {
    const parsed = parseGpx(readFileSync(gpxPath, 'utf8'), label);
    const stats = computeStats(parsed.points, label);
    const withEle = stats.elevation !== null;
    return {
      ...parsed,
      stats,
      line: {
        type: 'LineString',
        coordinates: parsed.points.map((p) => (withEle ? [p.lon, p.lat, p.ele as number] : [p.lon, p.lat])),
      },
      simplified: simplifyLine(parsed.points),
    } satisfies Track;
  });
  cache.set(key, track);
  return track;
}

/**
 * Run `work`, making sure whatever escapes it names the entry (design D3: a failed build must
 * tell the contributor which file to look at). Validation already throws GpxError and passes
 * through unchanged; this catches the rest — a bug here, a memory limit, a dependency throwing
 * on an input we did not anticipate — which would otherwise reach the build log as a bare
 * message such as "Maximum call stack size exceeded". The original error is kept as `cause`,
 * so its stack is still printed.
 */
function describeFailures<T>(label: string, work: () => T): T {
  try {
    return work();
  } catch (err) {
    if (err instanceof GpxError) throw err;
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    throw new GpxError(label, `could not be processed (${detail})`, { cause: err });
  }
}
