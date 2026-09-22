# Design

## Context

See proposal.md for motivation; the two spec deltas under `specs/` carry the requirements.

What the code does today, read before drafting:

- `src/content.config.ts` builds one shared Zod base schema, extended by the `trails` and `routes` collections, with `.strict()` so an unknown field fails the build. `verified_on` already accepts a `Date` or a `YYYY-MM-DD` string and normalises to the string, because js-yaml parses an unquoted date into a `Date`.
- The schema already has a `status` field whose values are `open`, `closed` and `maintenance`. That value means the entry is closed for works, which is not the same thing as a trail being overgrown.
- `src/components/EntryPage.astro` renders a `<dl class="entry__meta">` of hiking facts and is shared by the trail and route pages.
- `src/components/format.ts` holds the Italian number and date formatting the pages use.
- No build step has a notion of "today" yet: nothing in the site depends on the build date.

## Goals / Non-Goals

**Goals:**
- Give the volunteers the three facts they asked for, on the page of the trail they are about to work on.
- Make a stale condition visibly stale, because the owner already expects this field to rot.
- Keep the whole concern removable in one piece.

**Non-Goals:**
- Recording an intervention from a phone after a work session. That needs a write path the site does not have; interventions arrive by pull request like everything else.
- Restricting the information to volunteers. A static site with no accounts cannot.
- Assigning work, scheduling dates, or notifying anyone.
- Deriving difficulty of maintenance from anything automatic, such as the track's length or slope.

## Decisions

### D1. Its own capability, not fields scattered into the existing ones

`trail-maintenance` owns the block's contents, its vocabulary, its presentation and its staleness rule. `trail-catalog` only learns that an optional `maintenance` field exists and points at the other capability for what is inside it.

Why: the owner said outright that the condition level may have to go. Concentrating the concern means removing it is deleting one spec and one schema object, not unpicking sentences from the metadata requirement, the detail page requirement and the contributor guide. It also keeps the metadata requirement, already the longest in the project, from growing another clause.

Alternative discarded: put everything into `trail-catalog` and `trail-browsing`. Fewer files, but the removal the owner is already contemplating becomes a careful edit of two shared requirements.

### D2. `condition`, not a second meaning for `status`

The level is called `condition` and lives inside the `maintenance` block. `status: maintenance` keeps its meaning: the entry is closed while works happen.

Why: a trail can be badly overgrown and perfectly open, and a trail closed for a landslide can be in fine vegetative condition. Overloading one field would make both unreadable. The two are shown in different places on the page for the same reason.

### D3. Effort in person-hours, minimum people separate

`effort_person_hours` is the total work; `min_people` is how many people the job needs at once. The page shows both and CONTRIBUTING explains the unit with an example.

Why: "three hours" is meaningless without a team size, and the two numbers answer different questions. The minimum is a constraint (chainsaw work is not done alone), not a division of the effort. Showing a computed "two hours with four people" was discarded: it implies the work parallelises perfectly, which clearing a path does not.

### D4. A closed vocabulary for tools, free text beside it

The tool identifiers are a frozen list in `src/lib/maintenance.ts`, validated by a Zod enum, with an Italian label per identifier for display. `notes` takes anything the list does not cover.

Why: the point of recording tools is to answer "which trails need the chainsaw" later. Free text gives `motosega`, `Motosega`, `moto-sega` and never answers it. The Zod enum error already lists the accepted values, so a contributor who guesses wrong is told the vocabulary rather than having to find it in the documentation. Duplicates are rejected by a refinement, because a list with the same tool twice is a mistake, not an emphasis.

The list starts from what clearing a mountain path in Valtellina actually takes and is meant to grow: adding an identifier is one line plus its label. Growing it is a change to this capability, which keeps the vocabulary reviewed rather than accumulating synonyms.

### D5. Staleness computed at build time, against a threshold and against the intervention log

`CONDITION_STALE_AFTER_MONTHS = 12` lives with the vocabulary. The page compares `condition_checked_on` against the build date and against the date of the most recent recorded intervention, and renders one of four states: current, needing a check, superseded by a later intervention, or checked with nothing recorded.

The supersession rule is the more reliable half. Twelve months is a guess about vegetation; an intervention recorded after the assessment is a fact, and it says the recorded level describes a trail that no longer exists. Where both apply, supersession is reported, because it explains *why* the level is wrong rather than only that it is old.

Why twelve months: vegetation closes a path over one or two growing seasons, so an assessment from the previous year is a hint and not a fact. The number is a guess and is written as one, in a single constant.

Why at build time rather than in the browser: the site is static and rebuilt on every merge, so the page is never much older than its last deploy, and computing it on the server keeps the section readable with JavaScript off. The consequence is that a site left undeployed for a year will show a condition as recent when it is not. That is acceptable because the deploy happens on every content change, and the date itself is always printed next to the level, so a reader can judge for themselves. This is the first thing in the project that depends on the build date; it is read once into a constant so tests can inject a fixed date instead of depending on when they run.

### D6. Where it goes on the page

A section of its own after the hiking content, headed so that a hiker knows it is not for them, with the condition first when present because it is the thing that decides whether an intervention is needed at all. Absent fields are omitted; nothing renders as zero or as an empty list.

Why not in the existing `<dl>` of hiking facts: mixing "minimum two people" with "duration 2 h 30" invites a hiker to read the maintenance effort as walking time.

### D7. Interventions live inside the maintenance block

`maintenance.interventions` is a list in the entry's metadata file, newest entries appended, each with a date and a summary and optional people, person-hours, tools and author.

Why inside the entry rather than one file per intervention: the catalog layout check expects exactly a metadata file, a track and an optional photos directory, and adding a fourth shape would change a rule every contributor has already learned. A trail is cleared once or twice a year, so ten years of history is twenty short records in a file that is reviewed in the same pull request as the trail it belongs to.

Why inside `maintenance` rather than at the top level of the metadata: the whole concern stays removable in one piece, as decision D1 requires.

The cost is honest and worth stating: this is a log in a file edited by hand, so it will be incomplete. Nothing depends on it being complete. A missing intervention means the condition is not marked superseded, which is the same state as before this change.

### D8. The overview page is the trail list with a different lens

`/manutenzione/` is server-rendered from the same collections as the trail list, with one React island for the tool filter, reusing the pattern of `FilterPanel`: the server renders every row and the island toggles `hidden` on rows it looks up by id, so the page is complete before hydration and with JavaScript off.

The ordering is computed at build time from a single comparator: entries with maintenance information first, sorted by condition from `invaso` to `buono` and then by the age of the assessment, then entries without information in a labelled group. Putting entries with no information last and naming the group is deliberate: sorting them among the `buono` entries would read as "nothing to do here", when what is true is that nobody has looked.

The running total of estimated effort recalculates with the filter, since its purpose is sizing a session for the tools you actually have.

Alternative discarded: adding a maintenance column to the existing trail list and a filter beside the others. It mixes two audiences on one page, and the hiker's list is already dense; the ordering that makes the maintenance view useful is also the wrong one for someone choosing a walk.

## Risks / Trade-offs

- [The condition level goes stale and misleads anyway] → The date is always shown, past twelve months the page says it needs checking, and an intervention recorded after the assessment marks it superseded. If it still proves useless, removing it is one requirement and one field, which is the reason for D1.
- [The intervention log is filled for a while and then abandoned] → Likely, and it degrades gracefully: an entry with no interventions behaves exactly as it does without the feature. The failure mode to avoid is a page that implies completeness, so the overview shows the date of the last recorded intervention and never a count of work done or a claim that a trail is up to date.
- [The overview page is ordered by a condition field nobody fills] → Then every entry lands in the "no information" group, which is an accurate picture and a visible prompt, not a broken page.
- [The vocabulary does not fit how the volunteers speak] → It is a guess made without them. The first real entries will show it; adding or renaming identifiers is cheap, and `notes` absorbs the gap meanwhile. Renaming an identifier after entries use it is a rename in the vocabulary plus the entries, so it is worth reviewing the list with the volunteers before filling many entries.
- [Person-hours are unfamiliar to contributors] → CONTRIBUTING explains with an example; the field name says the unit; the page prints "ore-persona" rather than "ore".
- [Public visibility] → A list of tools and "needs four people" on a public page tells a reader the trail may be rough. That is true and useful information for a hiker too, so no mitigation beyond labelling the section.

## Open Questions

- Whether `condition` should also appear on the hiker's list page or filter it. Deliberately left out until there are enough entries carrying it to tell whether it is useful.
- Whether the overview should offer a printable or offline form, since the people using it will be standing in a field without signal. Additive, and better decided after the volunteers have used the page once.
