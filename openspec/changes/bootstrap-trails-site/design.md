# Design

## Context

Greenfield: the working directory contains only the OpenSpec scaffolding, no code and no GPX files yet (the owner has them elsewhere). Constraints from the request and the environment:

- Static hosting on GitHub Pages: no server, no database, no secrets at runtime. Data lives in the repository and changes through pull requests.
- The owner knows React and JavaScript well; other frameworks are acceptable but add learning cost for them and for contributors.
- A navigable 3D view of the terrain is wanted, 2D acceptable if 3D is too expensive.
- Node 24 and npm 11 are installed locally. `gh` is logged in only to the company GitHub Enterprise host; `github.com` is not configured.
- No OpenSpec main specs exist; the four capabilities in proposal.md are all new.

Motivation: see proposal.md, "Why". Behaviour: see the four spec deltas under `specs/`.

## Goals / Non-Goals

**Goals:**
- Zero-operations publishing: `git push` to `main` is the only deployment action.
- A contribution is a folder with two files; every mistake a contributor can make is caught by the PR check with a message that names the entry and the problem.
- Prerendered HTML per entry so links are shareable and indexable; JavaScript is required only for the map and the client-side filters.
- Keep third-party services to keyless, free tile providers so no account or billing is attached to the project.

**Non-Goals:**
- Custom terrain rendering (three.js / Cesium scene graphs), offline maps, GPX editing in the browser.
- Any write path from the site (comments, ratings, photo uploads). Photos enter only through the repository. Problem reports are the one exception and go to a Google Form owned by the site owner, not to the site.
- Multi-language UI. Text is Italian; identifiers, code and docs for developers are English.
- Performance beyond "a few hundred entries": the overview file is one request, sized for that order of magnitude.

## Decisions

### D1. Site generator: Astro with React islands

Chosen: Astro (static output) with TypeScript. Content collections with a Zod schema hold the catalog; interactive parts (map, list filters) are React components hydrated as islands.

Why: content collections give schema validation of YAML at build time for free, which is exactly the PR-check behaviour `trail-catalog` requires; static output yields one HTML file per entry (`trail-browsing`, sharing metadata) with no routing hacks on Pages; React islands let the owner use the framework they know for the interactive bits while shipping no framework JS on text-only pages. Astro's `base` option handles the `/trails-of-piateda/` sub-path.

Alternatives discarded:
- Vite + React SPA: no prerendering, so link previews and indexing need extra work; Pages needs a 404.html redirect trick for deep links; all catalog data would be fetched client-side.
- Next.js static export: works but heavier toolchain and a routing model that fights the sub-path; nothing here needs its features.
- SvelteKit/Nuxt static: comparable to Astro technically, but the owner would have to learn Svelte/Vue plus the meta-framework, and contributors are more likely to know React.
- Docusaurus/VitePress: documentation-oriented; bending them to a geodata catalog costs more than Astro's blank slate.

### D2. Catalog layout: one directory per entry, YAML + GPX

```
content/
  trails/<slug>/trail.yaml
  trails/<slug>/track.gpx
  routes/<slug>/route.yaml
  routes/<slug>/track.gpx
```

Two Astro collections (`trails`, `routes`) using the `glob` loader on the YAML files, with the slug taken from the parent directory name. `routes.trails` uses `reference('trails')` so a dangling reference fails the build.

Why one directory per entry: a PR that adds a trail touches one folder, reviewers see metadata and track together, renaming is a single move. Why YAML over JSON: comments and multi-line `description` are common in this kind of data and YAML handles both; Zod validates either identically. Why two collections rather than a `kind` field: different required/optional fields (`loop`, `trails` only make sense on routes) are expressed as two schemas instead of conditional validation, and URLs differ (`/sentieri/`, `/percorsi/`).

Alternative discarded: one big `trails.json` index plus a `gpx/` folder. Merge conflicts on every concurrent PR and no co-location of track and metadata.

### D3. GPX processing at build time inside Astro, no separate pre-build step

A `src/lib/gpx.ts` module parses `track.gpx` (reading the DOM from `@xmldom/xmldom` by local element name, so a namespace-prefixed GPX is accepted; `@tmcw/togeojson` was dropped during implementation because it matches qualified names only), validates it (GPX 1.1, ≥1 `<trk>`, ≥2 points, all points within the area-of-interest bbox), and computes statistics: haversine length, elevation smoothed with a moving median/average over a fixed window before summing ascent/descent, min/max elevation, bbox, and a profile resampled at a fixed distance step. Results are memoised per entry during a build.

Outputs are produced as Astro static endpoints, so they are ordinary files in `dist/`:
- `data/<kind>/<slug>.geojson`: full-resolution LineString plus waypoints, used by detail maps.
- `data/overview.geojson`: FeatureCollection of all non-closed entries with geometry simplified (Douglas-Peucker, 5 m tolerance via `@turf/simplify`) and properties `id, kind, name, difficulty, length_m, ascent_m, url`.
- `gpx/<slug>.gpx`: the original file copied unchanged (endpoint that returns the file bytes), giving a stable download URL and filename.

GPX validation failures are thrown from the endpoint/page generation with a message that includes the entry path, so the Astro build exits non-zero and the log names the entry. The same module is unit-tested with Vitest on small fixture GPX files (with/without `<ele>`, outside bbox, `<rte>` only).

Alternative discarded: a `scripts/build-tracks.mjs` pre-step writing to `public/`. It duplicates the entry list, needs its own error handling and CI wiring, and produces files that must be kept out of git or regenerated; endpoints reuse the collection API and fail the same build.

### D4. Map: MapLibre GL JS with raster-dem terrain

MapLibre GL JS renders a raster base map (OpenTopoMap, `https://{a,b,c}.tile.opentopomap.org/{z}/{x}/{y}.png`, max zoom 17, CC BY-SA, attribution "© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)") and enables terrain with a `raster-dem` source from a keyless public provider. Primary: Mapterhorn (`https://tiles.mapterhorn.com/tilejson.json`, the source used by MapLibre's official 3D-terrain example). Alternative, kept as a one-line swap in a config file: AWS Terrain Tiles, Terrarium encoding, `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`. A `hillshade` layer from the same DEM is added under the tracks. Terrain exaggeration defaults to 1.2 on the overview map (mountain relief around Piateda reads better slightly exaggerated) and is user-adjustable through the standard TerrainControl.

Tracks are added as GeoJSON sources: the overview map loads `data/overview.geojson`; detail maps load their `data/<kind>/<slug>.geojson`. Styling: line colour by difficulty, dash pattern by kind, wider casing on hover; start/end markers and waypoints as symbol layers. Clicking a feature opens a side panel (React state) with the properties and a link to the detail page. The map component is one React island (`<TrackMap client:only="react">`) so MapLibre and its CSS are never server-rendered and never loaded on pages without a map.

Fallback: if `maplibregl.supported()` (or a manual WebGL context probe) is false, the island renders the unavailability message from `interactive-map`. If DEM tiles error, MapLibre logs and keeps rendering; the component listens to `error` events for the DEM source and calls `setTerrain(null)` so the map settles in 2D instead of retrying.

Why MapLibre over alternatives:
- CesiumJS: true globe and terrain, but ~3 MB of JS, needs an Ion token for the good terrain sets, and its styling model is far from what a small hobby site needs.
- Leaflet: 2D only; adding 3D would mean a second stack.
- three.js custom: building terrain streaming, tiling, and camera controls from scratch is out of proportion for the goal.
- deck.gl TerrainLayer: works, but adds a second rendering library on top of a base map and the interaction model (picking on terrain) is less mature than MapLibre's built-in terrain.

Tile providers: OpenTopoMap is chosen because it already renders contours and hillshade, which is the map hikers expect, and it is keyless. Its policy says "contact us for bigger projects"; this site is small, and the attribution requirement is met by the attribution control and the site footer. If usage grows, the swap to a keyed vector provider (MapTiler, Stadia) is a style-URL change. The OSM standard tile server was discarded as base map because its tile usage policy explicitly discourages use by third-party sites and it carries no relief.

### D5. Elevation profile as build-time SVG

The profile is an inline SVG generated at build time from the resampled profile (distance on x, elevation on y, filled area), with no charting library. Hover interaction is a small progressive-enhancement script that reads the nearest sample. Reason: it works without JavaScript, costs no dependency, and the data is already computed by the GPX module of decision D3. A live link between profile hover and map position is deferred (see Open Questions).

### D6. Client-side filters with URL state

The list page renders all non-closed entries server-side (so the unfiltered list is plain HTML) and a React island applies filters on the client from `URLSearchParams`, updating the query string with `history.replaceState`. The entry list is passed to the island as serialized props (name, kind, difficulty, municipalities, tags, length, ascent, url), which for a few hundred entries is a few tens of kilobytes.

Alternative discarded: a search library (Pagefind, Fuse.js) — over-engineered for filtering a small in-memory list.

### D7. Repository, CI and Pages

- Public repo `trails-of-piateda` on the owner's personal GitHub account. Local prerequisite: `gh auth login --hostname github.com` for that account, or configure a second SSH key; `gh` currently only knows the enterprise host.
- One workflow file with two jobs: `build` (checkout, `npm ci`, `npm test`, `npm run build`, upload Pages artifact) runs on `pull_request` and on `push` to `main`; `deploy` (`actions/deploy-pages`) runs only on `push` to `main` and needs `pages: write` and `id-token: write`. PR runs from forks use the default read-only token and need nothing else, satisfying the fork scenario in `site-publishing`.
- Astro `site` is `https://<owner>.github.io` and `base` is `/trails-of-piateda`; both come from environment variables in the workflow. No custom domain (owner decision, 2026-09-19: this is an experimental side project); if one is wanted later it is a variables change plus a `CNAME` file in `public/`.
- Branch protection on `main`: PRs required, the `build` check required. The owner can push directly if they prefer; the protection is what makes friends' contributions safe.
- Dependabot for npm updates, monthly, to keep the toolchain patched without noise.

### D8. Licensing

Code: MIT (`LICENSE`). Data (YAML + GPX): CC BY 4.0 (`LICENSE-DATA`), stated in CONTRIBUTING as accepted by opening a PR. Confirmed by the owner on 2026-09-19: the purpose of the site is to publicise the trails, so anyone may download and reuse the GPX files; the download link on every detail page carries no restriction or gating. CC BY over ODbL because it is simpler to explain to hobbyist contributors and the data set is small; over CC0 because attribution to the project and contributors is wanted.

### D9. Area-of-interest bounding box

Validation rejects points outside latitude 45.95–46.35, longitude 9.60–10.20. This covers Piateda, the Orobie ridge to the south, and the Valtellina floor from Morbegno to Tirano, so any "intra-comunale" track from Piateda's neighbours fits, while catching the common mistake of committing the wrong GPX (a track from somewhere else entirely). The bbox is a single constant with a comment; widening it is a one-line PR.

### D10. Geotagged photos stored in the entry folder

Photos live in `content/<kind>/<slug>/photos/*.jpg`. At build time a `src/lib/photos.ts` module lists the directory, enforces JPEG, ≤2 MB per file, ≤12 files, reads EXIF GPS with `exifr` (GPS-only parse, fast), applies `lat`/`lon` overrides from the optional `photos` list in the metadata, computes the nearest track point (reusing the GPX module) for the distance-along-track and the 500 m warning, and hands the files to Astro's built-in image service (`getImage`, sharp) to produce a 1600 px display image and a 400 px thumbnail. Sharp strips EXIF by default, which is the privacy property the spec requires: the site publishes the position deliberately, not the timestamp, device or other tags. The original file is not copied to `dist/`.

Rendering: the gallery is server-rendered HTML (thumbnails + `<dialog>`-based lightbox with a small script); the detail map island receives the photo list (id, lat, lon, thumbnail URL) as props and adds a symbol layer with a camera icon. Gallery and map communicate through a `CustomEvent` on `document` (`photo:select`), so the Astro component and the React island stay decoupled. The overview map does not receive photos, keeping `overview.geojson` small; it only carries a `photos` count property for the side panel.

Why in the repository: contribution stays "one folder in a PR", reviewers see the photo, EXIF is available at build time so the contributor does nothing beyond copying the file. Limits (2 MB, 12 per entry) bound the growth to about 24 MB per fully-illustrated entry; CONTRIBUTING recommends resizing to 2000 px before committing, which lands typical phone photos under 1 MB.

Alternatives discarded:
- External URLs in metadata (Flickr, Google Photos, own server): no repo growth, but link rot, no EXIF at build time (positions typed by hand), and images served from third parties with their own tracking and hotlink policies.
- Git LFS: the free plan's 1 GB/month bandwidth is consumed by every CI checkout; contributors need LFS installed; Pages builds need `lfs: true` and count against the quota.
- Object storage (R2/S3) uploaded by CI: a secret in the repo and an account to manage, against the zero-operations goal. Kept as the escape hatch if the repository grows beyond a few hundred MB.

### D11. Problem reports through a pre-filled Google Form

The detail page has a "Segnala un problema" button rendered only when `PUBLIC_REPORT_FORM_URL` is set at build time. It opens a panel (Astro component + small script) that: explains what to report and that a Google account is needed; toggles picking mode on the map island through a `report:pick` event, receiving the coordinates back through `report:point`; builds the form URL with Google Forms pre-fill parameters (`?usp=pp_url&entry.<id>=<value>`) for two fields whose ids come from `PUBLIC_REPORT_FORM_FIELD_ENTRY` and `PUBLIC_REPORT_FORM_FIELD_POSITION`; opens it in a new tab. The form itself (owned by the site owner, outside the repository) holds: entry (pre-filled), position (pre-filled), problem type (obstacle, landslide/damage, signage, other), description, photo upload, optional contact. Responses land in a Google Sheet the owner uses to forward reports to the volunteer group. `docs/report-form.md` in the repository documents the expected questions and how to read the field ids, so the form can be recreated.

Why a form over `mailto:`: the owner has a triage workflow (forward to volunteers), which a spreadsheet with timestamps and structured fields serves better than an inbox; `mailto:` fails silently on desktops without a configured mail client; no email address is published on the site. Why the file-upload question despite the Google sign-in it forces on respondents: the owner judged photos attached to a report essential and the sign-in acceptable (decision of 2026-09-19). Why a new tab instead of an embedded iframe: forms with file upload require sign-in, which is unreliable inside a third-party iframe (cookie restrictions).

Alternatives discarded:
- `mailto:` with pre-filled body: no account needed and photos attachable by the visitor, but unreliable on desktop, unstructured, address exposed to spam.
- Pre-filled GitHub issue: requires a GitHub account, which generic visitors do not have; reports would be public.
- Form services (Formspree and similar): an account and quota to manage, and files on a third party without the owner's existing Google tooling.

Reports are deliberately not read back into the site: showing them would need either a build per report or a runtime fetch of a public sheet, both out of scope by owner decision.

### D12. Visual design: plain CSS, design tokens from Open Color, mobile-first, single light theme

Owner decisions of 2026-09-19: plain CSS (no Tailwind, no component library), one light theme, layouts that follow what established trail sites do (Komoot, AllTrails, outdooractive, Wikiloc), desktop and mobile layouts differentiated where it matters.

Tokens. One file, `src/styles/tokens.css`, declares every design value as a custom property on `:root`: colour (primary, neutrals, surface, text, border, the four difficulty colours, status colours), type scale, spacing scale, radii, shadows, breakpoints as documented values. All other CSS (Astro scoped styles and a small `global.css` for reset and typography) uses only these variables; hex values elsewhere are a review error. Colour values come from Open Color (MIT), a UI palette with 13 hues in 10 steps: neutrals from its gray scale, primary from its green scale (mountain/forest connotation, distinct from the difficulty blue and red), status colours from red/yellow. Changing the palette is a change to this one file. MapLibre layer paint cannot read CSS variables, so the four difficulty colours are duplicated in `src/lib/mapConfig.ts`; a unit test parses `tokens.css` and asserts the two sets are identical.

Difficulty colours follow the convention already used by Italian trail sites and maps, borrowed from ski-slope grading: T green, E blue, EE red, EEA black. Over OpenTopoMap, which is dense with greens and browns, a green line alone is not readable: every track is drawn as a coloured line over a wider white casing line (standard cartographic technique), and the green is a saturated dark step (Open Color green 8). Badges reuse the same four colours with white or black text chosen for contrast.

Typography: system font stack (`system-ui, -apple-system, Segoe UI, Roboto, sans-serif`), no web font download. A web font would be a one-line change in the tokens; not adopted because it adds a request and a flash of unstyled text for no functional gain.

Layouts (mobile-first, breakpoint around 768 px and 1024 px):
- List: cards with cover thumbnail, difficulty badge, one stats row (length, ascent, duration when set), municipalities. Filters as a horizontal chip row on mobile, a left sidebar on desktop; search field always at the top.
- Detail, mobile: map at the top at fixed height (about 45 vh) with a fullscreen toggle; then a stats bar, description, elevation profile, gallery; a bottom action bar fixed on screen with "Scarica GPX" and "Segnala un problema".
- Detail, desktop: two columns, map sticky in the right column while the left column scrolls; the action bar becomes buttons under the title.
- Overview map: full viewport under the header; the selection panel is a bottom sheet on mobile and a side panel on desktop; legend collapsible.
- Elevation profile: full width of its column, fixed aspect ratio, labels in the token type scale.

Alternatives discarded:
- Tailwind: faster for those fluent in it, but the owner chose plain CSS; the site has five page types and a small component set, where scoped CSS with tokens is enough.
- Radix Colors: adds semantic step roles and verified contrast, more structure than needed here; Open Color values can be swapped for Radix values in the tokens file without touching components.
- Component libraries (Mantine, MUI, Pico): a runtime or a look to fight; the interactive parts are two React islands.
- Dark theme: explicitly not wanted for now. Tokens are on `:root` only; adding a theme later means one more block of variable overrides, no component change.

## Risks / Trade-offs

- [OpenTopoMap or the DEM provider changes URL, throttles, or shuts down] → Provider URLs and attribution live in one config module; the map degrades to flat/no-basemap instead of breaking the page; the README lists the swap procedure and the alternative DEM source.
- [GPX elevation quality varies (barometric vs GPS vs none); ascent figures may look wrong to hikers who know the trail] → Fixed smoothing documented in CONTRIBUTING; statistics labelled "calcolato dal GPX"; contributors may annotate a `duration_minutes` by hand but not ascent, to keep numbers comparable.
- [3D terrain on low-end phones is slow or hot] → Terrain off by default on detail pages; overview map exposes the toggle; MapLibre falls back to 2D if terrain tiles fail.
- [Repository size grows with GPX files] → GPX files are text and compress well in git; a few hundred tracks of 100–500 KB each is tens of MB, acceptable. If tracks become large (multi-day, 1 s sampling), CONTRIBUTING recommends thinning before committing. Git LFS is not used because Pages/Actions checkout of LFS objects adds friction for contributors.
- [Enterprise-only `gh` login leads to pushing to the wrong host] → Task list starts with an explicit auth step and verifies the `origin` remote host before the first push.
- [Zod errors from Astro can be verbose] → The GPX module and a small custom loader wrapper prefix every error with the entry path; the PR template tells contributors where to look in the log.
- [Repository grows with photos] → Hard limits in validation (2 MB, 12 per entry), resize advice in CONTRIBUTING, `git count-objects` size noted in the README; migration to external storage is a later change if needed.
- [Geotag is wrong or missing on phone exports (messaging apps strip EXIF)] → Manual `lat`/`lon` override in metadata; error message tells the contributor to send the original file or add coordinates; 500 m warning catches gross mistakes without blocking legitimate off-track shots.
- [Privacy of contributors] → Only position is published; all other EXIF stripped by the image pipeline; CONTRIBUTING says so and asks contributors not to add photos of identifiable people without consent.
- [Google Forms pre-fill parameter names change or the form is recreated with new field ids] → Field ids are configuration, not code; `docs/report-form.md` explains how to read them from a pre-filled link; a broken pre-fill degrades to an empty form, still usable.
- [Sign-in requirement deters some reporters] → Accepted by the owner; the panel states it up front so nobody discovers it after picking a point. Removing the upload question later removes the requirement without touching the site.
- [Reporter personal data on Google] → The form collects only what the owner needs; the panel says where the data goes; no report data ever enters the repository or the site.
- [Difficulty colours duplicated between CSS tokens and map config drift apart] → Unit test asserting equality; both files reference this decision in a comment.
- [Green (T) lines hard to see over the topographic base map] → White casing under every line; if still weak in practice, switch T to Open Color lime or teal in the tokens without changing the convention for E/EE/EEA.
- [Two collections mean duplicated schema fields] → Shared base schema object extended by each collection; acceptable duplication of two files.

## Migration Plan

Not applicable as a migration (nothing exists). Rollout order: repository and Pages workflow first with a placeholder page, so every later step is verified on the real URL; then catalog + processing; then pages; then map; then seed data and docs. Rollback of a bad deploy is `git revert` on `main`; Pages redeploys the previous state.

## Open Questions

- Neighbouring municipalities list for the `municipalities` validation (Piateda plus which names exactly). Default: accept any string but require at least one entry; a curated list can be added as an enum later without changing behaviour for valid data.
- Live hover link between elevation profile and map position: nice-to-have, deferred; does not change specs.
- Reporting a problem on a trail that is not in the catalog: not offered; a generic link to the form could be added to the "Contribuisci" page later without changing behaviour of detail pages.
- Photo formats beyond JPEG (HEIC from iPhones): out of scope; CONTRIBUTING asks for JPEG export. Could be added later with a converter step without changing behaviour for JPEG.
- Whether the owner's GPX files include `<ele>`. If most do not, a follow-up change could add build-time elevation lookup from the DEM tiles; the spec already covers the "unavailable" case.
