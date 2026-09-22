/**
 * The maintenance section's content rules (tasks 4.1/4.3/4.4).
 *
 * No fixture entry carries a `maintenance` block yet and no page renders the component yet,
 * so these tests over the pure `maintenanceView` are the only thing exercising the wording and
 * the omission rules. What they cannot prove is listed at the bottom of the file.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  maintenanceView,
  type InterventionInput,
  type MaintenanceInput,
  type MaintenanceViewInput,
} from '../src/components/maintenancePanel';
import type { AssessmentState } from '../src/lib/maintenance';

/**
 * Builds the argument the way `getMaintenance` does: interventions sorted most recent first,
 * `lastInterventionOn` taken from the first of them. `state` is passed explicitly because the
 * component never computes it; `assessmentState` does, and tests/maintenance.test.ts covers it.
 */
function input(data: MaintenanceInput | null, state: AssessmentState): MaintenanceViewInput {
  const interventions = [...(data?.interventions ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  return { data, interventions, lastInterventionOn: interventions[0]?.date ?? null, state };
}

const INTERVENTION: InterventionInput = { date: '2025-07-20', summary: 'Sfoltito il tratto nel bosco.' };

/** A block with every field filled, used for the four condition states. */
const full: MaintenanceInput = {
  tools: ['decespugliatore', 'roncola'],
  effort_person_hours: 8,
  min_people: 2,
  notes: 'Serve una scala per il tratto attrezzato.',
  condition: 'invaso',
  condition_checked_on: '2025-05-12',
  interventions: [INTERVENTION],
};

describe('an entry with nothing to show', () => {
  it('renders no section when the entry declares no maintenance block', () => {
    expect(maintenanceView(input(null, 'none'))).toBeNull();
  });

  it('renders no section for a block whose every field is absent, which the schema also rejects', () => {
    expect(maintenanceView(input({}, 'none'))).toBeNull();
  });
});

describe('the recorded condition', () => {
  it('states the level and the date when the assessment is current', () => {
    const view = maintenanceView(input({ ...full, interventions: undefined }, 'current'));

    expect(view?.condition).toEqual({
      state: 'current',
      label: 'Stato rilevato',
      level: 'Invaso',
      detail: 'Rilevato il 12 maggio 2025.',
      needsAttention: false,
    });
  });

  it('keeps the level and the date and asks for a fresh check when the assessment is old', () => {
    const view = maintenanceView(input({ ...full, interventions: undefined }, 'needs-check'));

    expect(view?.condition).toEqual({
      state: 'needs-check',
      label: 'Stato rilevato',
      level: 'Invaso',
      detail: 'Rilevato il 12 maggio 2025, più di 12 mesi fa: va verificato di nuovo.',
      needsAttention: true,
    });
  });

  it('names both dates and says the level no longer describes the trail when superseded', () => {
    const view = maintenanceView(input(full, 'superseded'));

    expect(view?.condition).toEqual({
      state: 'superseded',
      label: 'Stato rilevato',
      level: 'Invaso',
      detail:
        "Rilevato il 12 maggio 2025, prima dell'intervento del 20 luglio 2025: " +
        'non descrive più lo stato attuale.',
      needsAttention: true,
    });
  });

  it('reports the date of a check that recorded no level', () => {
    const view = maintenanceView(input({ condition_checked_on: '2026-06-12' }, 'checked-only'));

    expect(view?.condition).toEqual({
      state: 'checked-only',
      label: 'Ultimo controllo',
      level: null,
      detail: 'Controllato il 12 giugno 2026: nessuno stato registrato.',
      needsAttention: false,
    });
  });

  it('shows nothing about the condition when the entry was never assessed', () => {
    const view = maintenanceView(input({ min_people: 2 }, 'none'));

    expect(view?.condition).toBeNull();
  });

  it('falls back to the plain wording if an entry is marked superseded with no intervention recorded', () => {
    // Unreachable through getMaintenance, which derives both from the same list; asserted so
    // that a future caller cannot produce a sentence naming an intervention date that is absent.
    const view = maintenanceView({
      data: { condition: 'buono', condition_checked_on: '2025-05-12' },
      interventions: [],
      lastInterventionOn: null,
      state: 'superseded',
    });

    expect(view?.condition?.detail).toBe('Rilevato il 12 maggio 2025.');
  });
});

describe('the facts', () => {
  it('lists tools by their Italian labels, the effort in ore-persona and the minimum people', () => {
    const view = maintenanceView(input(full, 'superseded'));

    expect(view?.facts).toEqual([
      { label: 'Attrezzatura', value: 'Decespugliatore, Roncola' },
      {
        label: 'Lavoro stimato',
        value: '8 ore-persona',
        hint: "ore di lavoro complessive, non la durata dell'uscita",
      },
      { label: 'Persone necessarie', value: 'almeno 2 persone' },
    ]);
  });

  it('never shows a tool identifier', () => {
    const view = maintenanceView(input({ tools: ['sega-a-mano', 'vernice-segnaletica'] }, 'none'));

    expect(view?.facts[0]?.value).toBe('Sega a mano, Vernice segnaletica');
  });

  it('writes fractional effort with the Italian decimal comma', () => {
    const view = maintenanceView(input({ effort_person_hours: 7.5 }, 'none'));

    expect(view?.facts[0]?.value).toBe('7,5 ore-persona');
  });

  it('keeps the singular for one person and one person-hour', () => {
    const view = maintenanceView(input({ effort_person_hours: 1, min_people: 1 }, 'none'));

    expect(view?.facts.map((f) => f.value)).toEqual(['1 ora-persona', 'almeno 1 persona']);
  });

  it('shows only the minimum people for a block that declares only that', () => {
    const view = maintenanceView(input({ min_people: 2 }, 'none'));

    expect(view).toEqual({
      condition: null,
      facts: [{ label: 'Persone necessarie', value: 'almeno 2 persone' }],
      notes: null,
      interventions: null,
    });
  });

  it('carries the free-text notes through unchanged', () => {
    const view = maintenanceView(input({ notes: 'Il guado è agibile solo con acqua bassa.' }, 'none'));

    expect(view?.notes).toBe('Il guado è agibile solo con acqua bassa.');
    expect(view?.facts).toEqual([]);
  });
});

describe('the intervention log', () => {
  const three: InterventionInput[] = [
    { date: '2023-09-02', summary: 'Ripristinata la segnaletica.' },
    { date: '2025-07-20', summary: 'Sfoltito il tratto nel bosco.', people: 4, person_hours: 6 },
    { date: '2024-06-15', summary: 'Riaperto il canale di scolo.', tools: ['zappa'], by: 'Gruppo Alpini Piateda' },
  ];

  it('shows the most recent one on its own, outside anything that has to be opened', () => {
    const view = maintenanceView(input({ interventions: three }, 'none'));

    expect(view?.interventions?.latest).toEqual({
      date: '2025-07-20',
      dateLabel: '20 luglio 2025',
      summary: 'Sfoltito il tratto nel bosco.',
      details: ['4 persone', '6 ore-persona'],
    });
  });

  it('keeps the older ones newest first, behind a control that says how many there are', () => {
    const view = maintenanceView(input({ interventions: three }, 'none'));

    expect(view?.interventions?.older.map((i) => i.date)).toEqual(['2024-06-15', '2023-09-02']);
    expect(view?.interventions?.olderLabel).toBe('Altri 2 interventi');
  });

  it('lists people, person-hours, tools and author in that order, omitting what is absent', () => {
    const view = maintenanceView(input({ interventions: three }, 'none'));

    expect(view?.interventions?.older[0]?.details).toEqual(['Zappa', 'a cura di Gruppo Alpini Piateda']);
    expect(view?.interventions?.older[1]?.details).toEqual([]);
  });

  it('collapses nothing when a single intervention is recorded', () => {
    const view = maintenanceView(input({ interventions: [INTERVENTION] }, 'none'));

    expect(view?.interventions?.older).toEqual([]);
    expect(view?.interventions?.olderLabel).toBeNull();
  });

  it('names the singular case rather than "altri 1 interventi"', () => {
    const view = maintenanceView(input({ interventions: [INTERVENTION, three[0] as InterventionInput] }, 'none'));

    expect(view?.interventions?.olderLabel).toBe('Un intervento precedente');
  });

  it('shows no log at all for a block that records none', () => {
    const view = maintenanceView(input({ min_people: 2 }, 'none'));

    expect(view?.interventions).toBeNull();
  });
});

describe('the component stylesheet', () => {
  // Task 4.4: every colour in the section must come from src/styles/tokens.css, the only file
  // allowed to hold literal values. Scoped to this component: a repository-wide sweep belongs
  // to a test of the repository, not of this section.
  const source = readFileSync('src/components/MaintenancePanel.astro', 'utf8');
  const style = source.slice(source.indexOf('<style>'));

  it('uses no literal colour', () => {
    expect(style).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(style).not.toMatch(/\b(rgb|rgba|hsl|hsla|oklch|color-mix)\(/);
  });

  it('takes every colour from a token', () => {
    const declarations = [...style.matchAll(/^\s*([a-z-]*(?:^|-)?color|background):\s*([^;]+);/gm)];

    expect(declarations.length).toBeGreaterThan(0);
    for (const [, property, value] of declarations) {
      expect(`${property}: ${value}`).toMatch(/var\(--color-[a-z-]+\)/);
    }
  });
});
