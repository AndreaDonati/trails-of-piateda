import { describe, expect, it } from 'vitest';
import { LAYER_IDS, LINE_WIDTH } from '../src/lib/mapConfig';
import {
  HIT_LAYERS,
  HIT_LINE_WIDTH_COARSE_PX,
  HIT_LINE_WIDTH_PX,
  QUERY_TOLERANCE_COARSE_PX,
  QUERY_TOLERANCE_PX,
  detectPointerKind,
  hitLineWidthPx,
  hitReachPx,
  queryBox,
  queryTolerancePx,
} from '../src/components/map/hitTest';

describe('hit area width', () => {
  it('is the mouse width for a fine pointer and the touch width for a coarse one', () => {
    expect(hitLineWidthPx('fine')).toBe(HIT_LINE_WIDTH_PX);
    expect(hitLineWidthPx('coarse')).toBe(HIT_LINE_WIDTH_COARSE_PX);
  });

  it('is wider on a coarse pointer', () => {
    expect(hitLineWidthPx('coarse')).toBeGreaterThan(hitLineWidthPx('fine'));
  });

  it('stays at or above the 44 px touch-target minimum on a coarse pointer', () => {
    expect(hitLineWidthPx('coarse')).toBeGreaterThanOrEqual(44);
  });

  it('is several times the drawn line, which is the bug being fixed', () => {
    // LINE_WIDTH is 3: querying the drawn layers made a track a three-pixel target.
    expect(hitLineWidthPx('fine')).toBeGreaterThanOrEqual(LINE_WIDTH * 4);
  });
});

describe('query tolerance', () => {
  it('is the fine value for a mouse and the coarse one for a finger', () => {
    expect(queryTolerancePx('fine')).toBe(QUERY_TOLERANCE_PX);
    expect(queryTolerancePx('coarse')).toBe(QUERY_TOLERANCE_COARSE_PX);
  });

  it('stays small next to the hit layer, which does most of the widening', () => {
    expect(queryTolerancePx('fine')).toBeLessThan(hitLineWidthPx('fine') / 2);
    expect(queryTolerancePx('coarse')).toBeLessThan(hitLineWidthPx('coarse') / 2);
  });
});

describe('hitReachPx', () => {
  it('adds half the hit layer to the query tolerance', () => {
    expect(hitReachPx('fine')).toBe(HIT_LINE_WIDTH_PX / 2 + QUERY_TOLERANCE_PX);
    expect(hitReachPx('coarse')).toBe(HIT_LINE_WIDTH_COARSE_PX / 2 + QUERY_TOLERANCE_COARSE_PX);
  });
});

describe('queryBox', () => {
  it('returns the two opposite corners of a square centred on the point', () => {
    expect(queryBox({ x: 100, y: 50 }, 4)).toEqual([
      [96, 46],
      [104, 54],
    ]);
  });

  it('accepts a point near the canvas edge without clamping it', () => {
    // MapLibre clips the query to the viewport itself; clamping here would shrink the box
    // asymmetrically and make the edge of the map harder to click than the middle.
    expect(queryBox({ x: 1, y: 1 }, 8)).toEqual([
      [-7, -7],
      [9, 9],
    ]);
  });

  it('treats a negative tolerance as no tolerance rather than inverting the box', () => {
    expect(queryBox({ x: 10, y: 10 }, -5)).toEqual([
      [10, 10],
      [10, 10],
    ]);
  });
});

describe('detectPointerKind', () => {
  const view = (matches: boolean) => ({ matchMedia: (query: string) => ({ query, matches }) });

  it('reads the primary pointer from the media query', () => {
    expect(detectPointerKind(view(true))).toBe('coarse');
    expect(detectPointerKind(view(false))).toBe('fine');
  });

  it('asks for the primary pointer, not any pointer', () => {
    // `(any-pointer: coarse)` matches a laptop with a touch screen, where the trackpad is
    // still what the visitor uses; the widened target would then be a lost mouse click.
    let asked = '';
    detectPointerKind({
      matchMedia: (query: string) => {
        asked = query;
        return { matches: false };
      },
    });
    expect(asked).toBe('(pointer: coarse)');
  });

  it('falls back to fine where matchMedia does not exist', () => {
    expect(detectPointerKind(undefined)).toBe('fine');
    expect(detectPointerKind({})).toBe('fine');
  });
});

describe('HIT_LAYERS', () => {
  it('is the hit layer alone, so a feature is never returned twice', () => {
    expect(HIT_LAYERS).toEqual([LAYER_IDS.hit]);
  });

  it('does not query the drawn layers, whose width is the narrow target', () => {
    expect(HIT_LAYERS).not.toContain(LAYER_IDS.trail);
    expect(HIT_LAYERS).not.toContain(LAYER_IDS.route);
    expect(HIT_LAYERS).not.toContain(LAYER_IDS.casing);
  });
});
