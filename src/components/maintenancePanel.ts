/**
 * What the maintenance section of a detail page shows (task 4.1/4.3, design D6/D7).
 *
 * The decisions — which lines appear, in which order, and how a recorded condition is
 * worded for each of the states `assessmentState` returns — live here rather than in
 * MaintenancePanel.astro, because they are the part worth testing and the part the owner
 * will want to reread: no fixture entry carries a `maintenance` block yet, so the wording
 * is only reachable through this function.
 *
 * Exported API:
 * - MaintenanceView, maintenanceView(input) – the section's content, or null when there is none
 *
 * The input types are written out structurally instead of imported from catalog.ts, for the
 * same reason gallery.ts does it: catalog.ts reads the filesystem and its types come from
 * `astro:content`, and this module must stay loadable from a plain Vitest file. The result of
 * `getMaintenance` satisfies them.
 *
 * Every string this module returns is user-visible Italian. `formatDate` and the number
 * formatter below are the only formatting; the template does none.
 */
import {
  CONDITION_LABELS,
  CONDITION_STALE_AFTER_MONTHS,
  TOOL_LABELS,
  type AssessmentState,
  type Condition,
  type Tool,
} from '../lib/maintenance';
import { formatDate } from './format';

/** One recorded intervention, as the schema validates it. */
export interface InterventionInput {
  /** YYYY-MM-DD. */
  date: string;
  summary: string;
  people?: number | undefined;
  person_hours?: number | undefined;
  tools?: readonly Tool[] | undefined;
  by?: string | undefined;
}

/** The `maintenance` block as written in the metadata file. Every field is optional. */
export interface MaintenanceInput {
  tools?: readonly Tool[] | undefined;
  effort_person_hours?: number | undefined;
  min_people?: number | undefined;
  notes?: string | undefined;
  condition?: Condition | undefined;
  /** YYYY-MM-DD. */
  condition_checked_on?: string | undefined;
  interventions?: readonly InterventionInput[] | undefined;
}

/** The shape of `getMaintenance(entry)`; only the fields the section reads. */
export interface MaintenanceViewInput {
  data: MaintenanceInput | null;
  /** The interventions most recent first, as `getMaintenance` sorts them. */
  interventions: readonly InterventionInput[];
  /** YYYY-MM-DD of the most recent intervention, null when none is recorded. */
  lastInterventionOn: string | null;
  state: AssessmentState;
}

/** A label and a value, rendered as one row of the section's definition list. */
export interface Fact {
  label: string;
  value: string;
  /** Shown smaller under the value. Only where the value alone can be misread. */
  hint?: string;
}

export interface ConditionView {
  state: Exclude<AssessmentState, 'none'>;
  /** Heading of the block: what the date below it is the date of. */
  label: string;
  /** The recorded level in Italian; null when the trail was checked and no level recorded. */
  level: string | null;
  /** One sentence: when it was assessed and what that is worth today. */
  detail: string;
  /**
   * True when the recorded level does not describe the trail as it is now. The template marks
   * these visibly, which is the whole point of computing the state (spec: a condition that no
   * longer describes the trail is shown as such).
   */
  needsAttention: boolean;
}

export interface InterventionView {
  /** YYYY-MM-DD, for the `datetime` attribute. */
  date: string;
  dateLabel: string;
  summary: string;
  /** People, person-hours, tools and author, in that order, each omitted when absent. */
  details: string[];
}

export interface InterventionsView {
  /**
   * The most recent one. Kept apart from the others because its date must be readable without
   * any interaction, and the template collapses only `older`.
   */
  latest: InterventionView;
  older: InterventionView[];
  /** Wording of the control that opens `older`; null when there is nothing to open. */
  olderLabel: string | null;
}

export interface MaintenanceView {
  condition: ConditionView | null;
  /** Tools, estimated effort and minimum people, in that order; absent fields are not here. */
  facts: Fact[];
  notes: string | null;
  interventions: InterventionsView | null;
}

/** Italian decimals: 7.5 → "7,5", 8 → "8". Effort is written by hand and is rarely fractional. */
const decimal = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });

const personHours = (n: number): string => `${decimal.format(n)} ${n === 1 ? 'ora-persona' : 'ore-persona'}`;

const people = (n: number): string => `${decimal.format(n)} ${n === 1 ? 'persona' : 'persone'}`;

const toolLabels = (tools: readonly Tool[]): string => tools.map((t) => TOOL_LABELS[t]).join(', ');

/**
 * How the recorded condition is presented. Returns null when there is nothing to present,
 * which is the `none` state: no date, therefore no assessment.
 *
 * The four wordings are the visible half of design D5. `current` states the date and stops;
 * the other three say why the date matters, because a level a reader takes for current when
 * it is not is worse than no level at all.
 */
function conditionView(
  block: MaintenanceInput,
  state: AssessmentState,
  lastInterventionOn: string | null,
): ConditionView | null {
  const checkedOn = block.condition_checked_on;
  if (state === 'none' || checkedOn === undefined) return null;

  const checkedLabel = formatDate(checkedOn);

  if (state === 'checked-only' || block.condition === undefined) {
    return {
      state: 'checked-only',
      label: 'Ultimo controllo',
      level: null,
      detail: `Controllato il ${checkedLabel}: nessuno stato registrato.`,
      needsAttention: false,
    };
  }

  const level = CONDITION_LABELS[block.condition];

  // Supersession names both dates, as the spec requires: the assessment date says how old the
  // level is, the intervention date says what happened to the trail after it.
  if (state === 'superseded' && lastInterventionOn !== null) {
    return {
      state: 'superseded',
      label: 'Stato rilevato',
      level,
      detail:
        `Rilevato il ${checkedLabel}, prima dell'intervento del ${formatDate(lastInterventionOn)}: ` +
        'non descrive più lo stato attuale.',
      needsAttention: true,
    };
  }

  if (state === 'needs-check') {
    return {
      state: 'needs-check',
      label: 'Stato rilevato',
      level,
      detail: `Rilevato il ${checkedLabel}, più di ${CONDITION_STALE_AFTER_MONTHS} mesi fa: va verificato di nuovo.`,
      needsAttention: true,
    };
  }

  return {
    state: 'current',
    label: 'Stato rilevato',
    level,
    detail: `Rilevato il ${checkedLabel}.`,
    needsAttention: false,
  };
}

function facts(block: MaintenanceInput): Fact[] {
  const rows: Fact[] = [];

  if (block.tools && block.tools.length > 0) {
    rows.push({ label: 'Attrezzatura', value: toolLabels(block.tools) });
  }

  if (block.effort_person_hours !== undefined) {
    rows.push({
      label: 'Lavoro stimato',
      value: personHours(block.effort_person_hours),
      // The unit is the whole point: "8 ore-persona" is eight hours of work, which four people
      // do in rather more than two hours (design D3). Without this line a reader plans a day
      // around a number that is not a duration.
      hint: "ore di lavoro complessive, non la durata dell'uscita",
    });
  }

  if (block.min_people !== undefined) {
    rows.push({ label: 'Persone necessarie', value: `almeno ${people(block.min_people)}` });
  }

  return rows;
}

function interventionView(intervention: InterventionInput): InterventionView {
  const details: string[] = [];
  if (intervention.people !== undefined) details.push(people(intervention.people));
  if (intervention.person_hours !== undefined) details.push(personHours(intervention.person_hours));
  if (intervention.tools && intervention.tools.length > 0) details.push(toolLabels(intervention.tools));
  if (intervention.by !== undefined) details.push(`a cura di ${intervention.by}`);

  return {
    date: intervention.date,
    dateLabel: formatDate(intervention.date),
    summary: intervention.summary,
    details,
  };
}

/**
 * The content of the maintenance section, or null when the entry has nothing to show there —
 * no block at all, or (defensively, since the schema rejects it) a block whose every field is
 * absent. Null means the page renders nothing: no section, no heading, no empty list.
 *
 * Pure: the staleness comparison already happened in `assessmentState`, whose result arrives
 * in `state`, so nothing here reads the clock.
 */
export function maintenanceView(input: MaintenanceViewInput): MaintenanceView | null {
  const block = input.data;
  if (block === null) return null;

  const [latest, ...older] = input.interventions;

  const view: MaintenanceView = {
    condition: conditionView(block, input.state, input.lastInterventionOn),
    facts: facts(block),
    notes: block.notes ?? null,
    interventions: latest
      ? {
          latest: interventionView(latest),
          older: older.map(interventionView),
          olderLabel:
            older.length === 0
              ? null
              : older.length === 1
                ? 'Un intervento precedente'
                : `Altri ${older.length} interventi`,
        }
      : null,
  };

  const empty =
    view.condition === null && view.facts.length === 0 && view.notes === null && view.interventions === null;
  return empty ? null : view;
}
