/**
 * The one start point of an entry (change `clickable-start-point`, design D1), and the name
 * and payload of the event that asks the detail map to focus it (design D2).
 *
 * Everything that needs the start point — the text on the detail page, the marker on the
 * island — reads it from `resolveStartPoint`. A second place computing it is how the printed
 * coordinates and the marker would drift apart, which is the defect this change exists to
 * prevent.
 *
 * No import at all, on purpose: the detail page's inline script imports the event helpers
 * below, so this module is bundled into the client. Reaching for `TrackPoint` from
 * src/lib/gpx.ts (which reads the filesystem) or for anything in the island (which pulls in
 * MapLibre) would drag that into the page bundle. The point shape is declared structurally
 * instead, and `TrackPoint` satisfies it.
 */

/** Which of the two sources the coordinates came from; the page shows the same numbers either way. */
export type StartPointSource = 'metadata' | 'track';

export interface StartPoint {
  lat: number;
  lon: number;
  source: StartPointSource;
}

/** The entry's `start` metadata as src/content.config.ts defines it: `lat`/`lon` given together, or not at all. */
export interface StartMetadata {
  lat?: number | undefined;
  lon?: number | undefined;
}

/** Structural shape of a recorded track point; `TrackPoint` of src/lib/gpx.ts matches it. */
export interface GeoPoint {
  lat: number;
  lon: number;
}

/** The pair when both halves are usable numbers, null otherwise (NaN included). */
function finitePoint(value: StartMetadata | GeoPoint | null | undefined): GeoPoint | null {
  const { lat, lon } = value ?? {};
  return typeof lat === 'number' && Number.isFinite(lat) && typeof lon === 'number' && Number.isFinite(lon)
    ? { lat, lon }
    : null;
}

/**
 * Declared coordinates when the metadata has them, the track's first point otherwise, null
 * when neither is available (an entry with an empty track and no declared start).
 *
 * The schema already refuses `lat` without `lon`, so the pair check here is only a guard
 * against a half-filled object reaching this function from somewhere else.
 */
export function resolveStartPoint(
  start: StartMetadata | null | undefined,
  points: readonly GeoPoint[] | null | undefined,
): StartPoint | null {
  const declared = finitePoint(start);
  if (declared) return { ...declared, source: 'metadata' };
  const recorded = finitePoint(points?.[0]);
  if (recorded) return { ...recorded, source: 'track' };
  return null;
}

/**
 * Name of the `CustomEvent` dispatched on `document` when the visitor activates the start
 * coordinates on the detail page (design D2). One direction only, page → island: nothing
 * answers it, so neither side needs the loop guard `photo:select` carries.
 */
export const START_FOCUS_EVENT = 'start:focus';

/**
 * The resolved coordinates, so the event says which point it is about. The island centres on
 * the start marker it drew rather than on these numbers: by design D1 they are the same point,
 * and using the marker keeps the camera and the highlight on one position even if a caller
 * sends something else.
 */
export interface StartFocusDetail {
  lat: number;
  lon: number;
}

export function startFocusEvent(detail: StartFocusDetail): CustomEvent<StartFocusDetail> {
  return new CustomEvent<StartFocusDetail>(START_FOCUS_EVENT, { detail });
}
