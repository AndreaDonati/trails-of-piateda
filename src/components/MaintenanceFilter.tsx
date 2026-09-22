/**
 * Tool filter of the maintenance overview (tasks 5.2 and 5.3, design D8).
 *
 * How it cooperates with the server-rendered page: manutenzione.astro renders one <li> per
 * entry with the id `rowElementId(item.id)`, inside one of two group elements, plus the row
 * count, the effort total and a hidden "nessun risultato" block. This island renders only the
 * chips; when the selection changes it looks those elements up by id and toggles their
 * `hidden` attribute, rewrites the count and recomputes the total. Nothing is re-rendered in
 * React, so the whole list is readable before hydration and with JavaScript off.
 *
 * The selection is mirrored in the query string with `history.replaceState` so a filtered view
 * can be shared, and read back from it on load.
 */
import { useEffect, useRef, useState } from 'react';
import { TOOL_LABELS } from '../lib/maintenance';
import {
  applyToolFilter,
  COUNT_ID,
  EMPTY_STATE_ID,
  formatPersonHours,
  formatRowCount,
  GROUP_WITH_ID,
  GROUP_WITHOUT_ID,
  rowElementId,
  TOTAL_ID,
  toolFilterToSearch,
  toolOptions,
  parseToolFilter,
  visibleEffortPersonHours,
  type MaintenanceListItem,
  type ToolFilter,
} from './maintenanceFilters';
import './MaintenanceFilter.css';

export interface MaintenanceFilterProps {
  items: MaintenanceListItem[];
}

export default function MaintenanceFilter({ items }: MaintenanceFilterProps) {
  // Starts empty so the hydrated markup matches what the server rendered; the query string is
  // read in the first effect instead, which is also when the rows are first touched.
  const [tool, setTool] = useState<ToolFilter>('');
  const hydrated = useRef(false);

  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      // Applying the rows before this point would hide entries the shared URL asks for.
      setTool(parseToolFilter(window.location.search));
      return;
    }

    const visible = new Set(applyToolFilter(items, tool).map((item) => item.id));
    for (const item of items) {
      const row = document.getElementById(rowElementId(item.id));
      if (row) row.hidden = !visible.has(item.id);
    }

    // A group whose rows are all hidden must go too, heading included: filtering by any tool
    // empties the "senza informazioni" group by construction, and a heading standing over
    // nothing reads as a group with no entries rather than as one the filter excluded.
    for (const [id, groupItems] of [
      [GROUP_WITH_ID, items.filter((item) => item.hasMaintenance)],
      [GROUP_WITHOUT_ID, items.filter((item) => !item.hasMaintenance)],
    ] as const) {
      const group = document.getElementById(id);
      if (group) group.hidden = !groupItems.some((item) => visible.has(item.id));
    }

    const count = document.getElementById(COUNT_ID);
    if (count) count.textContent = formatRowCount(visible.size);
    // The total exists to size a work session for the tools you actually have, so it follows
    // the filter rather than describing the catalog (design D8).
    const total = document.getElementById(TOTAL_ID);
    if (total) total.textContent = formatPersonHours(visibleEffortPersonHours(items, tool));

    // "Nessun risultato" is only true when the filter is what excludes the entries; an empty
    // catalog is not a failed search, so the block stays hidden and the count reports the zero.
    const empty = document.getElementById(EMPTY_STATE_ID);
    if (empty) empty.hidden = visible.size > 0 || !tool;

    // pathname + search + hash rather than `search || pathname`, so filtering while reading an
    // anchored section does not drop the fragment from the URL.
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${toolFilterToSearch(tool)}${window.location.hash}`,
    );
  }, [items, tool]);

  const options = toolOptions(items);
  // No entry declares a tool: there is nothing to filter by, and an empty fieldset would only
  // take space above the list. The hooks above have already run, so the rows keep working.
  if (options.length === 0) return null;

  return (
    <form
      className="tool-filter"
      role="search"
      aria-label="Filtra per attrezzo"
      onSubmit={(e) => e.preventDefault()}
    >
      <fieldset className="tool-filter__group">
        <legend>Attrezzo</legend>
        <div className="tool-filter__chips">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              className="tool-filter__chip"
              aria-pressed={tool === option}
              onClick={() => setTool((current) => (current === option ? '' : option))}
            >
              {TOOL_LABELS[option]}
            </button>
          ))}
        </div>
      </fieldset>

      <button type="button" className="tool-filter__reset" onClick={() => setTool('')} disabled={!tool}>
        Mostra tutti
      </button>
    </form>
  );
}
