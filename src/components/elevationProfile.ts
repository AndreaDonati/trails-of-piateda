/**
 * Geometry of the build-time elevation profile (task 4.4, design D5).
 *
 * Kept apart from ElevationProfile.astro so the path generation is a pure function that
 * Vitest can check without a DOM: given the resampled profile of src/lib/gpx.ts it returns
 * the SVG coordinates and the two path strings. `profileLabels` builds the text of the axis
 * labels, which comes from the statistics rather than from the drawn points.
 */
import type { ElevationStats, ProfileSample } from '../lib/gpx';
import { formatKm, formatMetres } from './format';

/** User units of the SVG. The component gives the <svg> the same aspect ratio in CSS. */
export const VIEWBOX_WIDTH = 1000;
export const VIEWBOX_HEIGHT = 260;

/** Room for the elevation labels on the left and the distance labels underneath. */
// Left padding holds the elevation labels, drawn right-aligned 8 units inside it at the
// 20-unit font size of `.profile__label`. Four digits plus the unit need about 62 units;
// 54 clipped the first digit of a four-figure elevation (measured on a 1010 m track).
export const PADDING = { top: 14, right: 14, bottom: 26, left: 78 } as const;

/**
 * Upper bound on the number of drawn points. A 25 m resampling step (PROFILE_STEP_M) gives
 * 400 samples per 10 km; past this the extra vertices are below one SVG user unit apart and
 * only make the HTML bigger, so long tracks are thinned by a constant stride.
 */
export const MAX_POINTS = 400;

export interface ProfilePoint {
  /** SVG user-unit coordinates. */
  x: number;
  y: number;
  /** Source values, carried for the hover readout. */
  d: number;
  ele: number;
}

export interface ProfileGeometry {
  points: ProfilePoint[];
  /** Polyline through every point. */
  line: string;
  /** Same polyline closed onto the baseline, for the filled area. */
  area: string;
  minEle: number;
  maxEle: number;
  /** Track length used as the x axis extent, metres. */
  totalM: number;
  /** Plot rectangle in user units, for gridlines and labels. */
  plot: { left: number; right: number; top: number; bottom: number };
}

function thin(samples: ProfileSample[], maxPoints: number): ProfileSample[] {
  if (samples.length <= maxPoints) return samples;
  const stride = Math.ceil(samples.length / maxPoints);
  const kept = samples.filter((_, i) => i % stride === 0);
  const last = samples[samples.length - 1] as ProfileSample;
  if (kept[kept.length - 1] !== last) kept.push(last);
  return kept;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Returns null when there is nothing to draw (fewer than two samples, or a track whose
 * samples all sit at the same distance), so the caller renders no profile at all.
 */
export function buildProfile(
  samples: ProfileSample[],
  options: { maxPoints?: number } = {},
): ProfileGeometry | null {
  const kept = thin(samples, options.maxPoints ?? MAX_POINTS);
  if (kept.length < 2) return null;

  const totalM = (kept[kept.length - 1] as ProfileSample).d;
  if (!(totalM > 0)) return null;

  const elevations = kept.map((s) => s.ele);
  const minEle = Math.min(...elevations);
  const maxEle = Math.max(...elevations);
  // A flat track would divide by zero; drawing it along the middle of the box is honest
  // because the two axis labels then carry the same value.
  const span = maxEle - minEle || 1;

  const plot = {
    left: PADDING.left,
    right: VIEWBOX_WIDTH - PADDING.right,
    top: PADDING.top,
    bottom: VIEWBOX_HEIGHT - PADDING.bottom,
  };
  const width = plot.right - plot.left;
  const height = plot.bottom - plot.top;

  const points: ProfilePoint[] = kept.map((s) => ({
    x: round2(plot.left + (Math.min(s.d, totalM) / totalM) * width),
    y: round2(plot.bottom - ((s.ele - minEle) / span) * height),
    d: s.d,
    ele: s.ele,
  }));

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
  const first = points[0] as ProfilePoint;
  const last = points[points.length - 1] as ProfilePoint;
  const area = `${line} L${last.x} ${plot.bottom} L${first.x} ${plot.bottom} Z`;

  return { points, line, area, minEle, maxEle, totalM, plot };
}

export interface ProfileLabels {
  /** Elevation printed at the bottom and at the top of the y axis, already formatted. */
  minEle: string;
  maxEle: string;
  /** Summary read by a screen reader in place of the drawing. */
  ariaLabel: string;
}

/**
 * Axis labels and accessible description of the profile.
 *
 * The elevations come from ElevationStats, not from the geometry above: the profile is
 * resampled every PROFILE_STEP_M and then thinned to MAX_POINTS, so a summit that falls
 * between two samples is absent from the drawn curve. Taking the labels from the geometry
 * made the same page show one "quota massima" on the profile and a different one in the
 * statistics bar. The curve keeps its own extremes as the drawing scale; only what is
 * written agrees with the statistics.
 */
export function profileLabels(elevation: ElevationStats, lengthM: number): ProfileLabels {
  const min = formatMetres(elevation.min_m);
  const max = formatMetres(elevation.max_m);
  return {
    minEle: min,
    maxEle: max,
    ariaLabel: `Profilo altimetrico: ${formatKm(lengthM)}, quota da ${min} a ${max}, dislivello in salita ${formatMetres(
      elevation.ascent_m,
    )}.`,
  };
}
