/**
 * Filter island of the list page (task 4.5, design D6).
 *
 * How it cooperates with the server-rendered list: index.astro renders one <li> per entry,
 * with the id `cardElementId(entry.id)`, plus a hidden "nessun risultato" block. This island
 * renders only the controls; when the filters change it looks those elements up by id and
 * toggles their `hidden` attribute. Nothing is re-rendered in React, so the full list is
 * readable before (and without) hydration and the cards keep whatever markup the server
 * produced — including the parts other waves add to them, such as the cover image.
 *
 * The filters are mirrored in the query string with `history.replaceState` so a filtered view
 * can be shared, and read back from it on load.
 */
import { useEffect, useRef, useState } from 'react';
import { DIFFICULTY_LABELS, KIND_LABELS } from '../lib/mapConfig';
import { formatResultCount } from './format';
import {
  applyFilters,
  cardElementId,
  CLEAR_BUTTON_ID,
  COUNT_ID,
  DIFFICULTIES,
  EMPTY_FILTERS,
  EMPTY_STATE_ID,
  filtersToSearch,
  isEmpty,
  KINDS,
  municipalityOptions,
  parseFilters,
  sameMunicipality,
  type EntryListItem,
  type FilterState,
} from './filters';
import './FilterPanel.css';

export interface FilterPanelProps {
  entries: EntryListItem[];
}

export default function FilterPanel({ entries }: FilterPanelProps) {
  // Starts empty so the hydrated markup matches what the server rendered; the query string
  // is read in the first effect instead, which is also when the cards are first touched.
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const hydrated = useRef(false);

  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      // Applying the cards before this point would hide entries that the shared URL asks for.
      setFilters(parseFilters(window.location.search));
      return;
    }

    const visible = new Set(applyFilters(entries, filters).map((e) => e.id));
    for (const entry of entries) {
      const card = document.getElementById(cardElementId(entry.id));
      if (card) card.hidden = !visible.has(entry.id);
    }
    // "Nessun risultato per i filtri selezionati" is only true when a filter is what excludes
    // the entries; an empty catalog is not a failed search, so the block stays hidden and the
    // count alone reports the zero.
    const empty = document.getElementById(EMPTY_STATE_ID);
    if (empty) empty.hidden = visible.size > 0 || isEmpty(filters);
    const count = document.getElementById(COUNT_ID);
    if (count) count.textContent = formatResultCount(visible.size);

    // pathname + search + hash rather than `search || pathname`: the latter dropped the
    // fragment, so filtering while reading an anchored section lost the anchor from the URL.
    const search = filtersToSearch(filters);
    window.history.replaceState(null, '', `${window.location.pathname}${search}${window.location.hash}`);
  }, [entries, filters]);

  // The "azzera i filtri" button lives inside the server-rendered empty state, which belongs
  // in the list column rather than in this panel.
  useEffect(() => {
    const button = document.getElementById(CLEAR_BUTTON_ID);
    if (!button) return;
    const clear = () => setFilters(EMPTY_FILTERS);
    button.addEventListener('click', clear);
    return () => button.removeEventListener('click', clear);
  }, []);

  const municipalities = municipalityOptions(entries);
  const active = !isEmpty(filters);
  const toggle = <K extends 'kind' | 'difficulty'>(key: K, value: FilterState[K]) =>
    setFilters((current) => ({ ...current, [key]: current[key] === value ? '' : value }));
  const toggleMunicipality = (value: string) =>
    setFilters((current) => ({
      ...current,
      municipality: sameMunicipality(current.municipality, value) ? '' : value,
    }));

  return (
    <form className="filters" role="search" aria-label="Filtra l'elenco" onSubmit={(e) => e.preventDefault()}>
      <div className="filters__search">
        <label htmlFor="filtro-testo">Cerca</label>
        <input
          id="filtro-testo"
          type="search"
          value={filters.q}
          placeholder="Nome, descrizione o tag"
          onChange={(e) => setFilters((current) => ({ ...current, q: e.target.value }))}
        />
      </div>

      <ChipGroup legend="Tipo">
        {KINDS.map((kind) => (
          <Chip
            key={kind}
            label={KIND_LABELS[kind]}
            pressed={filters.kind === kind}
            onClick={() => toggle('kind', kind)}
          />
        ))}
      </ChipGroup>

      <ChipGroup legend="Difficoltà">
        {DIFFICULTIES.map((difficulty) => (
          <Chip
            key={difficulty}
            label={difficulty}
            title={DIFFICULTY_LABELS[difficulty]}
            pressed={filters.difficulty === difficulty}
            onClick={() => toggle('difficulty', difficulty)}
          />
        ))}
      </ChipGroup>

      {municipalities.length > 0 && (
        <ChipGroup legend="Comune">
          {municipalities.map((municipality) => (
            <Chip
              key={municipality}
              label={municipality}
              // Compared the way the predicate compares it, so `?municipality=piateda`
              // shows the Piateda chip pressed instead of no chip at all.
              pressed={sameMunicipality(filters.municipality, municipality)}
              onClick={() => toggleMunicipality(municipality)}
            />
          ))}
        </ChipGroup>
      )}

      <button type="button" className="filters__reset" onClick={() => setFilters(EMPTY_FILTERS)} disabled={!active}>
        Azzera i filtri
      </button>
    </form>
  );
}

function ChipGroup({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="filters__group">
      <legend>{legend}</legend>
      <div className="filters__chips">{children}</div>
    </fieldset>
  );
}

function Chip({
  label,
  title,
  pressed,
  onClick,
}: {
  label: string;
  title?: string;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="filters__chip" aria-pressed={pressed} title={title} onClick={onClick}>
      {label}
    </button>
  );
}
