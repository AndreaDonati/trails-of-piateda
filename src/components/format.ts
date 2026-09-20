/**
 * Italian formatting for the server-rendered pages (task 4.3/4.5).
 *
 * Deliberately separate from src/components/map/format.ts: that module serves the map
 * popup and selection panel, where space is scarce and a missing value is abbreviated
 * to "n.d.". The trail-browsing spec requires the detail page to spell out
 * "non disponibile" instead of showing zero, so the two fallbacks cannot be shared.
 */
import { DIFFICULTY_LABELS, KIND_LABELS, type Difficulty, type TrackKind } from '../lib/mapConfig';

export const NOT_AVAILABLE = 'non disponibile';

const km1 = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const metres0 = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 });
const longDate = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** Length in kilometres with one decimal, as the list and the stats bar show it. */
export function formatKm(metres: number): string {
  return `${km1.format(metres / 1000)} km`;
}

/** Whole metres; null (no elevation data in the GPX) becomes the spec's wording. */
export function formatMetres(metres: number | null | undefined): string {
  return typeof metres === 'number' && Number.isFinite(metres)
    ? `${metres0.format(Math.round(metres))} m`
    : NOT_AVAILABLE;
}

/** 150 → "2 h 30 min", 240 → "4 h", 45 → "45 min". */
export function formatDuration(minutes: number | null | undefined): string | null {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** `verified_on` is normalised to YYYY-MM-DD by the schema; read it as UTC so the day never shifts. */
export function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? iso : longDate.format(date);
}

export function kindLabel(kind: TrackKind): string {
  return KIND_LABELS[kind];
}

export function difficultyLabel(difficulty: Difficulty): string {
  return DIFFICULTY_LABELS[difficulty];
}

/** "Questo sentiero" / "Questo percorso", for the status notice. */
export function kindDemonstrative(kind: TrackKind): string {
  return kind === 'trail' ? 'Questo sentiero' : 'Questo percorso';
}

export function formatResultCount(n: number): string {
  return n === 1 ? '1 risultato' : `${metres0.format(n)} risultati`;
}
