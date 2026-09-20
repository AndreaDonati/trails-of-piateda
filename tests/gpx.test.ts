import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AREA_OF_INTEREST } from '../src/lib/area';
import {
  computeStats,
  haversineMeters,
  loadTrack,
  parseGpx,
  PROFILE_STEP_M,
  SIMPLIFY_TOLERANCE_M,
  simplifyLine,
  smooth,
} from '../src/lib/gpx';

const fixture = (name: string) => `tests/fixtures/gpx/${name}`;
const read = (path: string) => readFileSync(path, 'utf8');
const AMBRIA = 'content/trails/piateda-ambria/track.gpx';

describe('parseGpx validation', () => {
  it('accepts a GPX 1.1 track inside the area and extracts waypoints', () => {
    const parsed = parseGpx(read(AMBRIA), AMBRIA);
    expect(parsed.points.length).toBe(420);
    expect(parsed.points.every((p) => p.ele !== null)).toBe(true);
    expect(parsed.waypoints.features.map((f) => f.properties.name)).toEqual(['Piateda', 'Ambria']);
    expect(parsed.waypoints.features[0]?.geometry.type).toBe('Point');
  });

  it('concatenates several <trkseg> in order', () => {
    expect(parseGpx(read(fixture('known.gpx')), 'known').points.length).toBe(11);
  });

  it('rejects a file with only <rte>, explaining that <trk> is required', () => {
    expect(() => parseGpx(read(fixture('rte-only.gpx')), 'x/rte-only.gpx')).toThrow(
      /^x\/rte-only\.gpx: at least one <trk> track is required \(the file only has <rte> routes\)/,
    );
  });

  it('rejects a point outside the area of interest, naming the entry and the coordinate', () => {
    expect(() => parseGpx(read(fixture('milan.gpx')), 'content/trails/milano/track.gpx')).toThrow(
      /^content\/trails\/milano\/track\.gpx: track point 3 at lat 45\.46, lon 9\.19 is outside the area of interest \(lat 45\.95–46\.35, lon 9\.60–10\.20\)/,
    );
  });

  it('rejects fewer than two points', () => {
    expect(() => parseGpx(read(fixture('one-point.gpx')), 'p')).toThrow(/^p: at least two track points are required, found 1/);
  });

  it('rejects GPX versions other than 1.1', () => {
    expect(() => parseGpx(read(fixture('gpx-1-0.gpx')), 'p')).toThrow(/^p: GPX version 1\.1 is required, found version="1\.0"/);
  });

  it('rejects malformed XML', () => {
    expect(() => parseGpx(read(fixture('not-xml.gpx')), 'p')).toThrow(/^p: not well-formed XML/);
  });

  it('rejects a non-GPX root element', () => {
    expect(() => parseGpx('<kml version="1.1"><trk/></kml>', 'p')).toThrow(/^p: root element must be <gpx>, found <kml>/);
  });
});

describe('computeStats', () => {
  // known.gpx: 11 points due north 0.001° apart, elevation 100..200 in steps of 10.
  // Spherical distance for 0.001° of latitude is 111.195 m, so the length is 1111.95 m; the
  // tolerance of 0.5 m covers the ellipsoid-vs-sphere question the test does not decide.
  const known = parseGpx(read(fixture('known.gpx')), 'known');
  const stats = computeStats(known.points, 'known');

  it('length by haversine', () => {
    expect(stats.length_m).toBeCloseTo(1111.95, 0);
    expect(Math.abs(stats.length_m - 1111.95)).toBeLessThan(0.5);
  });

  it('bbox as [minLon, minLat, maxLon, maxLat]', () => {
    expect(stats.bbox).toEqual([9.93, 46.16, 9.93, 46.17]);
  });

  it('ascent, descent, min and max from the smoothed series', () => {
    // A linear ramp is invariant under a centred moving average, so ascent is exactly 100.
    expect(stats.elevation?.ascent_m).toBeCloseTo(100, 6);
    expect(stats.elevation?.descent_m).toBeCloseTo(0, 6);
    expect(stats.elevation?.min_m).toBeCloseTo(100, 6);
    expect(stats.elevation?.max_m).toBeCloseTo(200, 6);
  });

  it('profile resampled every PROFILE_STEP_M plus the end point', () => {
    const profile = stats.elevation!.profile;
    const expectedSamples = Math.ceil(stats.length_m / PROFILE_STEP_M) + 1;
    expect(profile.length).toBe(expectedSamples);
    expect(profile[0]).toEqual({ d: 0, ele: 100 });
    expect(profile[1]?.d).toBe(PROFILE_STEP_M);
    // 25 m along a 111.195 m segment climbing 10 m: 100 + 10 * 25 / 111.195 = 102.25
    expect(profile[1]?.ele).toBeCloseTo(102.2, 1);
    const last = profile[profile.length - 1]!;
    expect(last.d).toBeCloseTo(stats.length_m, 1);
    expect(last.ele).toBe(200);
  });

  it('smoothing removes single-point spikes', () => {
    const spiky = [100, 100, 100, 130, 100, 100, 100];
    const s = smooth(spiky, 5);
    expect(Math.max(...s)).toBeLessThan(110);
    const stats2 = computeStats(
      spiky.map((ele, i) => ({ lon: 9.93, lat: 46.16 + i * 0.0001, ele })),
      'spiky',
    );
    // Raw ascent would be 30 m; averaged over 5 points the spike becomes a 6 m plateau
    // (points 2..4), so ascent and descent are 6 m each. The end points stay as recorded.
    expect(stats2.elevation!.ascent_m).toBeCloseTo(6, 6);
    expect(stats2.elevation!.descent_m).toBeCloseTo(6, 6);
  });

  it('haversine matches a known distance', () => {
    expect(haversineMeters({ lon: 9.93, lat: 46.16 }, { lon: 9.93, lat: 46.17 })).toBeCloseTo(1111.95, 0);
  });
});

describe('tracks without <ele>', () => {
  afterEach(() => vi.restoreAllMocks());

  it('give length and bbox, null elevation, and one warning naming the entry', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const label = 'content/trails/senza-quota/track.gpx';
    const parsed = parseGpx(read(fixture('no-ele.gpx')), label);
    const stats = computeStats(parsed.points, label);
    expect(stats.elevation).toBeNull();
    expect(stats.length_m).toBeGreaterThan(200);
    expect(stats.bbox).toEqual([9.93, 46.16, 9.93, 46.162]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatch(new RegExp(`^${label}: 3 of 3 track points have no <ele>`));
  });

  it('produce a 2D line from loadTrack', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const track = loadTrack(fixture('no-ele.gpx'));
    expect(track.line.coordinates[0]).toHaveLength(2);
    expect(loadTrack(fixture('known.gpx')).line.coordinates[0]).toHaveLength(3);
  });
});

describe('simplifyLine', () => {
  // Planar distance from p to segment ab in a local metric frame; good to millimetres over a
  // few kilometres, which is enough to check a 5 m bound.
  function metricFrame(lat0: number) {
    const m = 111194.93;
    const kx = Math.cos((lat0 * Math.PI) / 180) * m;
    return (lon: number, lat: number) => [lon * kx, lat * m] as const;
  }
  function distToSegment(p: readonly [number, number], a: readonly [number, number], b: readonly [number, number]) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  }

  it('keeps every original point within SIMPLIFY_TOLERANCE_M of the simplified line and drops points', () => {
    const points = parseGpx(read(AMBRIA), AMBRIA).points;
    const simplified = simplifyLine(points).coordinates;
    expect(simplified.length).toBeLessThan(points.length);
    expect(simplified.length).toBeGreaterThan(2);

    const project = metricFrame(46.14);
    const segs = simplified.map(([lon, lat]) => project(lon as number, lat as number));
    let worst = 0;
    for (const p of points) {
      const q = project(p.lon, p.lat);
      let best = Infinity;
      for (let i = 0; i + 1 < segs.length; i++) best = Math.min(best, distToSegment(q, segs[i]!, segs[i + 1]!));
      worst = Math.max(worst, best);
    }
    // 1 cm of slack for the 1e-7° rounding of the output vertices.
    expect(worst).toBeLessThanOrEqual(SIMPLIFY_TOLERANCE_M + 0.01);
  });

  it('simplified vertices are original points, first and last included', () => {
    const points = parseGpx(read(AMBRIA), AMBRIA).points;
    const simplified = simplifyLine(points).coordinates;
    const originals = new Set(points.map((p) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`));
    for (const [lon, lat] of simplified) {
      expect(originals.has(`${(lon as number).toFixed(6)},${(lat as number).toFixed(6)}`)).toBe(true);
    }
    expect(simplified[0]).toEqual([points[0]!.lon, points[0]!.lat]);
    expect(simplified.at(-1)).toEqual([points.at(-1)!.lon, points.at(-1)!.lat]);
  });
});

describe('loadTrack memoisation', () => {
  it('returns the same object for the same unchanged file and a new one after a change', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gpx-memo-'));
    const file = join(dir, 'track.gpx');
    copyFileSync(fixture('known.gpx'), file);
    const first = loadTrack(file);
    expect(loadTrack(file)).toBe(first);
    // Same content, different bytes: a comment changes the size, which is part of the key.
    writeFileSync(file, read(file).replace('creator="fixture"', 'creator="fixture-2"'));
    const second = loadTrack(file);
    expect(second).not.toBe(first);
    expect(second.stats.length_m).toBe(first.stats.length_m);
  });
});

describe('area of interest', () => {
  it('matches the spec values', () => {
    expect(AREA_OF_INTEREST).toEqual({ minLat: 45.95, maxLat: 46.35, minLon: 9.6, maxLon: 10.2 });
  });
});
