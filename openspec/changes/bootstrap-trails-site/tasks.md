# Tasks

## 1. Repository and publishing skeleton

- [x] 1.1 Authenticate `gh` against `github.com` for the personal account (`gh auth login --hostname github.com`) and verify with `gh auth status` that github.com is listed alongside the enterprise host
- [x] 1.2 Initialise git in the project folder, add `.gitignore` (node, dist, .astro), `LICENSE` (MIT) and `LICENSE-DATA` (CC BY 4.0), and verify `git status` shows only intended files
- [x] 1.3 Scaffold an Astro project with TypeScript (strict), the React integration and `output: 'static'`; set `site`/`base` from `SITE_URL`/`BASE_PATH` env vars with local defaults; verify `npm run build` produces `dist/index.html`
- [ ] 1.4 Create the public repository `trails-of-piateda` on the personal account, set `origin`, verify `git remote -v` points to `github.com`, and push `main`
- [ ] 1.5 Add `.github/workflows/pages.yml` with a `build` job (on `pull_request` and `push` to `main`: `npm ci`, `npm test`, `npm run build`, upload Pages artifact) and a `deploy` job (`push` to `main` only, `actions/deploy-pages`); enable Pages with source "GitHub Actions"; verify the placeholder page is live at `https://<owner>.github.io/trails-of-piateda/`
- [ ] 1.6 Enable branch protection on `main` requiring PRs and the `build` check, add `.github/dependabot.yml` (npm, monthly); verify by opening a throwaway PR that the check runs and is required

## 2. Catalog data model (spec: trail-catalog)

- [x] 2.1 Define `src/content.config.ts` with `trails` and `routes` collections (glob loader on `content/trails/*/trail.yaml` and `content/routes/*/route.yaml`, id = parent directory name), a shared Zod base schema (`name`, `summary` ≤200, `difficulty` enum T/E/EE/EEA, `municipalities` non-empty, `start`, optional `description`, `signage`, `duration_minutes`, `tags`, `status` default `open`, `verified_on`, `sources`, `contributors`), route-only `loop` and `trails: reference('trails')[]`, `.strict()` to reject unknown fields; verify with two fixture entries that `astro check`/`astro build` passes
- [x] 2.2 Add a build-time check that each entry directory name matches the slug regex and contains exactly `trail.yaml`/`route.yaml` plus `track.gpx` and optionally a `photos/` directory; verify with fixtures that a bad slug and a missing GPX each fail the build with an error naming the directory
- [x] 2.3 Write Vitest tests for the schema: missing `difficulty`, unknown field, route referencing a non-existent trail all fail with messages containing the entry id and the field; verify `npm test` passes

## 3. GPX processing (spec: trail-catalog)

- [x] 3.1 Implement `src/lib/gpx.ts`: parse GPX with `@tmcw/togeojson` + `@xmldom/xmldom`, validate GPX 1.1, ≥1 `<trk>`, ≥2 points, all points inside the area-of-interest bbox constant (lat 45.95–46.35, lon 9.60–10.20), errors prefixed with the entry path; verify with Vitest fixtures (valid, `<rte>` only, point in Milan) that each case behaves as the spec scenarios say
- [x] 3.2 Implement statistics in the same module: haversine length, fixed-window elevation smoothing, ascent/descent, min/max, bbox, profile resampled at a fixed distance step, `elevation: null` when `<ele>` is absent plus a build warning; verify with a Vitest fixture of known length/ascent (tolerance documented in the test) and a no-elevation fixture
- [x] 3.3 Implement simplification for the overview (`@turf/simplify`, 5 m tolerance) and memoisation per entry within a build; verify with a test that no simplified vertex is farther than 5 m from the original line
- [x] 3.4 Add static endpoints `src/pages/data/[kind]/[slug].geojson.ts` (full geometry + waypoints), `src/pages/data/overview.geojson.ts` (non-closed entries, simplified, properties id/kind/name/difficulty/length_m/ascent_m/url) and `src/pages/gpx/[slug].gpx.ts` (original bytes); verify after `npm run build` that the files exist in `dist/`, the overview excludes a `closed` fixture, and `dist/gpx/<slug>.gpx` is byte-identical to `content/.../track.gpx`

## 4. Browsing pages (spec: trail-browsing)

- [ ] 4.1 Create `src/styles/tokens.css` (Open Color values: primary green scale, gray neutrals, T/E/EE/EEA colours green/blue/red/black, status colours; type, spacing, radius, shadow scales) and `global.css` (reset, system font stack, typography); verify with a grep that no other stylesheet contains a hex colour
- [ ] 4.2 Create the base layout, mobile-first with 768/1024 px breakpoints (Italian UI strings, header nav: Elenco, Mappa, Contribuisci; footer with OpenStreetMap/OpenTopoMap/terrain attribution and link to `LICENSE-DATA`); verify every built page contains the attribution text and renders without horizontal scroll at 360 px width
- [ ] 4.3 Create detail pages `src/pages/sentieri/[slug].astro` and `src/pages/percorsi/[slug].astro` showing all metadata, derived statistics, status notice when not `open`, links to referenced trails, GPX download link to `gpx/<slug>.gpx`, and `<title>`, meta description, `og:title`, `og:description`; layout per design D12 (mobile: map 45 vh with fullscreen toggle, stats bar, fixed bottom action bar; desktop: two columns with sticky map); verify by inspecting the built HTML of a fixture route and of a `closed` fixture and by checking both layouts in the browser at 360 px and 1280 px
- [ ] 4.4 Implement the elevation profile as a build-time inline SVG component with a small hover script, omitted when elevation is unavailable (statistics shown as "non disponibile"); verify on the two fixtures (with/without `<ele>`)
- [ ] 4.5 Create the list page `src/pages/index.astro`: server-rendered cards (cover thumbnail, difficulty badge, stats row, municipalities) plus a React island for filters (chip row on mobile, sidebar on desktop) (kind, difficulty, municipality, free text) synced to the query string with `replaceState`, "nessun risultato" state with clear button; verify in the browser that loading `/?kind=route&municipality=Piateda` renders pre-filtered and that clearing filters restores the full list

## 5. Interactive map (spec: interactive-map)

- [ ] 5.1 Add `src/lib/mapConfig.ts` with the OpenTopoMap raster source, the Mapterhorn raster-dem source (AWS Terrarium alternative commented with its URL and encoding), attribution strings, difficulty colours (same values as `tokens.css`), white casing width and kind dash patterns; verify the module is the only place tile URLs appear (`grep`) and add a Vitest test asserting the difficulty colours equal those parsed from `tokens.css`
- [ ] 5.2 Implement the `TrackMap` React island (`client:only="react"`) with MapLibre GL JS: base map, hillshade, terrain with TerrainControl and NavigationControl (pitch), GeoJSON source from a `dataUrl` prop, styled line layers, start/end/waypoint markers, hover highlight, click → side panel with properties and detail link; verify manually on the overview page that tilt/rotate work and tracks stay draped
- [ ] 5.3 Implement degradation: WebGL probe rendering the unavailability message, and DEM `error` handler calling `setTerrain(null)`; verify by forcing WebGL off in the browser (or a mocked `supported()`) and by pointing the DEM URL at an invalid host, checking no unhandled error and 2D rendering
- [ ] 5.4 Create `src/pages/mappa.astro` (overview, full viewport, terrain on, exaggeration 1.2, initial fit to overview bbox, collapsible legend, selection panel as bottom sheet on mobile and side panel on desktop) and embed the map in detail pages (fit to track, terrain off by default); verify the initial overview viewport contains every track and the detail map shows start and end markers

## 6. Photos (specs: trail-catalog, trail-browsing, interactive-map)

- [ ] 6.1 Extend the metadata schema with optional `photos` (file, caption ≤200, lat/lon, author) and `cover`; verify with Vitest that an unknown photo field and a `cover` not in `photos/` fail with the entry id in the message
- [ ] 6.2 Implement `src/lib/photos.ts`: list `photos/`, enforce JPEG / ≤2 MB / ≤12 files, read EXIF GPS with `exifr`, apply metadata overrides, require a position, check the area-of-interest bbox, compute nearest-track distance with a 500 m warning; verify with fixtures (geotagged, no GPS + override, no GPS + no override, 3 MB file, 800 m away) that each spec scenario behaves as written
- [ ] 6.3 Generate display (1600 px) and thumbnail (400 px) images through Astro's image service and verify with a test that the outputs carry no EXIF tags and that the original file is absent from `dist/`
- [ ] 6.4 Add the gallery to detail pages (thumbnails in track order, `<dialog>` lightbox with caption/author, `photo:select` event) and the cover thumbnail with placeholder to the list page; verify on fixtures with 5 photos and with none (no gallery section rendered)
- [ ] 6.5 Add camera markers to the detail map island from the photo props, wire marker click → lightbox and gallery selection → marker highlight, and verify the overview map receives no photo data (only a `photos` count in `overview.geojson`)

## 7. Problem reporting (specs: trail-browsing, interactive-map)

- [ ] 7.1 Add `PUBLIC_REPORT_FORM_URL`, `PUBLIC_REPORT_FORM_FIELD_ENTRY`, `PUBLIC_REPORT_FORM_FIELD_POSITION` to the site config with the workflow passing them from repository variables; verify that a build without them renders no report action on detail pages (grep the built HTML)
- [ ] 7.2 Implement the report panel on detail pages (explanation text incl. Google sign-in and data destination, "scegli il punto sulla mappa" toggle emitting `report:pick`, coordinates display from `report:point`, "Apri il modulo" building the pre-filled URL and opening a new tab); verify with a test that the generated URL contains the encoded entry name + URL and the coordinates, and the first track point when no point was picked
- [ ] 7.3 Implement picking mode in the map island (single movable marker, `report:point` with 4-decimal coordinates, normal click behaviour when off, works with terrain on); verify manually per the spec scenarios
- [ ] 7.4 Write `docs/report-form.md` describing the Google Form questions to create (entry, position, type, description, photo upload, optional contact), how to obtain the pre-fill field ids from a pre-filled link, and how to set the repository variables; verify by creating the form from the document and completing one end-to-end report on a preview build

## 8. Contribution documentation (spec: site-publishing)

- [x] 8.1 Write `README.md` (project purpose, live URL, local setup, how the build validates data, how to swap tile providers, report-form configuration variables) and verify a fresh clone follows it to a running dev server
- [x] 8.2 Write `CONTRIBUTING.md` (directory layout, every metadata field with examples, GPX requirements incl. bbox and thinning advice, photo requirements: JPEG, ≤2 MB, ≤12 per entry, resize to 2000 px, geotag or manual lat/lon, rights and consent, EXIF stripping; how statistics are computed, data-license acceptance statement covering photos); verify by having a fixture entry added following only the document
- [ ] 8.3 Add `.github/PULL_REQUEST_TEMPLATE.md` (entry checklist: files present, fields filled, GPX inside area, photos within limits and rights owned, license accepted) and `.github/ISSUE_TEMPLATE/proposta-sentiero.yml` (form to propose a trail with optional GPX attachment); verify both render on GitHub when opening a PR/issue

## 9. Seed data and release

- [ ] 9.1 Ask the owner for the GPX files and any photos (not yet in the repo) and import them into `content/trails/` and `content/routes/`, one directory each, writing the metadata files; verify `npm run build` passes and lists a warning for every track without elevation
- [ ] 9.2 Review derived statistics against the owner's knowledge of the trails (length, ascent within plausible range); adjust the smoothing window if systematically off and record the chosen value in CONTRIBUTING
- [ ] 9.3 Remove fixture entries from `content/` (keep them under `tests/fixtures/`), merge to `main`, and verify on the live Pages URL: list with cover thumbnails, one detail page with GPX download and photo gallery linked to map markers, map with terrain, a shared filtered URL, and one problem report submitted from a detail page arriving in the form's spreadsheet
