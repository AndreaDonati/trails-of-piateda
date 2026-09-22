import { describe, expect, it } from 'vitest';
import { maintenanceSchema, trailSchema } from '../src/content.config';
import { getMaintenance, type CatalogEntry } from '../src/lib/catalog';
import {
  assessmentState,
  compareByAttention,
  CONDITION_LABELS,
  CONDITION_STALE_AFTER_MONTHS,
  CONDITIONS,
  CONDITIONS_BY_ATTENTION,
  sumEffortPersonHours,
  TOOL_LABELS,
  TOOLS,
  type MaintenanceRow,
} from '../src/lib/maintenance';

/**
 * Every date-dependent test states the day it means. The build date is only a default; a test
 * that used it would pass or fail depending on when it runs.
 */
const TODAY = '2026-06-15';

describe('tool vocabulary', () => {
  it('has the twelve identifiers the spec lists', () => {
    expect([...TOOLS]).toEqual([
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
    ]);
  });

  it('gives every identifier a non-empty label and has no label without an identifier', () => {
    for (const tool of TOOLS) expect(TOOL_LABELS[tool]).toMatch(/\S/);
    expect(Object.keys(TOOL_LABELS).sort()).toEqual([...TOOLS].sort());
  });

  it('gives every condition a label and orders the levels from the worst to the best', () => {
    for (const condition of CONDITIONS) expect(CONDITION_LABELS[condition]).toMatch(/\S/);
    expect(Object.keys(CONDITION_LABELS).sort()).toEqual([...CONDITIONS].sort());
    expect([...CONDITIONS_BY_ATTENTION]).toEqual(['invaso', 'da_sfoltire', 'buono']);
  });

  it('keeps the vocabulary frozen, so nothing can extend it at run time', () => {
    for (const frozen of [TOOLS, TOOL_LABELS, CONDITIONS, CONDITION_LABELS, CONDITIONS_BY_ATTENTION]) {
      expect(Object.isFrozen(frozen)).toBe(true);
    }
    expect(() => (TOOLS as unknown as string[]).push('motosegha')).toThrow(TypeError);
    expect(() => ((TOOL_LABELS as Record<string, string>)['motosegha'] = 'x')).toThrow(TypeError);
  });

  it('states the staleness threshold once', () => {
    expect(CONDITION_STALE_AFTER_MONTHS).toBe(12);
  });
});

describe('assessmentState', () => {
  it('is current at exactly twelve months and one day short of it', () => {
    expect(assessmentState({ condition: 'buono', checkedOn: '2025-06-15' }, TODAY)).toBe('current');
    expect(assessmentState({ condition: 'buono', checkedOn: '2025-06-16' }, TODAY)).toBe('current');
  });

  it('needs a check one day past twelve months', () => {
    expect(assessmentState({ condition: 'buono', checkedOn: '2025-06-14' }, TODAY)).toBe('needs-check');
    expect(assessmentState({ condition: 'invaso', checkedOn: '2024-12-01' }, TODAY)).toBe('needs-check');
  });

  it('is none without a date, whatever else is recorded', () => {
    expect(assessmentState({}, TODAY)).toBe('none');
    expect(assessmentState({ lastInterventionOn: '2026-05-01' }, TODAY)).toBe('none');
  });

  it('is checked-only when a date was recorded without a level', () => {
    expect(assessmentState({ checkedOn: '2026-05-01' }, TODAY)).toBe('checked-only');
    // Age does not matter: there is no level to call stale.
    expect(assessmentState({ checkedOn: '2019-05-01' }, TODAY)).toBe('checked-only');
  });

  it('is superseded by an intervention carried out after the assessment', () => {
    expect(
      assessmentState({ condition: 'invaso', checkedOn: '2026-05-04', lastInterventionOn: '2026-07-02' }, '2026-08-01'),
    ).toBe('superseded');
  });

  it('reports supersession rather than the age when both apply', () => {
    expect(
      assessmentState({ condition: 'invaso', checkedOn: '2023-05-04', lastInterventionOn: '2024-07-02' }, TODAY),
    ).toBe('superseded');
  });

  it('ignores an intervention carried out before the assessment, or on the same day', () => {
    expect(
      assessmentState({ condition: 'da_sfoltire', checkedOn: '2026-05-04', lastInterventionOn: '2026-03-02' }, TODAY),
    ).toBe('current');
    // Same day: the two cannot be ordered, so the assessment is taken as the later fact.
    expect(
      assessmentState({ condition: 'da_sfoltire', checkedOn: '2026-05-04', lastInterventionOn: '2026-05-04' }, TODAY),
    ).toBe('current');
  });
});

describe('overview ordering', () => {
  const row = (r: Partial<MaintenanceRow> & { id: string }): MaintenanceRow => ({ hasMaintenance: true, ...r });

  const expected = [
    'invaso-vecchio',
    'invaso-recente',
    'da-sfoltire',
    'buono',
    'senza-condizione',
    'senza-manutenzione-a',
    'senza-manutenzione-b',
  ];

  const rows: MaintenanceRow[] = [
    row({ id: 'invaso-vecchio', condition: 'invaso', checkedOn: '2024-04-01', effortPersonHours: 12 }),
    row({ id: 'invaso-recente', condition: 'invaso', checkedOn: '2026-04-01', effortPersonHours: 8 }),
    row({ id: 'da-sfoltire', condition: 'da_sfoltire', checkedOn: '2023-01-01', effortPersonHours: 4 }),
    row({ id: 'buono', condition: 'buono', checkedOn: '2022-01-01', effortPersonHours: 1.5 }),
    row({ id: 'senza-condizione', effortPersonHours: 2 }),
    row({ id: 'senza-manutenzione-a', hasMaintenance: false }),
    row({ id: 'senza-manutenzione-b', hasMaintenance: false }),
  ];

  const shuffles = [
    [4, 0, 6, 2, 5, 1, 3],
    [6, 5, 4, 3, 2, 1, 0],
    [1, 3, 5, 0, 2, 4, 6],
  ];

  it('orders by condition, then by the older assessment, whatever the input order', () => {
    for (const order of shuffles) {
      const shuffled = order.map((i) => rows[i] as MaintenanceRow);
      expect(shuffled.slice().sort(compareByAttention).map((r) => r.id)).toEqual(expected);
    }
  });

  it('keeps the entries without maintenance information last, as their own group', () => {
    const sorted = rows.slice().reverse().sort(compareByAttention);
    expect(sorted.slice(-2).map((r) => r.id)).toEqual(['senza-manutenzione-a', 'senza-manutenzione-b']);
    expect(sorted.filter((r) => !r.hasMaintenance)).toHaveLength(2);
  });

  it('sums the estimated effort, counting a row without an estimate as zero', () => {
    expect(sumEffortPersonHours(rows)).toBe(27.5);
    expect(sumEffortPersonHours([])).toBe(0);
    expect(sumEffortPersonHours([{ effortPersonHours: 0.5 }, { effortPersonHours: 0.2 }])).toBe(0.7);
  });
});

function issues(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return result.success ? [] : result.error!.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

/** Parses a maintenance block on its own, against a fixed build date. */
function parse(block: unknown) {
  return maintenanceSchema(TODAY).safeParse(block);
}

const messages = (block: unknown) => issues(parse(block)).join('\n');

describe('maintenance schema', () => {
  it('accepts a block inside an entry and leaves an entry without one valid', () => {
    const entry = {
      name: 'Piateda - Ambria',
      summary: 'Salita ad Ambria.',
      difficulty: 'E',
      municipalities: ['Piateda'],
      start: { name: 'Piateda' },
    };
    const withBlock = trailSchema.safeParse({
      ...entry,
      maintenance: { tools: ['decespugliatore', 'roncola'], effort_person_hours: 8, min_people: 2 },
    });
    expect(withBlock.success, issues(withBlock).join('\n')).toBe(true);
    expect(withBlock.data?.maintenance).toEqual({
      tools: ['decespugliatore', 'roncola'],
      effort_person_hours: 8,
      min_people: 2,
    });

    const withoutBlock = trailSchema.safeParse(entry);
    expect(withoutBlock.success).toBe(true);
    expect(withoutBlock.data?.maintenance).toBeUndefined();
  });

  it('rejects an unknown field inside the block and names it', () => {
    // .strict() removes the key before the block-level check, so a block whose only field is
    // misspelled is reported twice: the key is unknown, and nothing recognised is left.
    expect(messages({ attrezzi: ['motosega'] })).toBe(
      ': Unrecognized key: "attrezzi"\n: maintenance carries no recognised field; give it at least one or leave the block out',
    );
    expect(messages({ min_people: 2, attrezzi: ['motosega'] })).toBe(': Unrecognized key: "attrezzi"');
  });

  it('rejects an empty block', () => {
    expect(messages({})).toBe(': maintenance carries no recognised field; give it at least one or leave the block out');
  });

  it('rejects an effort outside the range, naming the field and the range', () => {
    expect(messages({ effort_person_hours: 0 })).toBe(
      'effort_person_hours: effort_person_hours must be greater than 0 and at most 200',
    );
    expect(messages({ effort_person_hours: 201 })).toContain('at most 200');
    expect(parse({ effort_person_hours: 0.5 }).success).toBe(true);
  });

  it('rejects a minimum number of people outside 1 to 20, or not a whole number', () => {
    expect(messages({ min_people: 0 })).toContain('min_people must be between 1 and 20');
    expect(messages({ min_people: 21 })).toContain('min_people must be between 1 and 20');
    expect(messages({ min_people: 1.5 })).toContain('whole number');
    expect(parse({ min_people: 1 }).success).toBe(true);
  });

  it('rejects notes longer than 500 characters', () => {
    expect(messages({ notes: 'x'.repeat(501) })).toContain('at most 500 characters');
    expect(parse({ notes: 'serve una scala' }).success).toBe(true);
  });

  it('rejects an unrecognised tool and lists the accepted identifiers', () => {
    const message = messages({ tools: ['motosegha'] });
    expect(message).toMatch(/^tools\.0: unknown tool "motosegha"; accepted tools: /);
    for (const tool of TOOLS) expect(message).toContain(tool);
  });

  it('rejects the same tool listed twice, naming it', () => {
    expect(messages({ tools: ['motosega', 'roncola', 'motosega'] })).toBe('tools.2: tool "motosega" is listed twice');
  });

  it('requires the date of an assessment whenever a level is given', () => {
    expect(messages({ condition: 'invaso' })).toContain('condition "invaso" needs condition_checked_on');
    expect(parse({ condition: 'invaso', condition_checked_on: '2026-05-04' }).success).toBe(true);
    // The other way round is allowed: checked, nothing worth recording.
    expect(parse({ condition_checked_on: '2026-05-04' }).success).toBe(true);
  });

  it('rejects a condition assessed after the build date, naming the date', () => {
    expect(messages({ condition: 'buono', condition_checked_on: '2026-06-16' })).toBe(
      `condition_checked_on: condition_checked_on 2026-06-16 is in the future (the build date is ${TODAY})`,
    );
    expect(parse({ condition: 'buono', condition_checked_on: TODAY }).success).toBe(true);
  });

  it('normalises the assessment date like verified_on, from a Date or a string', () => {
    const fromDate = parse({ condition_checked_on: new Date('2025-06-01T00:00:00Z') });
    expect(fromDate.success && fromDate.data.condition_checked_on).toBe('2025-06-01');
    const fromString = parse({ condition_checked_on: '2025-06-01' });
    expect(fromString.success && fromString.data.condition_checked_on).toBe('2025-06-01');
    expect(parse({ condition_checked_on: 'primavera' }).success).toBe(false);
    expect(parse({ condition_checked_on: '2025-13-45' }).success).toBe(false);
  });

  it('rejects a condition outside the three levels, listing them', () => {
    const message = messages({ condition: 'pessimo', condition_checked_on: '2026-05-04' });
    for (const condition of CONDITIONS) expect(message).toContain(condition);
  });
});

describe('intervention log schema', () => {
  const valid = { date: '2026-05-04', summary: 'Sfoltito il tratto nel bosco', people: 4, person_hours: 6 };

  it('accepts a list of interventions with their optional details', () => {
    const r = parse({
      interventions: [
        valid,
        { date: '2025-09-01', summary: 'Ripristino segnaletica', tools: ['vernice-segnaletica'], by: 'Gruppo sentieri' },
      ],
    });
    expect(r.success, issues(r).join('\n')).toBe(true);
    expect(r.data?.interventions?.[0]).toEqual(valid);
  });

  it('rejects an empty list', () => {
    expect(messages({ interventions: [] })).toBe(
      'interventions: interventions must not be an empty list; leave the field out instead',
    );
  });

  it('names the date of the intervention whose summary is missing', () => {
    expect(messages({ interventions: [valid, { date: '2024-07-02', people: 2 }] })).toBe(
      'interventions.1.summary: the intervention of 2024-07-02 has no summary, which is required',
    );
  });

  it('rejects an intervention carried out after the build date, naming the date', () => {
    expect(messages({ interventions: [{ date: '2026-06-16', summary: 'x' }] })).toBe(
      `interventions.0.date: an intervention date 2026-06-16 is in the future (the build date is ${TODAY})`,
    );
  });

  it('rejects an unknown field inside an intervention, a long summary and repeated tools', () => {
    expect(messages({ interventions: [{ ...valid, chi: 'Mario' }] })).toContain('chi');
    expect(messages({ interventions: [{ date: '2026-05-04', summary: 'x'.repeat(301) }] })).toContain(
      'at most 300 characters',
    );
    expect(messages({ interventions: [{ ...valid, tools: ['roncola', 'roncola'] }] })).toContain(
      'tool "roncola" is listed twice',
    );
  });
});

describe('getMaintenance', () => {
  /** A CatalogEntry carries the whole validated metadata; only `maintenance` is read here. */
  const entry = (maintenance: unknown): CatalogEntry =>
    ({
      kind: 'trail',
      slug: 'piateda-ambria',
      url: '/sentieri/piateda-ambria/',
      dir: '',
      data: { maintenance },
    }) as CatalogEntry;

  it('reports no maintenance information for an entry without the block', () => {
    const m = getMaintenance(entry(undefined), TODAY);
    expect(m).toMatchObject({ data: null, interventions: [], lastInterventionOn: null, state: 'none' });
    expect(m.row).toEqual({
      id: 'piateda-ambria',
      hasMaintenance: false,
      condition: undefined,
      checkedOn: undefined,
      effortPersonHours: undefined,
    });
  });

  it('finds the most recent intervention in a list written out of order', () => {
    const m = getMaintenance(
      entry({
        interventions: [
          { date: '2024-07-02', summary: 'Taglio piante cadute' },
          { date: '2026-05-04', summary: 'Sfoltitura' },
          { date: '2025-09-01', summary: 'Segnaletica' },
        ],
      }),
      TODAY,
    );
    expect(m.lastInterventionOn).toBe('2026-05-04');
    expect(m.interventions.map((i) => i.date)).toEqual(['2026-05-04', '2025-09-01', '2024-07-02']);
  });

  it('derives the state of the assessment from the block and the interventions', () => {
    expect(getMaintenance(entry({ condition: 'buono', condition_checked_on: '2026-05-04' }), TODAY).state).toBe(
      'current',
    );
    expect(getMaintenance(entry({ condition: 'buono', condition_checked_on: '2024-05-04' }), TODAY).state).toBe(
      'needs-check',
    );
    expect(
      getMaintenance(
        entry({
          condition: 'invaso',
          condition_checked_on: '2026-05-04',
          interventions: [{ date: '2026-06-02', summary: 'Sfoltitura' }],
        }),
        TODAY,
      ).state,
    ).toBe('superseded');
  });

  it('builds the overview row from the same block, so the two pages cannot disagree', () => {
    const m = getMaintenance(
      entry({ condition: 'invaso', condition_checked_on: '2026-05-04', effort_person_hours: 8 }),
      TODAY,
    );
    expect(m.row).toEqual({
      id: 'piateda-ambria',
      hasMaintenance: true,
      condition: 'invaso',
      checkedOn: '2026-05-04',
      effortPersonHours: 8,
    });
    expect(compareByAttention(m.row, { id: 'altro', hasMaintenance: false })).toBeLessThan(0);
  });
});

describe('empty tools list', () => {
  it('is rejected, since it carries no information and would pass the at-least-one-field check', () => {
    const result = maintenanceSchema('2026-06-15').safeParse({ tools: [] });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('must not be an empty list');
  });
});
