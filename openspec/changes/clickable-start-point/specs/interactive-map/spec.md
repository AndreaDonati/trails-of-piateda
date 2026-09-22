# Spec Delta

## MODIFIED Requirements

### Requirement: Detail-page map
Each entry detail page SHALL embed a map framed on that entry's full-resolution track, with start and end markers and GPX waypoints when present, using the same base map and terrain capability as the overview map. Terrain MAY be off by default on detail pages to reduce load, but MUST be toggleable. The start marker SHALL be placed on the coordinates declared in the entry's metadata when it has them, and on the track's first point otherwise. The map SHALL centre on the start marker and highlight it when the page asks for it, and the highlight SHALL clear when the visitor next interacts with the map.

#### Scenario: Detail map framing
- **WHEN** the visitor opens a detail page
- **THEN** the map shows the whole track with a margin, a start marker and an end marker

#### Scenario: Declared start differs from the recorded track
- **WHEN** the entry declares start coordinates 200 metres from the first point of its GPX track
- **THEN** the start marker is placed on the declared coordinates, not on the first track point

#### Scenario: Focus request
- **WHEN** the page asks the map to focus the start point
- **THEN** the map centres on the start marker and the marker is visibly highlighted

#### Scenario: Highlight is temporary
- **WHEN** the start marker is highlighted and the visitor then pans, zooms or clicks the map
- **THEN** the highlight clears
