# Interactive map Specification

## Purpose

Defines the interactive map that shows tracks over a topographic base map with 3D terrain, its navigation controls, track selection, photo markers and report-point picking on the detail map, and how it degrades when 3D rendering is unavailable.

## Requirements

### Requirement: Overview map of all entries
The site SHALL provide a map page showing the simplified geometry of every non-closed entry over a topographic base map, initially framed on the bounding box of all entries. Tracks MUST be visually distinguishable by kind (trail vs route) and difficulty, with a legend.

#### Scenario: Initial view
- **WHEN** the visitor opens the map page
- **THEN** all non-closed tracks are drawn and fully visible in the initial viewport

#### Scenario: Hover and click
- **WHEN** the visitor hovers a track
- **THEN** the track is highlighted and its name shown; clicking it opens a panel with name, kind, difficulty, length, ascent and a link to the detail page

### Requirement: 3D terrain
The map SHALL render terrain in 3D (elevation-displaced surface) with pitch and rotation controls, a control to toggle terrain on and off, and hillshading. Terrain elevation data MUST come from a public tile service that requires no API key. Terrain MUST be enabled by default on the overview map when the device supports it.

#### Scenario: Tilt and rotate
- **WHEN** the visitor drags with the right mouse button or uses the navigation control
- **THEN** the camera pitch and bearing change and tracks stay draped on the terrain surface

#### Scenario: Toggle terrain
- **WHEN** the visitor turns the terrain control off
- **THEN** the map renders flat in 2D with the same tracks and base map

### Requirement: Detail-page map
Each entry detail page SHALL embed a map framed on that entry's full-resolution track, with start and end markers and GPX waypoints when present, using the same base map and terrain capability as the overview map. Terrain MAY be off by default on detail pages to reduce load, but MUST be toggleable.

#### Scenario: Detail map framing
- **WHEN** the visitor opens a detail page
- **THEN** the map shows the whole track with a margin, a start marker and an end marker

### Requirement: Photo markers on the detail map
The detail-page map SHALL show a camera marker at the position of each photo of the entry. Clicking a marker MUST open that photo in the same lightbox as the gallery; selecting a photo in the gallery MUST highlight its marker. The overview map MUST NOT show photo markers.

#### Scenario: Marker click
- **WHEN** the visitor clicks a camera marker on the detail map
- **THEN** the corresponding photo opens in the lightbox with its caption

#### Scenario: Overview stays clean
- **WHEN** the visitor opens the overview map page
- **THEN** no photo markers are drawn

### Requirement: Pick a point for a report
When the report panel is in picking mode, a click on the detail map SHALL place a single movable report marker at the clicked position and expose its coordinates to the report panel; a further click moves the marker. Picking MUST work with terrain on or off. Outside picking mode a map click MUST keep its normal behaviour.

#### Scenario: Place and move
- **WHEN** picking mode is on and the visitor clicks two different points on the map
- **THEN** one marker exists at the second point and the panel shows the second point's coordinates with 4 decimal places

#### Scenario: Not in picking mode
- **WHEN** picking mode is off and the visitor clicks the map
- **THEN** no report marker is placed

### Requirement: Degradation without WebGL
When the browser cannot create a WebGL context, the map area SHALL show a message explaining that the interactive map is unavailable, and every other content of the page MUST remain usable. When WebGL is available but terrain tiles fail to load, the map MUST keep working in 2D.

#### Scenario: No WebGL
- **WHEN** WebGL context creation fails
- **THEN** the map container shows the unavailability message and the list, detail text and GPX download still work

#### Scenario: Terrain tiles unreachable
- **WHEN** DEM tile requests fail
- **THEN** tracks and the base map are still shown in 2D and no unhandled error is raised

### Requirement: Map attribution
The map SHALL display, inside the map canvas, attribution to the base map and terrain data providers as their licenses require.

#### Scenario: Attribution visible
- **WHEN** the map is rendered
- **THEN** an attribution control shows OpenStreetMap contributors, OpenTopoMap and the terrain data provider
