# Tasks

## 1. Vocabulary and rules

- [ ] 1.1 Create `src/lib/maintenance.ts` with the frozen tool vocabulary (identifier plus Italian label for each of the twelve identifiers in the spec), the condition levels with their Italian labels, and `CONDITION_STALE_AFTER_MONTHS = 12`; verify with a Vitest that every identifier has a label and that the arrays are frozen
- [ ] 1.2 Add a pure `assessmentState({ checkedOn, condition, lastInterventionOn }, today)` returning `'current' | 'needs-check' | 'superseded' | 'checked-only' | 'none'`, taking today as an argument so tests do not depend on when they run; verify the boundary at exactly twelve months and one day either side, a missing date, a date with no condition, an intervention after the assessment (superseded wins over needs-check), and an intervention before it
- [ ] 1.3 Add a pure comparator for the overview ordering (condition from `invaso` to `buono`, then older assessment first, then entries without maintenance information last) and a pure sum of estimated effort over a list of entries; verify with a shuffled fixture that the order is stable and that the no-information group stays last

## 2. Schema

- [ ] 2.1 Add the optional `maintenance` object to the shared base schema in `src/content.config.ts`: `tools` (array of the enum, no duplicates), `effort_person_hours` (number, greater than 0, at most 200), `min_people` (integer, 1 to 20), `notes` (string, at most 500), `condition` (enum), `condition_checked_on` (date or `YYYY-MM-DD`, normalised like `verified_on`), `.strict()`; verify with Vitest that a valid block parses and that an unknown field inside the block fails with the field named
- [ ] 2.2 Add the refinements: the object must carry at least one field, `condition` requires `condition_checked_on`, `condition_checked_on` must not be in the future, and `tools` must not repeat; verify each with its own Vitest case and check the message names the entry and the problem
- [ ] 2.3 Verify the unrecognised-tool error lists the accepted identifiers, since that error is how a contributor discovers the vocabulary; assert on the message text in a test

## 3. Intervention log

- [ ] 3.1 Add `interventions` to the maintenance schema: non-empty list of objects with required `date` (not in the future) and `summary` (at most 300 characters), optional `people` (1 to 50), `person_hours` (greater than 0, at most 500), `tools` (enum, no duplicates) and `by` (at most 100 characters), `.strict()`; verify with Vitest that a valid list parses, that an empty list fails, that a missing summary fails with the intervention's date in the message, and that a future date fails
- [ ] 3.2 Expose the most recent intervention date from a helper the detail page and the overview both use, so they cannot disagree; verify with a test that an unsorted list still yields the newest date

## 4. Presentation

- [ ] 4.1 Add a `MaintenancePanel.astro` component rendering the section: heading that marks it as addressed to whoever maintains the trail, condition first with its date and the stale note when applicable, then tools by their Italian labels, effort in ore-persona, minimum people, and notes; omit every absent field; verify on fixtures with a full block, a block with only `min_people`, and a block with `condition_checked_on` and no `condition`
- [ ] 4.2 Render the section in `src/components/EntryPage.astro` after the hiking content, and not at all when the entry has no `maintenance` object; verify in the built HTML of an entry without the block that no heading, no empty list and no section wrapper is emitted
- [ ] 4.3 Show the interventions inside the maintenance section, newest first, each with date and summary and the optional details when present, with the newest date visible without interaction; verify on a fixture with three interventions and on one with none that no empty heading is emitted
- [ ] 4.4 Style the section from tokens only, distinct enough from the hiking content to read as a different audience; verify no hex colour appears outside `src/styles/tokens.css` and that the section does not overflow at 360 px

## 5. Maintenance overview page

- [ ] 5.1 Create `src/pages/manutenzione.astro`: server-rendered rows for every non-closed entry using the comparator from 1.3, showing name and link, condition with its state, tools, effort, minimum people and last intervention date, with entries lacking maintenance information in a labelled group at the end; verify in the built HTML that a `closed` fixture is absent and that the group order matches the comparator
- [ ] 5.2 Add a React island filtering by tool, toggling `hidden` on the server-rendered rows looked up by id and reflecting the choice in the query string, following the pattern of `FilterPanel`; verify that opening the page with a tool in the query string renders pre-filtered and that the page lists every row with JavaScript disabled
- [ ] 5.3 Show the total estimated effort of the rows currently visible and recompute it when the filter changes; verify with a test on the pure sum and in the browser that filtering changes the displayed total
- [ ] 5.4 Add the page to the navigation in `src/layouts/BaseLayout.astro`; verify every built page carries the new link and that the header does not overflow at 360 px

## 6. Fixtures and documentation

- [ ] 6.1 Fill a `maintenance` block on three fixture entries: one full with a recent condition, one with a deliberately old `condition_checked_on` so the needs-check path is exercised, and one whose condition predates a recorded intervention so the superseded path is too; leave a fourth entry without the block so the no-information group on the overview is populated; verify `npm run build` passes and each detail page renders as the spec scenarios describe
- [ ] 6.2 Add the fields to `CONTRIBUTING.md`: the block with an example, the tool vocabulary as a table of identifier and meaning, the person-hours unit explained with an example, the rule that a condition needs its date, the note that a condition older than twelve months or predating an intervention is shown as no longer current, and how to append an intervention after a work session; verify the field list still reads as one list with no duplicated explanation

## 7. Verification

- [ ] 7.1 Run `npm test`, `npm run build` and `npx astro check` clean, then check in headless Chrome on a local preview: the maintenance section appears only on entries that declare it, the needs-check and superseded fixtures carry their notes, the overview lists the expected groups in the expected order, the tool filter and its query string work and change the total, and no page has a console error at 360 px and 1280 px
