# Spec Delta

## Purpose

Defines how a visitor finds and reads about trails and routes on the published site: the list page with filters, the per-entry detail page with its photo gallery and problem-report entry point, and the downloadable GPX.

## ADDED Requirements

### Requirement: Entry list with filters
The site SHALL provide a list page showing every entry that is not `closed`, with name, kind, difficulty, length, ascent and municipalities. The page SHALL offer filters by kind (trail/route), difficulty, municipality and a free-text search over name, summary and tags. Filtering MUST work without a page reload and MUST be reflected in the URL query string so a filtered view can be shared.

#### Scenario: Filter by difficulty
- **WHEN** the visitor selects difficulty `E`
- **THEN** only entries with difficulty `E` are listed and the URL contains the selected filter

#### Scenario: Shared filtered URL
- **WHEN** a visitor opens the list URL with a query string selecting kind `route` and municipality `Piateda`
- **THEN** the list is already filtered accordingly on first render

#### Scenario: No match
- **WHEN** the active filters match no entry
- **THEN** the page shows an explicit "no results" message and a control to clear the filters

### Requirement: Entry detail page
The site SHALL provide one prerendered HTML page per entry at a stable URL derived from its kind and identifier (`/sentieri/<id>/` for trails, `/percorsi/<id>/` for routes). The page MUST show: name, summary, description, difficulty, municipalities, signage, duration when provided, derived statistics, an elevation profile when elevation is available, a map of the track, the status when not `open`, `verified_on` and sources when provided, and a link to download the original GPX. For routes composed of trails the page MUST link to each referenced trail.

#### Scenario: Detail page content
- **WHEN** the visitor opens `/percorsi/anello-piateda-alta/`
- **THEN** the page shows the route's metadata, derived statistics, elevation profile, map and a GPX download link, without any client-side data fetch being required to read the text content

#### Scenario: Closed entry
- **WHEN** an entry has `status: closed`
- **THEN** its detail page shows a visible notice that the entry is closed

#### Scenario: Missing elevation
- **WHEN** the entry has no elevation data
- **THEN** the page omits the elevation profile and shows elevation statistics as "not available" rather than zero

### Requirement: Photo gallery
When an entry has photos, its detail page SHALL show a gallery of thumbnails ordered by distance along the track, each opening the display image in a lightbox with its caption and author when provided, without leaving the page. Selecting a photo in the gallery MUST highlight the corresponding marker on the detail map (see `interactive-map`). Entries without photos MUST show no empty gallery section.

#### Scenario: Gallery
- **WHEN** the visitor opens the detail page of an entry with 5 photos
- **THEN** 5 thumbnails are shown in track order and clicking one opens the display image with its caption

#### Scenario: No photos
- **WHEN** the entry has no `photos/` directory
- **THEN** the page has no gallery section or heading

### Requirement: Cover image in the list
When an entry has photos, the list page SHALL show a thumbnail of its cover photo (the `cover` field, or the first photo by track order) next to the entry; entries without photos show a neutral placeholder.

#### Scenario: Cover
- **WHEN** an entry has `cover: cima.jpg`
- **THEN** the list shows the thumbnail of `cima.jpg` for that entry

### Requirement: Report a problem
When a report form is configured, each detail page SHALL offer a "Segnala un problema" action that opens a panel explaining what can be reported (obstacle, damage such as a landslide, signage, other), that a Google account is required because photos can be attached, and that the report goes to the site owner who forwards it to the maintenance volunteers. The panel SHALL let the visitor optionally pick the point of the problem on the detail map (see `interactive-map`) and then open the report form in a new tab, pre-filled with the entry name and URL and with the picked coordinates (or the entry start coordinates when no point was picked). Type, description, photos and contact details are entered in the form, not on the site. The site MUST NOT store or display any report. When no report form is configured, the action MUST be absent.

#### Scenario: Open pre-filled form
- **WHEN** the visitor picks a point at 46.1612, 9.9375 on the detail map of `/sentieri/piateda-ambria/` and confirms
- **THEN** a new tab opens on the configured form URL with the entry field pre-filled with the entry name and URL and the position field pre-filled with `46.1612, 9.9375`

#### Scenario: No point picked
- **WHEN** the visitor confirms without picking a point
- **THEN** the position field is pre-filled with the coordinates of the track's first point and the entry field with the entry name and URL

#### Scenario: Form not configured
- **WHEN** the site is built without a report form URL
- **THEN** detail pages contain no report action and no reference to reporting

### Requirement: GPX download
Each detail page SHALL link to the entry's original GPX file, served unchanged from the site, with a filename equal to `<id>.gpx`.

#### Scenario: Download
- **WHEN** the visitor follows the GPX link on `/sentieri/piateda-ambria/`
- **THEN** the browser receives a file named `piateda-ambria.gpx` whose content is byte-identical to the repository's `track.gpx`

### Requirement: Sharing metadata
Each detail page SHALL include a page title containing the entry name, a meta description equal to the summary, and Open Graph title/description tags so links shared in messaging apps show the entry name and summary.

#### Scenario: Link preview
- **WHEN** a detail page URL is fetched by a link-preview crawler
- **THEN** the HTML contains `<title>`, `meta[name=description]`, `og:title` and `og:description` populated from the entry

### Requirement: Attribution and licensing notice
Every page SHALL show the attribution required by the map tile providers and a link to the data license under which tracks are published.

#### Scenario: Footer attribution
- **WHEN** any page is rendered
- **THEN** it contains attribution to OpenStreetMap contributors and OpenTopoMap, and a link to the project's data license
