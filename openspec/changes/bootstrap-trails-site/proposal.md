# Proposal

## Why

Trails (sentieri) and hiking itineraries (percorsi) around Piateda (SO) have no single public place where they are listed, described and shown on a map; the GPX tracks exist but sit on personal disks. This change bootstraps a public, static website that publishes them and lets others add new ones through pull requests, with no server, database or CMS to operate. The municipality has a volunteer group that maintains the trails; the site is also the place where hikers can report obstacles or damage (for example a landslide) so the owner can forward reports to that group.

## What Changes

- Create a new public repository on the owner's personal GitHub account (`trails-of-piateda`) and set up a static site published on GitHub Pages by CI on every push to `main`.
- Introduce a file-based trail catalog kept in the repository: one folder per entry containing a metadata file and a GPX track. Two entry kinds: **trail** (a single signed path, e.g. a CAI-numbered segment) and **route** (an itinerary such as a loop or a day hike, optionally composed of trails).
- Validate every catalog entry at build time (schema of the metadata, parseable GPX, geometry inside the area of interest) so an invalid contribution fails the pull-request check instead of reaching the site.
- Derive statistics from each GPX at build time: length, ascent/descent, min/max elevation, bounding box, elevation profile. Contributors provide only the GPX and the descriptive metadata.
- Publish a browsable site: a list page with filters (kind, difficulty, municipality, free text), one prerendered detail page per entry with description, statistics, elevation profile, map and GPX download.
- Provide an interactive map of all entries with 3D terrain (tilt, rotate, elevation exaggeration) that degrades to a 2D map when 3D is not available; selecting a track on the map leads to its detail page.
- Let each entry carry geotagged photos stored in the entry folder: the position is read from the photo's EXIF GPS data (or given by hand), photos are shown in a gallery on the detail page and as markers on the detail map, and are resized and stripped of EXIF at build time.
- Let visitors report a problem on an entry (obstacle, damage, signage) from its detail page: the visitor may pick the point on the map, then the site opens a Google Form pre-filled with the entry and the coordinates; type, description and photos are entered in the form. Responses land in a spreadsheet owned by the site owner. Reports are not shown on the site.
- Document the contribution flow (CONTRIBUTING, PR template, issue template for proposing a trail) so people with a GitHub account can add or fix entries via PR.
- Seed the catalog with the GPX files the owner already has.

Assumptions recorded here (not confirmed by the user):
- UI language is Italian only; internationalisation is out of scope.
- Difficulty uses the Italian CAI scale (T, E, EE, EEA).
- "Neighbouring municipalities" means any track that starts, ends or passes in Piateda is in scope, whatever other municipalities it crosses; the metadata lists all municipalities touched.
- Comments, user accounts, and live conditions (closures, weather) are out of scope for this change. Displaying reports, their status or a history of problems on the site is out of scope (owner decision, 2026-09-19); reports are collected only. Photos are in scope (added on 2026-09-19 at the owner's request) but only as static files in the repository, without upload from the site.

## Capabilities

### New Capabilities
- `trail-catalog`: the repository-hosted data model for trails and routes (metadata file + GPX + optional geotagged photos per entry), its validation rules, and the statistics and photo positions derived at build time.
- `trail-browsing`: the static pages that let a visitor find and read about an entry: filtered list, detail page with statistics, elevation profile, photo gallery, GPX download, shareable URL, and the entry point to report a problem.
- `interactive-map`: the map view of tracks with 3D terrain, navigation controls, selection of a track, photo markers and report-point picking on the detail map, and the 2D fallback.
- `site-publishing`: building the static site, publishing it to GitHub Pages from `main`, and running the same build as a required check on pull requests so contributions are validated before merge.

### Modified Capabilities
None (greenfield project; no existing specs).

## Impact

- New repository with a Node.js toolchain (Node 24 is installed locally), an Astro static site with React islands, MapLibre GL JS for the map, and a GitHub Actions workflow for Pages. Details in design.md.
- External runtime dependencies of the published site, all keyless and free: OpenTopoMap raster tiles (CC-BY-SA, attribution required, "contact us for bigger projects" policy), a public raster-DEM tile service for terrain (Mapterhorn, with AWS Terrain Tiles as alternative). If either service disappears or throttles, the map degrades: base map missing or terrain flat. No secrets are needed in CI.
- Local prerequisite: `gh` is currently authenticated only against the company GitHub Enterprise instance; publishing requires a `github.com` login for the personal account (or plain `git` with SSH keys for that account).
- Licensing: code under MIT; GPX and descriptive data under CC BY 4.0 (confirmed by the owner), accepted by contributors when opening a PR. GPX files are freely downloadable from every detail page.
- Problem reports depend on a Google Form managed by the owner outside the repository (form URL and pre-fill field ids are configuration). Because the form has a file-upload question, respondents must sign in with a Google account, accepted by the owner. Reporter data (Google account email, description, photos) is stored in the owner's Google Drive/Sheets, not in the repository. Until the form is configured the report button is absent from the site.
- Repository size: photos are committed as files, bounded to 2 MB each and 12 per entry. At those limits 100 fully-illustrated entries are about 2 GB, above GitHub's recommended repository size; the expected real volume is far lower, and moving photos to external storage is a possible later change. Git LFS was not chosen (bandwidth quota and contributor friction).
- The owner's GPX files are not yet in the folder and will be provided when the seed-data task is reached.
