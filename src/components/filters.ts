/**
 * Filter logic of the list page (task 4.5, design D6).
 *
 * Pure functions plus the DOM contract shared by src/pages/index.astro (which renders the
 * cards on the server) and FilterPanel.tsx (which hides and shows them on the client). Both
 * import the id helpers below so the two sides cannot drift apart, and the logic stays
 * testable without a DOM.
 */
import type { Difficulty, TrackKind } from '../lib/mapConfig';

export interface EntryListItem {
  id: string;
  kind: TrackKind;
  name: string;
  summary: string;
  difficulty: Difficulty;
  municipalities: string[];
  tags: string[];
  length_m: number;
  /** null when the track carries no elevation. */
  ascent_m: number | null;
  duration_minutes: number | null;
  url: string;
}

export interface FilterState {
  /** '' means "any". */
  kind: '' | TrackKind;
  difficulty: '' | Difficulty;
  municipality: string;
  /** Free text over name, summary and tags. */
  q: string;
}

export const EMPTY_FILTERS: FilterState = { kind: '', difficulty: '', municipality: '', q: '' };

/** Query-string keys. `municipality` and `kind` are fixed by the spec scenarios. */
export const PARAM = { kind: 'kind', difficulty: 'difficulty', municipality: 'municipality', q: 'q' } as const;

/** The two kinds, in the order the chips show them. Also the values accepted in the URL. */
export const KINDS: readonly TrackKind[] = ['trail', 'route'];

/**
 * Must stay equal to `DIFFICULTIES` in src/content.config.ts, which is the authoritative
 * list. It is not imported from there because that module pulls in `astro:content`,
 * `astro/loaders` and node:fs, and runs the catalog layout check at import time — none of
 * which belongs in the client bundle of this island. tests/filters.test.ts asserts the two
 * lists are identical, so a fifth difficulty cannot be added in one place only.
 */
export const DIFFICULTIES: readonly Difficulty[] = ['T', 'E', 'EE', 'EEA'];

/** Case- and accent-insensitive comparison, so "Montagna" matches "montagna". */
function normalise(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
}

/**
 * Municipality comparison, used both by `matches` and by the pressed state of the chips, so
 * that `?municipality=piateda` filters the list and highlights the Piateda chip.
 */
export function sameMunicipality(a: string, b: string): boolean {
  return normalise(a) === normalise(b);
}

export function isEmpty(filters: FilterState): boolean {
  return !filters.kind && !filters.difficulty && !filters.municipality && !filters.q.trim();
}

export function matches(entry: EntryListItem, filters: FilterState): boolean {
  if (filters.kind && entry.kind !== filters.kind) return false;
  if (filters.difficulty && entry.difficulty !== filters.difficulty) return false;
  if (filters.municipality && !entry.municipalities.some((m) => sameMunicipality(m, filters.municipality))) {
    return false;
  }
  const text = normalise(filters.q);
  if (text) {
    // Every whitespace-separated word must appear somewhere in the searchable fields, so
    // "ambria val" finds the same entry as "val ambria".
    const haystack = normalise([entry.name, entry.summary, ...entry.tags].join(' '));
    if (!text.split(/\s+/).every((word) => haystack.includes(word))) return false;
  }
  return true;
}

export function applyFilters(entries: EntryListItem[], filters: FilterState): EntryListItem[] {
  return entries.filter((entry) => matches(entry, filters));
}

/** Unknown values in the query string are ignored rather than emptying the list. */
export function parseFilters(search: string): FilterState {
  const params = new URLSearchParams(search);
  const kind = params.get(PARAM.kind) ?? '';
  const difficulty = params.get(PARAM.difficulty) ?? '';
  return {
    kind: (KINDS as readonly string[]).includes(kind) ? (kind as TrackKind) : '',
    difficulty: (DIFFICULTIES as readonly string[]).includes(difficulty) ? (difficulty as Difficulty) : '',
    municipality: params.get(PARAM.municipality)?.trim() ?? '',
    q: params.get(PARAM.q)?.trim() ?? '',
  };
}

/** '' when no filter is active, so the shared URL of the full list has no query string. */
export function filtersToSearch(filters: FilterState): string {
  const params = new URLSearchParams();
  if (filters.kind) params.set(PARAM.kind, filters.kind);
  if (filters.difficulty) params.set(PARAM.difficulty, filters.difficulty);
  if (filters.municipality) params.set(PARAM.municipality, filters.municipality);
  const q = filters.q.trim();
  if (q) params.set(PARAM.q, q);
  const search = params.toString();
  return search ? `?${search}` : '';
}

/** Every municipality present in the catalog, sorted for the filter control. */
export function municipalityOptions(entries: EntryListItem[]): string[] {
  const seen = new Map<string, string>();
  for (const entry of entries) {
    for (const m of entry.municipalities) {
      const key = normalise(m);
      if (!seen.has(key)) seen.set(key, m.trim());
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'it'));
}

// --- DOM contract between the server-rendered cards and the island ---------------------

/** id of the <li> wrapping one card; the island toggles its `hidden` attribute. */
export function cardElementId(entryId: string): string {
  return `scheda-${entryId}`;
}

export const LIST_ID = 'elenco-schede';
export const COUNT_ID = 'elenco-conteggio';
export const EMPTY_STATE_ID = 'elenco-nessun-risultato';
export const CLEAR_BUTTON_ID = 'elenco-azzera-filtri';
