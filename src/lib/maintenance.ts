/**
 * Maintenance vocabulary and the pure rules the maintenance pages share (spec
 * `trail-maintenance`, design D4 and D5).
 *
 * Exported API:
 * - TOOLS, TOOL_LABELS, Tool             – the frozen tool vocabulary and its Italian labels
 * - CONDITIONS, CONDITION_LABELS         – the condition levels and their Italian labels
 * - CONDITIONS_BY_ATTENTION              – the same levels from the one needing most attention
 * - CONDITION_STALE_AFTER_MONTHS         – age past which an assessment is shown as needing a check
 * - BUILD_DATE                           – the day the build started, YYYY-MM-DD
 * - assessmentState(assessment, today)   – how a recorded condition must be presented
 * - compareByAttention(a, b)             – ordering of the maintenance overview
 * - sumEffortPersonHours(rows)           – total estimated effort of a list of rows
 *
 * Italian reaches the screen only through the labels; identifiers, code and validation
 * messages stay English (or the identifier itself, which is already Italian).
 *
 * Nothing here reads the file system or the content collections: the schema in
 * content.config.ts and the helpers in catalog.ts adapt the data to these functions, so
 * every rule below can be tested with a literal and a fixed `today`.
 */

/**
 * The tools a contributor may list. Closed on purpose: the point of recording tools is to
 * answer "which trails need the chainsaw", which free text never does because it spells the
 * same tool three ways (design D4). Anything the list does not cover goes in `notes`.
 *
 * Adding an identifier is one line here plus its label below; it is a change to the
 * trail-maintenance capability, which keeps the list reviewed instead of accumulating
 * synonyms.
 */
export const TOOLS = Object.freeze([
  'decespugliatore',
  'motosega',
  'sega-a-mano',
  'roncola',
  'cesoie',
  'vanga',
  'zappa',
  'rastrello',
  'badile',
  'carriola',
  'vernice-segnaletica',
  'attrezzi-da-falegname',
] as const);

export type Tool = (typeof TOOLS)[number];

/** Display name of each tool. The identifiers are already Italian; the labels punctuate them. */
export const TOOL_LABELS: Readonly<Record<Tool, string>> = Object.freeze({
  decespugliatore: 'Decespugliatore',
  motosega: 'Motosega',
  'sega-a-mano': 'Sega a mano',
  roncola: 'Roncola',
  cesoie: 'Cesoie',
  vanga: 'Vanga',
  zappa: 'Zappa',
  rastrello: 'Rastrello',
  badile: 'Badile',
  carriola: 'Carriola',
  'vernice-segnaletica': 'Vernice segnaletica',
  'attrezzi-da-falegname': 'Attrezzi da falegname',
});

/**
 * Condition of the path itself. Deliberately not the existing `status` field, which says
 * whether the entry is open, closed or closed for works: a trail can be overgrown and open
 * at the same time (design D2).
 *
 * Listed here as the spec lists them, from the best to the worst; the overview orders by
 * CONDITIONS_BY_ATTENTION instead.
 */
export const CONDITIONS = Object.freeze(['buono', 'da_sfoltire', 'invaso'] as const);

export type Condition = (typeof CONDITIONS)[number];

export const CONDITION_LABELS: Readonly<Record<Condition, string>> = Object.freeze({
  buono: 'Buono',
  da_sfoltire: 'Da sfoltire',
  invaso: 'Invaso',
});

/** The levels from the one needing most attention to the one needing least. */
export const CONDITIONS_BY_ATTENTION: readonly Condition[] = Object.freeze(['invaso', 'da_sfoltire', 'buono'] as const);

/**
 * Age past which a recorded condition is presented as needing a fresh check.
 *
 * Twelve months is a guess: vegetation closes a path over one or two growing seasons, so an
 * assessment from the previous year is a hint and not a fact. It is a single value so that
 * changing the guess is changing this line (design D5).
 */
export const CONDITION_STALE_AFTER_MONTHS = 12;

/** YYYY-MM-DD of a Date, in the timezone of the machine formatting it. */
function localIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The day the build started. Read once, here, so that every page of one build agrees on what
 * "today" is and so that tests can pass their own date instead of depending on when they run
 * (design D5). This is the only thing in the project that depends on the current date.
 *
 * Local rather than UTC: the dates in the catalog are Italian calendar dates written by hand,
 * and a build running at 01:00 CEST must not compare them against yesterday.
 */
export const BUILD_DATE: string = localIsoDate(new Date());

/**
 * `iso` moved back by whole months. Date.UTC normalises a day the target month does not have,
 * so twelve months before 29 February is 1 March; the threshold is expressed in whole months
 * and a one-day difference at the boundary does not change what the page says.
 */
function subtractMonths(iso: string, months: number): string {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1 - months, day)).toISOString().slice(0, 10);
}

/** What a recorded condition is worth, as the detail page and the overview must present it. */
export type AssessmentState =
  /** Assessed recently and nothing recorded since. */
  | 'current'
  /** Assessed more than CONDITION_STALE_AFTER_MONTHS ago. */
  | 'needs-check'
  /** An intervention was carried out after the assessment, so the level describes a past trail. */
  | 'superseded'
  /** Checked on a date but no level recorded. */
  | 'checked-only'
  /** Never assessed. */
  | 'none';

export interface Assessment {
  /** `condition_checked_on`, normalised to YYYY-MM-DD; undefined when never assessed. */
  checkedOn?: string | undefined;
  /** The recorded level; the schema rejects a level without its date, never the other way round. */
  condition?: Condition | undefined;
  /** Date of the most recent recorded intervention, YYYY-MM-DD; undefined when none is recorded. */
  lastInterventionOn?: string | undefined;
}

/**
 * Pure. All dates are normalised YYYY-MM-DD, which compares chronologically as a string.
 *
 * `today` defaults to the build date and is a parameter so a test states the date it means.
 */
export function assessmentState(assessment: Assessment, today: string = BUILD_DATE): AssessmentState {
  const { checkedOn, condition, lastInterventionOn } = assessment;
  if (checkedOn === undefined) return 'none';
  if (condition === undefined) return 'checked-only';
  // Supersession wins over the age: an intervention recorded after the assessment is a fact
  // about the trail and says the level describes something that no longer exists, while the
  // twelve months are a guess about how fast it grows back (design D5).
  if (lastInterventionOn !== undefined && lastInterventionOn > checkedOn) return 'superseded';
  // Exactly CONDITION_STALE_AFTER_MONTHS old is still current; older than that is not.
  return checkedOn < subtractMonths(today, CONDITION_STALE_AFTER_MONTHS) ? 'needs-check' : 'current';
}

/**
 * The only thing the overview ordering and the effort total need from an entry. Built once
 * per entry by `getMaintenance` in catalog.ts, so the detail page and the overview cannot
 * disagree about what an entry declares.
 */
export interface MaintenanceRow {
  /** Entry slug. Only used as the last tie-break, so that the order is total and reproducible. */
  id: string;
  /** Whether the entry declares a `maintenance` block at all, whatever it contains. */
  hasMaintenance: boolean;
  condition?: Condition | undefined;
  /** `condition_checked_on`, YYYY-MM-DD. */
  checkedOn?: string | undefined;
  effortPersonHours?: number | undefined;
}

const attentionRank = (condition: Condition | undefined): number =>
  condition === undefined ? CONDITIONS_BY_ATTENTION.length : CONDITIONS_BY_ATTENTION.indexOf(condition);

/**
 * Ordering of the maintenance overview: entries needing most attention first, entries with no
 * maintenance information last as a group of their own.
 *
 * Within the group that has information: by condition from `invaso` to `buono`, a block
 * carrying no condition after all of them, then the older assessment first (an entry with no
 * assessment date after those that have one), then by id.
 *
 * Sorting the entries nobody has looked at among the `buono` ones would read as "nothing to do
 * here", when what is true is that nobody has looked, so they are a separate group the page
 * labels (design D8). The id tie-break makes the result independent of the input order.
 */
export function compareByAttention(a: MaintenanceRow, b: MaintenanceRow): number {
  if (a.hasMaintenance !== b.hasMaintenance) return a.hasMaintenance ? -1 : 1;

  const byCondition = attentionRank(a.condition) - attentionRank(b.condition);
  if (byCondition !== 0) return byCondition;

  if (a.checkedOn !== b.checkedOn) {
    if (a.checkedOn === undefined) return 1;
    if (b.checkedOn === undefined) return -1;
    return a.checkedOn < b.checkedOn ? -1 : 1;
  }

  return a.id.localeCompare(b.id);
}

/**
 * Total estimated effort of the rows given, person-hours. A row declaring no effort counts as
 * zero, so the result is a lower bound: it sizes a work session out of the entries that carry
 * an estimate and says nothing about the ones that do not.
 */
export function sumEffortPersonHours(rows: Iterable<{ effortPersonHours?: number | undefined }>): number {
  let total = 0;
  for (const row of rows) total += row.effortPersonHours ?? 0;
  // 0.5 + 0.2 is 0.7000000000000001 in binary floating point, and this number is printed.
  return Math.round(total * 100) / 100;
}
