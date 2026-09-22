# Proposal

## Why

A group of volunteers maintains the trails around Piateda, and the owner and another collaborator want to organise that work from this site instead of from memory. Today nothing in the catalog says what clearing a given trail takes: someone has to have walked it recently to know whether it needs a brush cutter or a chainsaw, how long it takes, and whether one person can do it alone. That knowledge lives in a few heads and is lost when they are not available.

## What Changes

- Add an optional `maintenance` block to a trail or route's metadata: the tools its clearing needs, the estimated work in person-hours, and the minimum number of people the job requires.
- Show that block on the entry's detail page, in a section addressed to whoever is planning the work rather than to a hiker.
- Add an optional condition level inside the same block (`buono`, `da_sfoltire`, `invaso`) with the date it was assessed. The date is required whenever the level is given, and the page marks a level older than twelve months as needing a fresh check instead of presenting it as current.
- Define the tool names as a fixed vocabulary in the repository, so a contributor cannot invent a spelling and the build tells them the accepted values, with a free-text note for anything the vocabulary does not cover.
- Record the interventions actually carried out: a dated list inside the same block, each with what was done and optionally who did it, how long it took and with which tools. The most recent one is shown on the detail page.
- Use that record to keep the condition honest: an assessment older than the last intervention describes a trail that has since been worked on, so the page presents it as superseded rather than as current.
- Add a maintenance page listing every entry, ordered by how much attention it needs, with a filter by tool so the question "which trails need the chainsaw" has an answer. Reachable from the site navigation.
- Every field is optional: entries without a `maintenance` block render exactly as they do today.

Assumptions recorded here, not confirmed by the owner:
- The information is public. The site is static with no accounts, so there is no way to show it only to volunteers, and none of it is sensitive.
- Estimated work is expressed in person-hours, the total effort independent of team size, because "three hours" means nothing without saying for how many people. The minimum number of people is a separate field and is about what the job requires at once, for instance two people for chainsaw work.
- The condition level is deliberately separate from the existing `status` field, which already has a `maintenance` value meaning the entry is closed for works. A trail can be in poor condition and still open.

## Capabilities

### New Capabilities
- `trail-maintenance`: the maintenance information attached to a catalog entry, its vocabulary and validation rules, how it is presented, and how an assessment that has gone stale is treated.

### Modified Capabilities
- `trail-catalog`: the entry metadata schema gains `maintenance` as an optional field. Its contents are specified by `trail-maintenance`.

## Impact

- `src/content.config.ts` gains one optional object in the shared schema; `src/components/EntryPage.astro` gains a section. No change to the GPX pipeline, the map, the photos or the published data files.
- `CONTRIBUTING.md` gains the new fields and the tool vocabulary, since contributors are the people who will fill them.
- Keeping the condition level honest is the whole difficulty of this change: the owner already expects it to go stale. The design addresses that by requiring a date and showing the age, so a stale level is visibly stale rather than quietly wrong. If it proves unmaintainable anyway, removing it means deleting one requirement from one capability and one field from the schema, which is why the maintenance concern is its own capability rather than scattered across the existing ones.
- A fourth page and a fourth navigation entry. The maintenance page is server-rendered like the trail list, with one client-side island for the tool filter, so it follows the pattern already in the project rather than adding one.
- Interventions are added the same way as everything else, by a pull request. That fits the two people who already commit to this repository and does not fit a volunteer logging a work session from a phone. Recording an intervention without a pull request would need a write path the site does not have, and is left out.
