# Tasks

## 1. Resolve the start point

- [ ] 1.1 Add a pure helper (for example `resolveStartPoint` in `src/components/startPoint.ts`) taking the entry's `start` metadata and the track points and returning `{ lat, lon, source: 'metadata' | 'track' }`, or null when the track is empty and the metadata has no coordinates; verify with Vitest that metadata wins over the track, that the track's first point is used when metadata has none, and that the null case is reachable
- [ ] 1.2 Add a formatter for the displayed pair, four decimals with the Italian decimal comma, reusing `src/components/format.ts`; verify with a test that 46.16115 renders as `46,1612` and that latitude and longitude are separate strings

## 2. The control on the detail page

- [ ] 2.1 In `src/components/EntryPage.astro`, render the coordinates next to the start name as a `<button>` that is hidden until `map:ready` fires for the detail map, with an accessible name stating that it shows the start on the map; verify in the built HTML that the button is present and starts hidden, and that entries with no resolvable start point render the name alone with no button
- [ ] 2.2 Dispatch `start:focus` on `document` when the button is pressed, carrying the resolved coordinates; verify in a browser that the event fires once per press and that the page does not navigate or change the URL

## 3. The marker and the focus behaviour

- [ ] 3.1 Add an optional `startPoint` prop to `src/components/map/TrackMap.tsx` and place the start marker on it when given, falling back to `trackEndpoints()` otherwise; verify with a fixture whose declared start is 200 m from the first track point that the marker sits on the declared position, and that an entry without the prop is unchanged
- [ ] 3.2 Listen for `start:focus` in the island and `easeTo` the marker position, keeping the current zoom as a floor and leaving pitch and bearing alone; verify in headless Chrome that the map centre moves to the start and that the zoom does not decrease
- [ ] 3.3 Highlight the start marker on focus and clear the highlight on a timer and on the map's next user-driven `movestart` or `click`; verify in headless Chrome that the highlight class appears, then disappears after a pan, and that the listener is removed when the island unmounts

## 4. Documentation and seed data

- [ ] 4.1 Add a line to `CONTRIBUTING.md` under the metadata fields saying that `start.lat`/`start.lon` move the start marker and are shown on the page, and that they may legitimately differ from the GPX first point (a car park, for instance); verify the file still reads as one list of fields with no duplicated explanation
- [ ] 4.2 Fill `start.lat`/`start.lon` on one fixture entry so the metadata path is exercised by the build, and leave another without them so the fallback path is too; verify `npm run build` passes and both detail pages show the control

## 5. Verification

- [ ] 5.1 Run `npm test`, `npm run build` and `npx astro check` clean, then check in headless Chrome on a local preview: the button appears only after the map loads, pressing it centres and highlights the start marker, the highlight clears on the next pan, and the page has no console error at 360 px and at 1280 px
