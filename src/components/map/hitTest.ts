/**
 * How wide a track is as a click and hover target, kept out of the component so the numbers
 * can be unit tested without a browser.
 *
 * The drawn line is `LINE_WIDTH` (3 px) wide and `queryRenderedFeatures` on a `line` layer
 * buffers the query by half the evaluated `line-width`
 * (node_modules/maplibre-gl/src/style/style_layer/line_style_layer.ts, `queryRadius` and
 * `queryIntersectsFeature`), so querying the drawn layers at the cursor point gives a target
 * about three pixels across. Two things widen it:
 *
 * 1. an extra `line` layer over the same source, `hitLineWidthPx` wide and painted at
 *    `line-opacity: 0`. Querying reads `line-width` and ignores `line-opacity`, so the layer
 *    is a pure hit area and changes nothing that is drawn. Widening the visible line instead
 *    would change the map.
 * 2. a square around the cursor point passed to `queryRenderedFeatures` instead of the bare
 *    point, so a miss just outside the hit layer still selects.
 *
 * Both are larger on coarse pointers. A fingertip contact patch is around 9 mm, which the
 * platform guidelines round to a 44 px minimum target; a mouse is precise to the pixel, so
 * 24 px there is a comfortable target without swallowing clicks meant for the empty map.
 *
 * Units are MapLibre style pixels, which are CSS pixels: `line-width` is scaled by the device
 * pixel ratio inside the renderer, so the same value is the same physical size on a Retina
 * screen as on a 1× one.
 */
import { LAYER_IDS } from '../../lib/mapConfig';

/** Which of the two sets of numbers applies. Mirrors the `pointer` CSS media feature. */
export type PointerKind = 'fine' | 'coarse';

export const HIT_LINE_WIDTH_PX = 24;
export const HIT_LINE_WIDTH_COARSE_PX = 44;

/**
 * Half-size of the query square. Small next to the hit layer on purpose: the layer does most
 * of the widening, and this only catches the last few pixels, where a larger box would start
 * selecting a track the visitor was clicking away from.
 */
export const QUERY_TOLERANCE_PX = 4;
export const QUERY_TOLERANCE_COARSE_PX = 8;

/** Width of the invisible hit layer, in style pixels. */
export function hitLineWidthPx(pointer: PointerKind): number {
  return pointer === 'coarse' ? HIT_LINE_WIDTH_COARSE_PX : HIT_LINE_WIDTH_PX;
}

/** Half-size, in style pixels, of the square handed to `queryRenderedFeatures`. */
export function queryTolerancePx(pointer: PointerKind): number {
  return pointer === 'coarse' ? QUERY_TOLERANCE_COARSE_PX : QUERY_TOLERANCE_PX;
}

/** Total reach from the centre line of a track to the farthest pixel that still selects it. */
export function hitReachPx(pointer: PointerKind): number {
  return hitLineWidthPx(pointer) / 2 + queryTolerancePx(pointer);
}

/** Corners of the query square, in the order `queryRenderedFeatures` expects. */
export function queryBox(
  point: { x: number; y: number },
  tolerance: number,
): [[number, number], [number, number]] {
  const t = Math.max(0, tolerance);
  return [
    [point.x - t, point.y - t],
    [point.x + t, point.y + t],
  ];
}

/**
 * The pointer the visitor is most likely using, read once when the map is built. A device can
 * have both a trackpad and a touch screen, and `(pointer: coarse)` reports the *primary* one;
 * treating a hybrid as coarse would be the safer error, but `pointer` already resolves to
 * `fine` only where a precise device is the primary input, so the query is taken as given.
 *
 * `view` is a parameter so the rule can be tested with a stub, and so a build or a test
 * environment without `matchMedia` falls back to `fine` instead of throwing.
 */
export function detectPointerKind(
  view: { matchMedia?: (query: string) => { matches: boolean } } | undefined = typeof window ===
  'undefined'
    ? undefined
    : window,
): PointerKind {
  const matchMedia = view?.matchMedia;
  if (typeof matchMedia !== 'function') return 'fine';
  return matchMedia.call(view, '(pointer: coarse)').matches ? 'coarse' : 'fine';
}

/**
 * The layers hover and click query. Only the hit layer: it covers every line of the track
 * source, so adding the drawn layers would return the same features twice and make the
 * tolerance depend on which layer answered first.
 */
export const HIT_LAYERS: string[] = [LAYER_IDS.hit];
