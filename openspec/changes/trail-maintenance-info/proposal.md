# Proposal

## Why

A group of volunteers maintains the trails around Piateda, and the owner and another collaborator want to organise that work from this site instead of from memory. Today nothing in the catalog says what clearing a given trail takes: someone has to have walked it recently to know whether it needs a brush cutter or a chainsaw, how long it takes, and whether one person can do it alone. That knowledge lives in a few heads and is lost when they are not available.

## What Changes

- Add an optional `maintenance` block to a trail or route's metadata: the tools its clearing needs, the estimated work in person-hours, and the minimum number of people the job requires.
- Show that block on the entry's detail page, in a section addressed to whoever is planning the work rather than to a hiker.
- Add an optional condition level inside the same block (`buono`, `da_sfoltire`, `invaso`) with the date it was assessed. The date is required whenever the level is given, and the page marks a level older than twelve months as needing a fresh check instead of presenting it as current.
- Define the tool names as a fixed vocabulary in the repository, so a contributor cannot invent a spelling and the build tells them the accepted values, with a free-text note for anything the vocabulary does not cover.
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
- Out of scope, and worth its own change if wanted later: a page listing maintenance needs across all entries, which is what planning a work day actually calls for, and any record of interventions carried out (who, when, what was done).
