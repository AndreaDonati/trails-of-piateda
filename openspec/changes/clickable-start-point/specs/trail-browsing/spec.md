# Spec Delta

## MODIFIED Requirements

### Requirement: Entry detail page
The site SHALL provide one prerendered HTML page per entry at a stable URL derived from its kind and identifier (`/sentieri/<id>/` for trails, `/percorsi/<id>/` for routes). The page MUST show: name, summary, description, difficulty, municipalities, signage, duration when provided, derived statistics, an elevation profile when elevation is available, a map of the track, the status when not `open`, `verified_on` and sources when provided, and a link to download the original GPX. For routes composed of trails the page MUST link to each referenced trail. Next to the start point's name the page MUST show its coordinates in decimal degrees with four decimals, as a control that focuses the start marker on the detail map (see `interactive-map`). The coordinates shown MUST be the same point the marker sits on.

#### Scenario: Detail page content
- **WHEN** the visitor opens `/percorsi/anello-piateda-alta/`
- **THEN** the page shows the route's metadata, derived statistics, elevation profile, map and a GPX download link, without any client-side data fetch being required to read the text content

#### Scenario: Closed entry
- **WHEN** an entry has `status: closed`
- **THEN** its detail page shows a visible notice that the entry is closed

#### Scenario: Missing elevation
- **WHEN** the entry has no elevation data
- **THEN** the page omits the elevation profile and shows elevation statistics as "not available" rather than zero

#### Scenario: Start coordinates declared in metadata
- **WHEN** the entry's metadata gives `start.lat` 46.1612 and `start.lon` 9.9375
- **THEN** the page shows those coordinates next to the start point's name, formatted with four decimals

#### Scenario: Start coordinates absent from metadata
- **WHEN** the entry's metadata gives a start name but no `start.lat` and no `start.lon`
- **THEN** the page shows the coordinates of the track's first point instead, so the control is present on every entry

#### Scenario: Focusing the start from the page
- **WHEN** the visitor activates the start coordinates
- **THEN** the detail map centres on the start marker and highlights it, and the page does not navigate away

#### Scenario: Map unavailable
- **WHEN** the interactive map cannot run in the visitor's browser
- **THEN** the coordinates are still shown as text and activating them changes nothing visible instead of raising an error
