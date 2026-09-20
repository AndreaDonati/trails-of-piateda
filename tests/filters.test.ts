import { describe, expect, it } from 'vitest';
import {
  applyFilters,
  EMPTY_FILTERS,
  filtersToSearch,
  isEmpty,
  matches,
  municipalityOptions,
  parseFilters,
  type EntryListItem,
  type FilterState,
} from '../src/components/filters';

function entry(overrides: Partial<EntryListItem> = {}): EntryListItem {
  return {
    id: 'piateda-ambria',
    kind: 'trail',
    name: 'Piateda - Ambria',
    summary: 'Salita da Piateda alla frazione di Ambria lungo la Val Venina.',
    difficulty: 'E',
    municipalities: ['Piateda'],
    tags: ['valle', 'frazione'],
    length_m: 8200,
    ascent_m: 940,
    duration_minutes: 150,
    url: '/sentieri/piateda-ambria/',
    ...overrides,
  };
}

const filters = (overrides: Partial<FilterState> = {}): FilterState => ({ ...EMPTY_FILTERS, ...overrides });

describe('matches', () => {
  it('accepts every entry when no filter is set', () => {
    expect(matches(entry(), EMPTY_FILTERS)).toBe(true);
    expect(isEmpty(EMPTY_FILTERS)).toBe(true);
  });

  it('filters by kind', () => {
    expect(matches(entry({ kind: 'trail' }), filters({ kind: 'trail' }))).toBe(true);
    expect(matches(entry({ kind: 'trail' }), filters({ kind: 'route' }))).toBe(false);
  });

  it('filters by difficulty', () => {
    expect(matches(entry({ difficulty: 'E' }), filters({ difficulty: 'E' }))).toBe(true);
    expect(matches(entry({ difficulty: 'EE' }), filters({ difficulty: 'E' }))).toBe(false);
  });

  it('matches a municipality of the entry, ignoring case and accents', () => {
    const e = entry({ municipalities: ['Piateda', 'Montagna in Valtellina'] });
    expect(matches(e, filters({ municipality: 'montagna in valtellina' }))).toBe(true);
    expect(matches(e, filters({ municipality: 'Albosaggia' }))).toBe(false);
  });

  it('searches name, summary and tags, and requires every word', () => {
    expect(matches(entry(), filters({ q: 'ambria' }))).toBe(true);
    expect(matches(entry(), filters({ q: 'VENINA' }))).toBe(true);
    expect(matches(entry(), filters({ q: 'frazione' }))).toBe(true);
    expect(matches(entry(), filters({ q: 'ambria venina' }))).toBe(true);
    expect(matches(entry(), filters({ q: 'ambria cascata' }))).toBe(false);
  });

  it('combines the filters with AND', () => {
    const list = [
      entry({ id: 'a', kind: 'route', difficulty: 'E', municipalities: ['Piateda'] }),
      entry({ id: 'b', kind: 'route', difficulty: 'EE', municipalities: ['Piateda'] }),
      entry({ id: 'c', kind: 'trail', difficulty: 'E', municipalities: ['Piateda'] }),
      entry({ id: 'd', kind: 'route', difficulty: 'E', municipalities: ['Caiolo'] }),
    ];
    const kept = applyFilters(list, filters({ kind: 'route', difficulty: 'E', municipality: 'Piateda' }));
    expect(kept.map((e) => e.id)).toEqual(['a']);
  });
});

describe('query string', () => {
  it('reads the filters of a shared URL', () => {
    expect(parseFilters('?kind=route&municipality=Piateda')).toEqual({
      kind: 'route',
      difficulty: '',
      municipality: 'Piateda',
      q: '',
    });
  });

  it('ignores values outside the known sets instead of emptying the list', () => {
    expect(parseFilters('?kind=bicicletta&difficulty=X')).toEqual(EMPTY_FILTERS);
  });

  it('writes no query string when no filter is active', () => {
    expect(filtersToSearch(EMPTY_FILTERS)).toBe('');
  });

  it('round-trips every filter', () => {
    const state = filters({ kind: 'route', difficulty: 'EE', municipality: 'Ponte in Valtellina', q: 'val venina' });
    const search = filtersToSearch(state);
    expect(search.startsWith('?')).toBe(true);
    expect(parseFilters(search)).toEqual(state);
  });

  it('drops surrounding whitespace of the free text', () => {
    expect(filtersToSearch(filters({ q: '  ambria  ' }))).toBe('?q=ambria');
    expect(parseFilters('?q=%20ambria%20').q).toBe('ambria');
  });
});

describe('municipalityOptions', () => {
  it('lists each municipality once, sorted', () => {
    const list = [
      entry({ id: 'a', municipalities: ['Piateda', 'Caiolo'] }),
      entry({ id: 'b', municipalities: ['piateda', 'Albosaggia'] }),
    ];
    expect(municipalityOptions(list)).toEqual(['Albosaggia', 'Caiolo', 'Piateda']);
  });
});
