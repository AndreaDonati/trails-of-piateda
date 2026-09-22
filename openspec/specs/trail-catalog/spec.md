# Trail catalog Specification

## Purpose

Defines the repository-hosted catalog of trails and routes: how an entry is described, which files it consists of (metadata, GPX, optional geotagged photos), the validation every entry must pass, and the statistics and photo positions derived at build time.

## Requirements

### Requirement: Catalog entry structure
The catalog SHALL consist of entries stored in the repository, one directory per entry, under a `trails/` directory for trails (single signed paths) and a `routes/` directory for routes (itineraries). Each entry directory MUST contain exactly one metadata file (`trail.yaml` or `route.yaml`) and exactly one GPX file (`track.gpx`), and MAY contain a `photos/` subdirectory. The directory name is the entry identifier (slug) and MUST match `^[a-z0-9]+(-[a-z0-9]+)*$`.

#### Scenario: Valid trail entry
- **WHEN** the directory `trails/piateda-ambria` contains `trail.yaml` and `track.gpx` and both pass validation
- **THEN** the catalog exposes an entry of kind `trail` with identifier `piateda-ambria`

#### Scenario: Missing GPX
- **WHEN** an entry directory contains a metadata file but no `track.gpx`
- **THEN** the build fails and the error names the entry directory and the missing file

#### Scenario: Invalid slug
- **WHEN** an entry directory is named `Piateda_Ambria`
- **THEN** the build fails and the error names the directory and the required slug pattern

### Requirement: Entry metadata schema
The metadata file SHALL be validated against a schema. Required fields: `name` (non-empty string), `summary` (string, at most 200 characters), `difficulty` (one of `T`, `E`, `EE`, `EEA`), `municipalities` (non-empty list of strings; MUST include at least one of Piateda or a municipality bordering it), `start` (object with `name` and optionally `lat`/`lon`). Optional fields: `description` (Markdown string), `signage` (string, e.g. a CAI number), `duration_minutes` (positive integer), `loop` (boolean, routes only), `trails` (list of trail identifiers, routes only), `tags` (list of strings), `status` (one of `open`, `closed`, `maintenance`; default `open`), `verified_on` (ISO date), `sources` (list of strings or URLs), `contributors` (list of strings), `photos` (list of objects with `file` (filename inside `photos/`), optional `caption` (string, at most 200 characters), optional `lat`/`lon` (numbers) and optional `author` (string)), `cover` (filename of one of the photos). Unknown fields MUST be rejected.

#### Scenario: Missing required field
- **WHEN** a metadata file has no `difficulty`
- **THEN** the build fails and the error names the entry, the field and the accepted values

#### Scenario: Unknown field
- **WHEN** a metadata file contains a field `dificulty`
- **THEN** the build fails and the error names the entry and the unknown field

#### Scenario: Route referencing an unknown trail
- **WHEN** a route metadata lists `trails: [sentiero-inesistente]` and no trail with that identifier exists
- **THEN** the build fails and the error names the route and the missing trail identifier

### Requirement: GPX track validation
Each `track.gpx` SHALL be a well-formed GPX 1.1 document containing at least one `<trk>` with at least two track points in total. Every track point MUST lie inside the area of interest, defined as the bounding box latitude 45.95 to 46.35, longitude 9.60 to 10.20 (Piateda and the surrounding Valtellina and Orobie area).

#### Scenario: Well-formed track
- **WHEN** `track.gpx` parses as GPX 1.1 and contains a track with 500 points inside the area of interest
- **THEN** the entry passes GPX validation

#### Scenario: Route-only GPX
- **WHEN** `track.gpx` contains only `<rte>` elements and no `<trk>`
- **THEN** the build fails and the error explains that a `<trk>` is required

#### Scenario: Track outside area of interest
- **WHEN** a track point lies at latitude 45.46, longitude 9.19 (Milan)
- **THEN** the build fails and the error names the entry and the offending coordinate

### Requirement: Derived statistics
For each entry the system SHALL derive from the GPX, at build time: total length in metres, cumulative ascent and descent in metres, minimum and maximum elevation in metres, bounding box, and an elevation profile sampled along the distance. Ascent and descent MUST be computed after smoothing elevation to reduce GPS noise, and the smoothing method MUST be the same for every entry. Contributors MUST NOT be required to provide these values by hand.

#### Scenario: Track with elevation
- **WHEN** a GPX track has an `<ele>` value on every point
- **THEN** the entry exposes length, ascent, descent, min/max elevation, bounding box and an elevation profile

#### Scenario: Track without elevation
- **WHEN** a GPX track has no `<ele>` values
- **THEN** the entry exposes length and bounding box, marks elevation statistics as unavailable, and the build emits a warning naming the entry

### Requirement: Entry photos
An entry MAY include photos as JPEG files in its `photos/` subdirectory. Every file in `photos/` MUST be a JPEG of at most 2 MB, and an entry MUST NOT have more than 12 photos. Each photo MUST have a position: read from its EXIF GPS tags, or given by `lat`/`lon` in the entry's `photos` list, which takes precedence over EXIF. A photo listed in metadata but missing on disk, or present on disk without a position, MUST fail the build. The position MUST lie inside the area of interest. When a photo's position is farther than 500 metres from the nearest track point the build MUST emit a warning naming the file, not an error.

#### Scenario: Geotagged photo
- **WHEN** `photos/cima.jpg` (1.2 MB) has EXIF GPS coordinates 60 metres from the track and is not listed in metadata
- **THEN** the entry exposes the photo with that position and no warning

#### Scenario: Photo without position
- **WHEN** `photos/rifugio.jpg` has no EXIF GPS tags and no `lat`/`lon` in the `photos` list
- **THEN** the build fails and the error names the entry and the file and explains how to provide the position

#### Scenario: Manual position override
- **WHEN** the `photos` list gives `lat`/`lon` for a file that also has EXIF GPS tags
- **THEN** the metadata position is used

#### Scenario: Photo too large
- **WHEN** a file in `photos/` is 3 MB
- **THEN** the build fails and the error names the entry, the file, its size and the 2 MB limit

#### Scenario: Photo far from track
- **WHEN** a photo's position is 800 metres from the nearest track point but inside the area of interest
- **THEN** the build succeeds and emits a warning naming the entry, the file and the distance

### Requirement: Derived photo data
For each photo the system SHALL derive at build time: its position, the distance along the track of the nearest track point, a display image at most 1600 pixels on the long side, and a thumbnail at most 400 pixels on the long side. Derived images MUST NOT contain EXIF metadata. The original file MUST NOT be published.

#### Scenario: Derived images
- **WHEN** the site is built with an entry that has one 4000x3000 photo with EXIF GPS, date and camera model
- **THEN** the output contains a 1600x1200 display image and a 400x300 thumbnail, neither containing EXIF tags, and no copy of the original file

### Requirement: Track geometry outputs
The catalog SHALL expose for each entry a full-resolution track geometry and, for the overview of all entries, a simplified geometry whose total size across all entries is bounded so the overview loads in one request. The simplification MUST NOT move any point more than 5 metres from the original track.

#### Scenario: Overview geometry
- **WHEN** the site is built with any number of entries
- **THEN** a single overview file exists containing the simplified geometry, identifier, kind, name and difficulty of every entry with status `open` or `maintenance`

#### Scenario: Closed entry
- **WHEN** an entry has `status: closed`
- **THEN** it is excluded from the overview geometry but its detail page still exists and states that it is closed
