# Spec Delta

## Purpose

Describes what clearing a trail or route takes, what has already been done, and what still needs attention across the whole catalog, so the volunteers who maintain the paths around Piateda can plan a work session from the site instead of from memory.

## ADDED Requirements

### Requirement: Maintenance block
A catalog entry MAY carry an optional `maintenance` object in its metadata. Every field inside it is optional, and an entry without the object is valid. The object accepts: `tools` (list of tool identifiers from the vocabulary below), `effort_person_hours` (number greater than 0 and at most 200), `min_people` (integer of at least 1 and at most 20), `notes` (string, at most 500 characters), `condition` (one of `buono`, `da_sfoltire`, `invaso`), `condition_checked_on` (ISO date) and `interventions` (list of recorded interventions, specified below). Unknown fields inside the object MUST be rejected, and an object with no field at all MUST be rejected rather than silently ignored.

#### Scenario: Entry without maintenance information
- **WHEN** an entry's metadata has no `maintenance` object
- **THEN** the entry is valid and its detail page shows no maintenance section

#### Scenario: Valid maintenance block
- **WHEN** an entry declares `tools: [decespugliatore, roncola]`, `effort_person_hours: 8`, `min_people: 2`
- **THEN** the entry is valid and those values are available to its detail page

#### Scenario: Unknown field inside the block
- **WHEN** an entry declares `maintenance.attrezzi`
- **THEN** the build fails and the error names the entry and the unknown field

#### Scenario: Empty block
- **WHEN** an entry declares `maintenance: {}`
- **THEN** the build fails and the error names the entry and states that the block must carry at least one field

#### Scenario: Effort out of range
- **WHEN** an entry declares `effort_person_hours: 0`
- **THEN** the build fails and the error names the entry, the field and the accepted range

### Requirement: Tool vocabulary
Tool identifiers SHALL come from a fixed vocabulary defined in the repository, so the same tool is always written the same way. The vocabulary MUST cover at least: `decespugliatore`, `motosega`, `sega-a-mano`, `roncola`, `cesoie`, `vanga`, `zappa`, `rastrello`, `badile`, `carriola`, `vernice-segnaletica`, `attrezzi-da-falegname`. A tool identifier outside the vocabulary MUST fail the build with an error naming the entry, the unrecognised identifier and the accepted values. Anything the vocabulary does not cover is described in `notes`, which is free text.

#### Scenario: Unrecognised tool
- **WHEN** an entry declares `tools: [motosegha]`
- **THEN** the build fails and the error names the entry, the value `motosegha` and lists the accepted identifiers

#### Scenario: Duplicate tool
- **WHEN** an entry lists the same tool twice
- **THEN** the build fails and the error names the entry and the repeated identifier

#### Scenario: Tool outside the vocabulary described in notes
- **WHEN** an entry needs a tool the vocabulary does not have and describes it in `notes`
- **THEN** the entry is valid and the note is shown with the rest of the maintenance information

### Requirement: Condition assessment carries its date
Whenever `condition` is given, `condition_checked_on` MUST be given too, and MUST NOT be a date in the future. `condition_checked_on` MAY be given without `condition`, meaning the trail was checked and found to need nothing recorded.

#### Scenario: Condition without a date
- **WHEN** an entry declares `condition: invaso` and no `condition_checked_on`
- **THEN** the build fails and the error names the entry and states that an assessment needs its date

#### Scenario: Date in the future
- **WHEN** an entry declares `condition_checked_on` later than the build date
- **THEN** the build fails and the error names the entry and the date

### Requirement: Maintenance section on the detail page
When an entry carries a `maintenance` object, its detail page SHALL show a section, separate from the hiking information and labelled as addressed to whoever maintains the trail, containing the tools by their Italian names, the estimated effort in person-hours, the minimum number of people, the notes, and the condition with the date it was assessed. Fields that are absent MUST be omitted rather than shown as empty or zero.

#### Scenario: Full block
- **WHEN** an entry declares tools, effort, minimum people, notes and a recent condition
- **THEN** the detail page shows all of them in one section, with the tools spelled out in Italian rather than as identifiers

#### Scenario: Partial block
- **WHEN** an entry declares only `min_people: 2`
- **THEN** the section shows the minimum number of people and nothing about tools, effort, notes or condition

### Requirement: A condition that no longer describes the trail is shown as such
A condition SHALL be presented as current only when it is recent and nothing has happened to the trail since. It MUST be presented as needing a fresh check when it was assessed more than twelve months before the build date, and as superseded when the entry records an intervention carried out after the assessment. In both cases the recorded level and its date MUST still be shown. The twelve-month threshold MUST be a single value defined in one place.

#### Scenario: Recent assessment
- **WHEN** `condition_checked_on` is three months before the build date and no intervention is recorded after it
- **THEN** the page shows the condition and its date as current information

#### Scenario: Stale assessment
- **WHEN** `condition_checked_on` is eighteen months before the build date
- **THEN** the page shows the recorded level and its date together with a visible note that it needs checking again

#### Scenario: Assessment superseded by an intervention
- **WHEN** `condition: invaso` was assessed in May and the entry records an intervention carried out in July of the same year
- **THEN** the page shows that the level predates the last intervention and no longer describes the trail, naming both dates

#### Scenario: Check with no level recorded
- **WHEN** an entry declares `condition_checked_on` and no `condition`
- **THEN** the page shows the date of the last check and states that no condition was recorded

### Requirement: Intervention log
The `maintenance` object MAY carry an `interventions` list. Each entry MUST have `date` (ISO date, not in the future) and `summary` (string, at most 300 characters), and MAY have `people` (integer of at least 1 and at most 50), `person_hours` (number greater than 0 and at most 500), `tools` (list of identifiers from the vocabulary, no duplicates) and `by` (string naming who carried it out, at most 100 characters). Unknown fields MUST be rejected. An empty list MUST be rejected.

#### Scenario: Recorded intervention
- **WHEN** an entry records an intervention with a date, a summary, four people and six person-hours
- **THEN** the entry is valid and the intervention is available to its pages

#### Scenario: Intervention without a summary
- **WHEN** an intervention has a date and no `summary`
- **THEN** the build fails and the error names the entry, the intervention's date and the missing field

#### Scenario: Intervention in the future
- **WHEN** an intervention's `date` is later than the build date
- **THEN** the build fails and the error names the entry and the date

#### Scenario: Empty list
- **WHEN** an entry declares `interventions: []`
- **THEN** the build fails and the error names the entry and states that the list must not be empty

### Requirement: Interventions on the detail page
When an entry records interventions, its detail page SHALL show them in the maintenance section, most recent first, each with its date and summary and with the optional details when present. The date of the most recent intervention MUST be shown even when the list is collapsed.

#### Scenario: Several interventions
- **WHEN** an entry records three interventions
- **THEN** the page shows them newest first, and the newest date is visible without any interaction

#### Scenario: No interventions
- **WHEN** an entry's maintenance block records none
- **THEN** the page shows no intervention list and no empty heading

### Requirement: Maintenance overview page
The site SHALL provide a page at a stable URL listing every catalog entry that is not `closed`, reachable from the site navigation, showing for each: name with a link to its detail page, condition with its state (current, needing a check, superseded, or not recorded), tools required, estimated effort, minimum number of people, and the date of the most recent recorded intervention. Entries carrying no maintenance information MUST be listed in a group of their own, labelled as lacking information, rather than mixed in as if they needed nothing.

#### Scenario: Ordering
- **WHEN** the page is rendered
- **THEN** entries carrying maintenance information come first, ordered by how much attention they need: by condition from `invaso` to `buono`, and within the same condition the older assessment first; entries without maintenance information follow in their own group

#### Scenario: Filter by tool
- **WHEN** the visitor filters by `motosega`
- **THEN** only entries whose maintenance block lists that tool remain, the filter is reflected in the URL query string, and no page reload occurs

#### Scenario: Closed entry
- **WHEN** an entry has `status: closed`
- **THEN** it does not appear on the maintenance page

#### Scenario: Total effort
- **WHEN** the page is rendered with entries declaring estimated effort
- **THEN** it shows the sum of the estimated effort of the entries currently listed, so a work session can be sized
