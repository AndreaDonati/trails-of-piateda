import { describe, expect, it } from 'vitest';
import {
  buildProfile,
  MAX_POINTS,
  PADDING,
  profileLabels,
  VIEWBOX_HEIGHT,
  VIEWBOX_WIDTH,
} from '../src/components/elevationProfile';
import type { ElevationStats, ProfileSample } from '../src/lib/gpx';

/** A ramp from 500 m to 500 + count-1 m, one sample every 25 m as gpx.ts produces. */
function ramp(count: number, step = 25): ProfileSample[] {
  return Array.from({ length: count }, (_, i) => ({ d: i * step, ele: 500 + i }));
}

/** Coordinates of a path string, in order. */
function pathPoints(d: string): { x: number; y: number }[] {
  return [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
}

describe('buildProfile', () => {
  it('draws one point per sample and stays inside the viewBox', () => {
    const samples = ramp(120);
    const profile = buildProfile(samples);
    expect(profile).not.toBeNull();
    const points = pathPoints((profile as NonNullable<typeof profile>).line);
    expect(points).toHaveLength(samples.length);
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(VIEWBOX_WIDTH);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(VIEWBOX_HEIGHT);
    }
  });

  it('maps the first and the last sample onto the ends of the plot area', () => {
    const profile = buildProfile(ramp(50));
    const points = (profile as NonNullable<typeof profile>).points;
    expect(points[0]?.x).toBe(PADDING.left);
    expect(points[points.length - 1]?.x).toBe(VIEWBOX_WIDTH - PADDING.right);
  });

  it('puts the lowest sample on the baseline and the highest on the top edge of the plot', () => {
    const profile = buildProfile(ramp(50)) as NonNullable<ReturnType<typeof buildProfile>>;
    const ys = profile.points.map((p) => p.y);
    expect(Math.max(...ys)).toBe(VIEWBOX_HEIGHT - PADDING.bottom);
    expect(Math.min(...ys)).toBe(PADDING.top);
    expect(profile.minEle).toBe(500);
    expect(profile.maxEle).toBe(549);
  });

  it('closes the filled area on the baseline', () => {
    const profile = buildProfile(ramp(10)) as NonNullable<ReturnType<typeof buildProfile>>;
    expect(profile.area.endsWith('Z')).toBe(true);
    const points = pathPoints(profile.area);
    const baseline = VIEWBOX_HEIGHT - PADDING.bottom;
    expect(points[points.length - 1]).toEqual({ x: PADDING.left, y: baseline });
    expect(points[points.length - 2]).toEqual({ x: VIEWBOX_WIDTH - PADDING.right, y: baseline });
  });

  it('thins long tracks and keeps the last sample', () => {
    const samples = ramp(MAX_POINTS * 3 + 7);
    const profile = buildProfile(samples) as NonNullable<ReturnType<typeof buildProfile>>;
    expect(profile.points.length).toBeLessThanOrEqual(MAX_POINTS + 1);
    expect(profile.points[profile.points.length - 1]?.d).toBe(samples[samples.length - 1]?.d);
    expect(profile.totalM).toBe(samples[samples.length - 1]?.d);
  });

  it('draws a flat track along the baseline instead of dividing by zero', () => {
    const flat: ProfileSample[] = [
      { d: 0, ele: 800 },
      { d: 100, ele: 800 },
      { d: 200, ele: 800 },
    ];
    const profile = buildProfile(flat) as NonNullable<ReturnType<typeof buildProfile>>;
    expect(profile.points.every((p) => p.y === VIEWBOX_HEIGHT - PADDING.bottom)).toBe(true);
    expect(profile.minEle).toBe(profile.maxEle);
  });

  it('returns null when there is nothing to draw', () => {
    expect(buildProfile([])).toBeNull();
    expect(buildProfile([{ d: 0, ele: 500 }])).toBeNull();
    expect(
      buildProfile([
        { d: 0, ele: 500 },
        { d: 0, ele: 510 },
      ]),
    ).toBeNull();
  });
});

describe('profileLabels', () => {
  /** min/max deliberately outside the range of the resampled profile, as a summit between
   *  two resample points produces. */
  const elevation: ElevationStats = {
    ascent_m: 940,
    descent_m: 120,
    min_m: 498,
    max_m: 1502,
    profile: ramp(50),
  };

  it('labels the axis with the statistics and not with the drawn samples', () => {
    const geometry = buildProfile(elevation.profile) as NonNullable<ReturnType<typeof buildProfile>>;
    expect([geometry.minEle, geometry.maxEle]).toEqual([500, 549]);

    const labels = profileLabels(elevation, 8200);
    expect(labels.minEle).toBe('498 m');
    expect(labels.maxEle).toBe('1502 m');
  });

  it('describes the figure with the same numbers the statistics bar shows', () => {
    const labels = profileLabels(elevation, 8200);
    expect(labels.ariaLabel).toBe(
      'Profilo altimetrico: 8,2 km, quota da 498 m a 1502 m, dislivello in salita 940 m.',
    );
  });
});
