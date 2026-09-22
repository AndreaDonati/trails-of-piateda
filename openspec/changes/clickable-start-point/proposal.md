# Proposal

## Why

The detail page names where a route starts ("Piateda Alta, parcheggio della chiesa") but never gives its position in a form the reader can act on. The map already draws a start marker, yet nothing connects the two: on a long track the marker can be off screen or hard to tell from the end marker, so a visitor still cannot say where to leave the car. The metadata already allows explicit start coordinates, and no page uses them today.

## What Changes

- Show the start point's coordinates on the detail page next to its name, as a control the visitor can activate.
- Activating it moves the detail map to the start marker and highlights the marker, so the text and the map agree on one point.
- Make the start marker sit on the coordinates declared in the entry metadata when it has them, instead of always on the track's first recorded point. Today the two can differ and only the track is shown. **BREAKING** for nothing published: no entry currently declares `start.lat`/`start.lon`, so no existing page changes.
- When the metadata declares no coordinates, derive them from the track's first point, so every entry gets the control and the displayed numbers always match the marker.

Assumptions recorded here, not confirmed by the owner:
- Coordinates are shown as decimal degrees with four decimals, the precision already used for problem reports (about 10 m, enough for a trailhead and honest about GPS accuracy).
- The control stays on the page; it does not open an external map application. A link to a navigation app answers a different question, how to drive there, and is left out of this change.
- Nothing changes on the list page or the overview map.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `trail-browsing`: the detail page requirement gains the start coordinates and the control that focuses them on the map.
- `interactive-map`: the detail-map requirement gains the position rule for the start marker and the behaviour when the page asks to focus it.

## Impact

- `src/components/EntryPage.astro` renders the control; `src/components/map/TrackMap.tsx` gains a prop for the declared start point and a listener for the focus request. They already communicate through `CustomEvent` on `document` for photos and for report picking, so this follows the existing pattern rather than adding one.
- No change to the content schema, so no contributor has to edit anything. Entries that already fill `start.lat`/`start.lon` start benefiting without a rewrite.
- No new dependency, no change to the build, no effect on the published data files.
