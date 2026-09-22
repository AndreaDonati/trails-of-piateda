import { describe, expect, it } from 'vitest';
import {
  applyToolFilter,
  ASSESSMENT_STATE_LABELS,
  formatPersonHours,
  formatRowCount,
  matchesTool,
  PARAM_TOOL,
  parseToolFilter,
  rowElementId,
  toolFilterToSearch,
  toolOptions,
  visibleEffortPersonHours,
  type MaintenanceListItem,
} from '../src/components/maintenanceFilters';
import { TOOLS } from '../src/lib/maintenance';

function item(overrides: Partial<MaintenanceListItem> = {}): MaintenanceListItem {
  return {
    id: 'piateda-ambria',
    hasMaintenance: true,
    tools: ['motosega', 'roncola'],
    effortPersonHours: 8,
    ...overrides,
  };
}

const catalog: MaintenanceListItem[] = [
  item({ id: 'a', tools: ['motosega', 'roncola'], effortPersonHours: 8 }),
  item({ id: 'b', tools: ['decespugliatore'], effortPersonHours: 4.5 }),
  item({ id: 'c', tools: ['motosega'], effortPersonHours: undefined }),
  item({ id: 'd', hasMaintenance: false, tools: [], effortPersonHours: undefined }),
];

describe('matchesTool', () => {
  it('accepts every item when no tool is selected', () => {
    expect(matchesTool(item(), '')).toBe(true);
    expect(matchesTool(item({ tools: [] }), '')).toBe(true);
  });

  it('keeps only the items listing the tool', () => {
    expect(matchesTool(item({ tools: ['motosega'] }), 'motosega')).toBe(true);
    expect(matchesTool(item({ tools: ['roncola'] }), 'motosega')).toBe(false);
  });

  it('excludes the entries with no maintenance information as soon as a tool is selected', () => {
    // They declare no tool, so they cannot match one. The page hides their whole group.
    expect(matchesTool(item({ hasMaintenance: false, tools: [] }), 'motosega')).toBe(false);
  });
});

describe('applyToolFilter', () => {
  it('returns every item, in order, when no tool is selected', () => {
    expect(applyToolFilter(catalog, '').map((i) => i.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('preserves the server-rendered order of the items it keeps', () => {
    expect(applyToolFilter(catalog, 'motosega').map((i) => i.id)).toEqual(['a', 'c']);
  });
});

describe('visibleEffortPersonHours', () => {
  it('sums the estimates of every item when no tool is selected', () => {
    expect(visibleEffortPersonHours(catalog, '')).toBe(12.5);
  });

  it('changes with the filter, which is the reason it exists', () => {
    expect(visibleEffortPersonHours(catalog, 'motosega')).toBe(8);
    expect(visibleEffortPersonHours(catalog, 'decespugliatore')).toBe(4.5);
  });

  it('counts an item declaring no estimate as zero rather than dropping the row', () => {
    expect(visibleEffortPersonHours([item({ effortPersonHours: undefined })], '')).toBe(0);
  });

  it('is zero when the filter leaves nothing', () => {
    expect(visibleEffortPersonHours(catalog, 'carriola')).toBe(0);
  });
});

describe('parseToolFilter', () => {
  it('reads the tool from the query string', () => {
    expect(parseToolFilter('?tool=motosega')).toBe('motosega');
    expect(parseToolFilter(`?${PARAM_TOOL}=sega-a-mano&altro=1`)).toBe('sega-a-mano');
  });

  it('accepts a search string without the leading question mark', () => {
    expect(parseToolFilter('tool=roncola')).toBe('roncola');
  });

  it('ignores a value outside the vocabulary instead of emptying the page', () => {
    expect(parseToolFilter('?tool=motosegha')).toBe('');
    expect(parseToolFilter('?tool=')).toBe('');
    expect(parseToolFilter('')).toBe('');
  });
});

describe('toolFilterToSearch', () => {
  it('produces no query string when no tool is selected', () => {
    expect(toolFilterToSearch('')).toBe('');
  });

  it('round-trips every identifier of the vocabulary', () => {
    for (const tool of TOOLS) {
      expect(parseToolFilter(toolFilterToSearch(tool))).toBe(tool);
    }
  });

  it('writes the key the page documents', () => {
    expect(toolFilterToSearch('motosega')).toBe('?tool=motosega');
  });
});

describe('toolOptions', () => {
  it('lists only the tools the entries actually require, in the vocabulary order', () => {
    expect(toolOptions(catalog)).toEqual(['decespugliatore', 'motosega', 'roncola']);
  });

  it('is empty when nothing declares a tool, so the island renders no control', () => {
    expect(toolOptions([item({ tools: [] })])).toEqual([]);
  });
});

describe('formatting shared by the server render and the island', () => {
  it('spells the person-hours unit, singular and plural', () => {
    expect(formatPersonHours(1)).toBe('1 ora-persona');
    expect(formatPersonHours(8)).toBe('8 ore-persona');
    expect(formatPersonHours(0)).toBe('0 ore-persona');
  });

  it('uses the Italian decimal comma', () => {
    expect(formatPersonHours(4.5)).toBe('4,5 ore-persona');
  });

  it('counts rows as "voci"', () => {
    expect(formatRowCount(1)).toBe('1 voce');
    expect(formatRowCount(0)).toBe('0 voci');
    expect(formatRowCount(7)).toBe('7 voci');
  });

  it('names every assessment state', () => {
    for (const state of ['current', 'needs-check', 'superseded', 'checked-only', 'none'] as const) {
      expect(ASSESSMENT_STATE_LABELS[state]).toMatch(/\S/);
    }
  });
});

describe('rowElementId', () => {
  it('derives the row id from the slug, as the page and the island both do', () => {
    expect(rowElementId('piateda-ambria')).toBe('manutenzione-piateda-ambria');
  });
});
