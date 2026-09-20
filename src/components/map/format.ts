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

export function kindLabel(kind: unknown): string {
  return typeof kind === 'string' && kind in KIND_LABELS ? KIND_LABELS[kind as TrackKind] : '';
}

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && value in DIFFICULTY_LABELS;
}

export function difficultyLabel(value: unknown): string {
  return isDifficulty(value) ? DIFFICULTY_LABELS[value] : '';
}
