/** Number and label formatting for the map UI (Italian locale). */
import { DIFFICULTY_LABELS, KIND_LABELS, type Difficulty, type TrackKind } from '../../lib/mapConfig';

const km = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const metres = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 });

export function formatLengthKm(lengthM: number | undefined | null): string {
  if (typeof lengthM !== 'number' || !Number.isFinite(lengthM)) return 'n.d.';
  return `${km.format(lengthM / 1000)} km`;
}

export function formatAscentM(ascentM: number | undefined | null): string {
  if (typeof ascentM !== 'number' || !Number.isFinite(ascentM)) return 'n.d.';
  return `${metres.format(ascentM)} m`;
}

/**
 * Photo count of an entry for the overview panel (design D10: the overview carries the count
 * and nothing else about photos). "foto" is invariable in Italian, so only zero changes the
 * wording. Returns null when the feature has no usable count, and the panel then shows no line:
 * the detail data has no `photos` property at all.
 */
export function formatPhotoCount(count: unknown): string | null {
  if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) return null;
  const whole = Math.floor(count);
  // No thousands separator: the count is capped at 12 photos per entry (design D10).
  return whole === 0 ? 'Nessuna foto' : `${whole} foto`;
}

export function kindLabel(kind: unknown): string {
  return typeof kind === 'string' && kind in KIND_LABELS ? KIND_LABELS[kind as TrackKind] : '';
}

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && value in DIFFICULTY_LABELS;
}

export function difficultyLabel(value: unknown): string {
  return isDifficulty(value) ? DIFFICULTY_LABELS[value] : '';
}
