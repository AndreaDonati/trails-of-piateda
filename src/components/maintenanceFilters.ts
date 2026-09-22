/**
 * Filter logic and shared wording of the maintenance overview (tasks 5.2 and 5.3, design D8).
 *
 * Pure functions plus the DOM contract shared by src/pages/manutenzione.astro (which renders
 * every row on the server) and MaintenanceFilter.tsx (which hides and shows them on the
 * client). Both import the id helpers below so the two sides cannot drift apart, and the
 * logic stays testable without a DOM.
 *
 * It also carries the two pieces of Italian wording the server and the island must agree on:
 * the effort total and the row count are printed by the page and rewritten by the island when
 * the filter changes, so a formatter living on one side only would make the number change
 * shape as soon as a visitor touched a chip. The formatters are here rather than in
 * src/components/format.ts because "ore-persona" and "voci" belong to this page alone.
 */
import { sumEffortPersonHours, TOOLS, type AssessmentState, type Tool } from '../lib/maintenance';

/**
 * What the island needs to know about one server-rendered row. The effort is spelled
 * `effortPersonHours` so the list can be handed to `sumEffortPersonHours` unchanged.
 */
export interface MaintenanceListItem {
  /** Entry slug; the row element is `rowElementId(id)`. */
  id: string;
  /** false for the entries in the "senza informazioni" group at the end of the page. */
  hasMaintenance: boolean;
  tools: readonly Tool[];
  effortPersonHours?: number | undefined;
}

/** '' means "any tool". */
export type ToolFilter = '' | Tool;

/**
 * Query-string key. English like the keys of the list page (`kind`, `difficulty`,
 * `municipality`, `q`), so the two filtered URLs of the site read the same way; the value is
 * the tool identifier, which is already Italian.
 */
export const PARAM_TOOL = 'tool';

export function matchesTool(item: MaintenanceListItem, tool: ToolFilter): boolean {
  if (!tool) return true;
  return item.tools.includes(tool);
}

export function applyToolFilter(items: readonly MaintenanceListItem[], tool: ToolFilter): MaintenanceListItem[] {
  return items.filter((item) => matchesTool(item, tool));
}

/** Estimated effort of the rows the filter leaves visible, person-hours. */
export function visibleEffortPersonHours(items: readonly MaintenanceListItem[], tool: ToolFilter): number {
  return sumEffortPersonHours(applyToolFilter(items, tool));
}

/** An unknown or misspelled tool in the query string is ignored rather than emptying the page. */
export function parseToolFilter(search: string): ToolFilter {
  const value = new URLSearchParams(search).get(PARAM_TOOL) ?? '';
  return (TOOLS as readonly string[]).includes(value) ? (value as Tool) : '';
}

/** '' when no tool is selected, so the shared URL of the whole page has no query string. */
export function toolFilterToSearch(tool: ToolFilter): string {
  return tool ? `?${new URLSearchParams({ [PARAM_TOOL]: tool }).toString()}` : '';
}

/**
 * The tools actually required by the listed entries, in the order of the vocabulary. Only the
 * ones present: a chip for each of the twelve identifiers would offer eleven filters that
 * empty the page, which is worse than not offering them.
 */
export function toolOptions(items: readonly MaintenanceListItem[]): Tool[] {
  const present = new Set<Tool>();
  for (const item of items) for (const tool of item.tools) present.add(tool);
  return TOOLS.filter((tool) => present.has(tool));
}

// --- Wording shared by the server render and the island -------------------------------

const number1 = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });

/**
 * "8 ore-persona". The unit is spelled out rather than abbreviated to "ore" because the
 * number is a total of work, not a duration: eight ore-persona is two people for four hours
 * (design D3).
 */
export function formatPersonHours(hours: number): string {
  return `${number1.format(hours)} ${hours === 1 ? 'ora-persona' : 'ore-persona'}`;
}

/** "1 voce" / "7 voci". "Voce" rather than "risultato": this page is a work list, not a search. */
export function formatRowCount(n: number): string {
  return n === 1 ? '1 voce' : `${number1.format(n)} voci`;
}

/**
 * How each assessment state is named to the reader. The recorded level and its date are shown
 * next to this in every state, including the two that say the level is no longer worth much.
 */
export const ASSESSMENT_STATE_LABELS: Readonly<Record<AssessmentState, string>> = Object.freeze({
  current: 'rilievo recente',
  'needs-check': 'da riverificare',
  superseded: 'superato da un intervento',
  'checked-only': 'nessuna condizione registrata',
  none: 'condizione non rilevata',
});

// --- DOM contract between the server-rendered rows and the island ---------------------

/** id of the <li> wrapping one row; the island toggles its `hidden` attribute. */
export function rowElementId(entryId: string): string {
  return `manutenzione-${entryId}`;
}

/** The two groups, hidden as a whole when the filter leaves none of their rows visible. */
export const GROUP_WITH_ID = 'manutenzione-gruppo-con-dati';
export const GROUP_WITHOUT_ID = 'manutenzione-gruppo-senza-dati';

export const COUNT_ID = 'manutenzione-conteggio';
/** Element holding only the number of person-hours, so the island rewrites the number alone. */
export const TOTAL_ID = 'manutenzione-totale';
export const EMPTY_STATE_ID = 'manutenzione-nessun-risultato';
