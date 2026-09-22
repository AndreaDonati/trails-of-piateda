# Tasks

## 1. Vocabulary and rules

- [ ] 1.1 Create `src/lib/maintenance.ts` with the frozen tool vocabulary (identifier plus Italian label for each of the twelve identifiers in the spec), the condition levels with their Italian labels, and `CONDITION_STALE_AFTER_MONTHS = 12`; verify with a Vitest that every identifier has a label and that the arrays are frozen
- [ ] 1.2 Add a pure `assessmentState(checkedOn, condition, today)` returning `'recent' | 'stale' | 'checked-only' | 'none'`, taking today as an argument so tests do not depend on when they run; verify the boundary at exactly twelve months, one day either side, a missing date, and a date with no condition

## 2. Schema

- [ ] 2.1 Add the optional `maintenance` object to the shared base schema in `src/content.config.ts`: `tools` (array of the enum, no duplicates), `effort_person_hours` (number, greater than 0, at most 200), `min_people` (integer, 1 to 20), `notes` (string, at most 500), `condition` (enum), `condition_checked_on` (date or `YYYY-MM-DD`, normalised like `verified_on`), `.strict()`; verify with Vitest that a valid block parses and that an unknown field inside the block fails with the field named
- [ ] 2.2 Add the refinements: the object must carry at least one field, `condition` requires `condition_checked_on`, `condition_checked_on` must not be in the future, and `tools` must not repeat; verify each with its own Vitest case and check the message names the entry and the problem
- [ ] 2.3 Verify the unrecognised-tool error lists the accepted identifiers, since that error is how a contributor discovers the vocabulary; assert on the message text in a test

## 3. Presentation

- [ ] 3.1 Add a `MaintenancePanel.astro` component rendering the section: heading that marks it as addressed to whoever maintains the trail, condition first with its date and the stale note when applicable, then tools by their Italian labels, effort in ore-persona, minimum people, and notes; omit every absent field; verify on fixtures with a full block, a block with only `min_people`, and a block with `condition_checked_on` and no `condition`
- [ ] 3.2 Render the section in `src/components/EntryPage.astro` after the hiking content, and not at all when the entry has no `maintenance` object; verify in the built HTML of an entry without the block that no heading, no empty list and no section wrapper is emitted
- [ ] 3.3 Style the section from tokens only, distinct enough from the hiking content to read as a different audience; verify no hex colour appears outside `src/styles/tokens.css` and that the section does not overflow at 360 px

## 4. Fixtures and documentation

- [ ] 4.1 Fill a `maintenance` block on two fixture entries, one full with a recent condition and one with a deliberately old `condition_checked_on` so the stale path is exercised by the build; verify `npm run build` passes and both detail pages render as the spec scenarios describe
- [ ] 4.2 Add the fields to `CONTRIBUTING.md`: the block with an example, the tool vocabulary as a table of identifier and meaning, the person-hours unit explained with an example, the rule that a condition needs its date, and the note that a condition older than twelve months is shown as needing a check; verify the field list still reads as one list with no duplicated explanation

## 5. Verification

- [ ] 5.1 Run `npm test`, `npm run build` and `npx astro check` clean, then check in headless Chrome on a local preview that the section appears only on entries that declare it, that the stale fixture carries the visible note, and that no page has a console error at 360 px and 1280 px
