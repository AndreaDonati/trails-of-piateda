# Design

## Context

See proposal.md for motivation; the two spec deltas under `specs/` carry the requirements.

What the code does today, read before drafting:

- `src/content.config.ts` defines `start` as `{ name, lat?, lon? }`, with a refinement that latitude and longitude are given together. No entry in `content/` fills them, and no page reads them.
- `src/components/EntryPage.astro` renders `data.start.name` alone in the metadata list.
- `src/components/map/TrackMap.tsx` places the start and end markers from `trackEndpoints()`, which reads the first and last point of the track geometry. The declared coordinates play no part.
- The same file already computes `track.points[0]` for the problem-report fallback position, so a first-track-point coordinate is available on the page.
- The page and the island already talk through `CustomEvent` on `document`: `map:ready` from the island, `photo:select` both ways, `report:pick`/`report:point` both ways. Each listener ignores the events it sends itself.

## Goals / Non-Goals

**Goals:**
- One start point, named in the text, printed as coordinates and marked on the map, with no way for the three to disagree.
- Works on every entry, including the ones that declare no coordinates.
- No new dependency and no change contributors must make.

**Non-Goals:**
- Linking to an external navigation application. That answers how to drive to the trailhead, a different question, and would bring a provider choice with it.
- Copy-to-clipboard, sharing a pin, or a coordinate format switch (degrees/minutes/seconds).
- Anything on the list page or the overview map.

## Decisions

### D1. One resolved start point, computed on the page

A small helper resolves the start point once: the metadata coordinates when present, otherwise the track's first point. The result carries the coordinates and which source they came from. The page uses it for the printed text, and passes it to the island as the marker position. Nothing else may compute a start position.

Why on the page rather than in the island: the island receives GeoJSON, which does not carry the metadata, and the page already has both. Computing it twice is how the text and the marker would drift apart, which is the defect this change exists to prevent.

Alternative discarded: put `start.lat`/`start.lon` into the per-entry GeoJSON as a Point feature and let the island prefer it. It works, but it changes a published data file for a presentation concern and gives a second place where the rule lives.

### D2. Focus through the existing event bus

The coordinates are a `<button>`. Pressing it dispatches `start:focus` on `document`; the island listens, calls `easeTo` on the marker's position at a zoom no lower than the current one, and adds a highlight class to the marker element for a short, self-clearing period, also cleared on the map's next `movestart` or `click` from the user.

Why a button and not a link: there is no URL for a map position on this site, so a link would be a lie to the browser and to assistive technology. `aria-describedby` on the button states what it does.

Why reuse the `document` event pattern: three features already use it and the island is `client:only`, so the page cannot hold a reference to the component. Adding a different mechanism for the fourth case would be the inconsistency.

Alternative discarded: passing a callback prop. An Astro page cannot pass a function to a `client:only` island; props are serialised.

### D3. Behaviour when the map cannot run

`TrackMap` renders a message instead of a map when WebGL is missing, so no listener exists. The button then dispatches into nothing. Rather than leave a control that silently does nothing, the page hides the button and leaves the coordinates as plain text once it learns the map is unavailable. The island already announces itself with `map:ready`; the page enables the button on that event, the same way the fullscreen and report-pick buttons are revealed today, so the default state is the honest one.

### D4. Formatting

Four decimals, the precision `src/lib/reportForm.ts` already uses, formatted with the Italian decimal comma through the existing helpers in `src/components/format.ts`. The two coordinates are separated so a screen reader does not read them as one number, and the button's accessible name says what pressing it does rather than reading the digits.

## Risks / Trade-offs

- [A contributor fills `start.lat`/`start.lon` carelessly and the marker lands away from the track] → The coordinates are printed next to the name on the page, so a wrong value is visible rather than buried; CONTRIBUTING gains a line saying the field moves the marker. Not validated against the track on purpose: a trailhead legitimately sits at a car park a few hundred metres from the recorded start.
- [The highlight stays on and confuses the next interaction] → It clears on a timer and on the map's next user-driven `movestart` or `click`.
- [`easeTo` fights a terrain animation on a slow device] → The focus uses the current zoom as a floor and a short duration, and does not change pitch or bearing.

## Open Questions

- Whether a link to an external navigation application is wanted as well. It is additive and does not change anything in this design, so it can be a separate change.
