/**
 * MapLibre map island (tasks 5.2, 5.3; design D4). Used as
 * `<TrackMap client:only="react" ... />` so MapLibre never runs at build time.
 *
 * Structure: the effect below creates the map once per mount and, on `load`, calls one
 * `attach*` / `add*` function per behaviour (tracks, detail markers, photo markers, report
 * picking); each returns its own teardown where it registers listeners outside the map.
 * The `map:ready` CustomEvent on `document` hands the map instance to code outside the
 * island (the fullscreen button on the detail page).
 *
 * The effect must not re-run on a state change: re-running destroys the map and rebuilds it,
 * which re-fetches the data, reloads the tiles and throws away the visitor's camera. Every
 * value in its dependency array is either a primitive prop or an array the caller keeps
 * stable; see the comment on the array itself.
 */
import { useEffect, useRef, useState } from 'react';
import {
  AttributionControl,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
  TerrainControl,
  type ErrorEvent,
  type ExpressionSpecification,
  type MapMouseEvent,
  type StyleSpecification,
} from 'maplibre-gl';
import type { FeatureCollection, Position } from 'geojson';
import { setWorkerUrl } from 'maplibre-gl';
// MapLibre resolves its worker as `new URL('./maplibre-gl-worker.mjs', import.meta.url)`
// relative to its own module. Astro bundles the library into a hashed chunk and emits no
// such sibling, so that request 404s, no worker starts, the style never finishes loading
// and the map hangs on "Caricamento". `?worker&url` makes Vite build the worker as its own
// entry, bundling the `maplibre-gl-shared` chunk it imports, and hands back a hashed,
// base-aware URL. A plain `?url` would copy the file alone and its relative import of the
// shared chunk would 404 in turn.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import './TrackMap.css';
import {
  BASEMAP_SOURCE,
  CASING_COLOR,
  CASING_WIDTH,
  CASING_WIDTH_HOVER,
  DASH_PATTERNS,
  DEFAULT_CENTER,
  DEFAULT_TERRAIN_EXAGGERATION,
  DEFAULT_ZOOM,
  DEM_SOURCE,
  DIFFICULTY_COLOR_EXPRESSION,
  DIFFICULTY_LABELS,
  KIND_LABELS,
  LAYER_IDS,
  LINE_WIDTH,
  LINE_WIDTH_HOVER,
  MAX_PITCH,
  MIN_PITCH,
  PITCH_DRAG_SPEED,
  SOURCE_IDS,
  type Difficulty,
} from '../../lib/mapConfig';
import { PHOTO_SELECT_EVENT, photoSelectEvent, type PhotoMarker, type PhotoSelectDetail } from '../gallery';
import type { ReportPickDetail, ReportPointDetail } from '../../lib/reportForm';
import { isWebGLAvailable } from './webgl';
import {
  difficultyLabel,
  formatAscentM,
  formatLengthKm,
  formatPhotoCount,
  isDifficulty,
  kindLabel,
} from './format';
import { classifyDemError, shouldDropTerrain } from './terrain';
import {
  HIT_LAYERS,
  detectPointerKind,
  hitLineWidthPx,
  queryBox,
  queryTolerancePx,
  type PointerKind,
} from './hitTest';
import { PitchControl } from './PitchControl';
import {
  collectionBounds,
  isLineFeature,
  isPointFeature,
  trackEndpoints,
  type TrackProperties,
} from './geometry';

export interface TrackMapProps {
  /** URL of a GeoJSON FeatureCollection: LineString tracks (+ Point waypoints in detail data). */
  dataUrl: string;
  /** `overview`: click opens the selection panel. `detail`: start/end/waypoint markers. */
  mode: 'overview' | 'detail';
  /** 3D terrain at start. Default: on for overview, off for detail (design D4). */
  terrain?: boolean;
  /** Terrain exaggeration; default 1.2. */
  exaggeration?: number;
  /** `data`: frame the loaded features with a margin. Otherwise centre on Piateda. */
  fit?: 'data';
  /** CSS height of the map area; default 60vh. */
  height?: string;
  /** Show the collapsible legend. Default: overview only. */
  legend?: boolean;
  /**
   * Photos of the entry, in track order. Drawn as camera markers in `detail` mode only; the
   * overview map is never given any (design D10), and passing them there would draw nothing.
   *
   * The array identity is a dependency of the map effect: a new array rebuilds the map. Pass
   * a value computed once (an island prop is), never an inline literal from a render.
   */
  photos?: readonly PhotoMarker[];
  /**
   * Answer `report:pick` from the report panel with a movable report marker and `report:point`.
   * Only the detail page sets it, and only when the form is configured, so a build without the
   * `PUBLIC_REPORT_FORM_*` variables installs no reporting listener (spec `trail-browsing`,
   * "Form not configured"). The island never reads the environment itself: it is client code,
   * and the page already decides whether the report action exists at all.
   */
  reportPicking?: boolean;
}

/** Payload of the `map:ready` event dispatched on `document` once layers are added. */
export interface TrackMapReadyDetail {
  map: MapLibreMap;
  mode: TrackMapProps['mode'];
  /** Root element of the island, so listeners can tell instances apart. */
  container: HTMLElement;
}

declare global {
  interface DocumentEventMap {
    'map:ready': CustomEvent<TrackMapReadyDetail>;
  }
}

type Status = 'loading' | 'ready' | 'unsupported';

const UNSUPPORTED_MESSAGE = 'La mappa interattiva non è disponibile su questo browser.';
const FIT_PADDING = 48;
setWorkerUrl(maplibreWorkerUrl);

const DEM_SOURCE_IDS: ReadonlySet<string> = new Set([SOURCE_IDS.terrain, SOURCE_IDS.hillshade]);

/**
 * Default of the `photos` prop. A module-level constant, not `photos = []` in the parameter
 * list: a default parameter builds a new array on every render, and the array is a dependency
 * of the map effect, so the map would be destroyed and rebuilt on every state change.
 */
const NO_PHOTOS: readonly PhotoMarker[] = Object.freeze([]);

/** Italian UI strings for MapLibre's built-in controls. */
const LOCALE: Record<string, string> = {
  'AttributionControl.ToggleAttribution': 'Mostra o nascondi le attribuzioni',
  'Marker.Title': 'Segnaposto',
  'NavigationControl.ResetBearing': 'Trascina per ruotare, clic per riportare a nord',
  'NavigationControl.ZoomIn': 'Ingrandisci',
  'NavigationControl.ZoomOut': 'Riduci',
  'Popup.Close': 'Chiudi',
  'TerrainControl.Enable': 'Attiva il terreno 3D',
  'TerrainControl.Disable': 'Disattiva il terreno 3D',
};

// --- Style -----------------------------------------------------------------------

function buildStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      [SOURCE_IDS.basemap]: { ...BASEMAP_SOURCE },
      // Two entries over the same tiles: see SOURCE_IDS in mapConfig for why.
      [SOURCE_IDS.terrain]: { ...DEM_SOURCE },
      [SOURCE_IDS.hillshade]: { ...DEM_SOURCE },
    },
    layers: [
      { id: LAYER_IDS.basemap, type: 'raster', source: SOURCE_IDS.basemap },
      {
        id: LAYER_IDS.hillshade,
        type: 'hillshade',
        source: SOURCE_IDS.hillshade,
        // OpenTopoMap already carries relief shading; keep the extra layer light.
        paint: { 'hillshade-exaggeration': 0.3 },
      },
    ],
  };
}

function toLngLat(position: Position): [number, number] {
  return [position[0] ?? 0, position[1] ?? 0];
}

// --- Degradation (task 5.3) -------------------------------------------------------------

/**
 * Settle the map in 2D when the DEM is unusable: drop terrain, hillshade and the terrain
 * toggle, so the visitor cannot re-enable a source that will fail again (spec
 * `interactive-map`, "Terrain tiles unreachable").
 *
 * This is one-way and permanent for the session, so it must not trigger on a single bad
 * tile. `classifyDemError` in ./terrain tells the two cases apart and documents what
 * MapLibre 6 reports: a tile that 404s fires no `error` at all (the parent tile is drawn
 * instead), a TileJSON failure fires an event with no `tile`, any other tile failure fires
 * one with a `tile`. Only the first, or a run of tile failures, gives the terrain up.
 */
function attachDemFailureHandler(map: MapLibreMap, terrainControl: TerrainControl): void {
  let tileFailures = 0;
  let dropped = false;
  map.on('error', (e) => {
    const event = e as ErrorEvent & { sourceId?: string; tile?: unknown };
    const failure = classifyDemError(event, DEM_SOURCE_IDS);
    if (failure === 'none') {
      // Adding a listener silences MapLibre's default console output; keep it for other errors.
      console.error(event.error ?? e);
      return;
    }
    if (dropped) return;
    if (failure === 'tile') tileFailures += 1;
    if (!shouldDropTerrain(failure, tileFailures)) {
      console.warn('[TrackMap] a terrain tile failed to load:', event.error?.message);
      return;
    }
    dropped = true;
    console.warn('[TrackMap] terrain data unavailable, rendering in 2D:', event.error?.message);
    map.setTerrain(null);
    if (map.getLayer(LAYER_IDS.hillshade)) map.removeLayer(LAYER_IDS.hillshade);
    if (map.hasControl(terrainControl)) map.removeControl(terrainControl);
  });
}

// --- Tracks --------------------------------------------------------------------------

function addTrackLayers(map: MapLibreMap, data: FeatureCollection, pointer: PointerKind): void {
  const lines: FeatureCollection = {
    type: 'FeatureCollection',
    features: data.features.filter(isLineFeature),
  };
  // generateId gives numeric ids for feature-state (hover); property ids stay untouched.
  map.addSource(SOURCE_IDS.tracks, { type: 'geojson', data: lines, generateId: true });

  const hoverWidth = (normal: number, hover: number): ExpressionSpecification => [
    'case',
    ['boolean', ['feature-state', 'hover'], false],
    hover,
    normal,
  ];
  const layout = { 'line-join': 'round', 'line-cap': 'round' } as const;

  map.addLayer({
    id: LAYER_IDS.casing,
    type: 'line',
    source: SOURCE_IDS.tracks,
    layout,
    paint: { 'line-color': CASING_COLOR, 'line-width': hoverWidth(CASING_WIDTH, CASING_WIDTH_HOVER) },
  });
  map.addLayer({
    id: LAYER_IDS.trail,
    type: 'line',
    source: SOURCE_IDS.tracks,
    filter: ['==', ['get', 'kind'], 'trail'],
    layout,
    paint: { 'line-color': DIFFICULTY_COLOR_EXPRESSION, 'line-width': hoverWidth(LINE_WIDTH, LINE_WIDTH_HOVER) },
  });
  map.addLayer({
    id: LAYER_IDS.route,
    type: 'line',
    source: SOURCE_IDS.tracks,
    filter: ['==', ['get', 'kind'], 'route'],
    layout,
    paint: {
      'line-color': DIFFICULTY_COLOR_EXPRESSION,
      'line-width': hoverWidth(LINE_WIDTH, LINE_WIDTH_HOVER),
      ...(DASH_PATTERNS.route ? { 'line-dasharray': DASH_PATTERNS.route } : {}),
    },
  });

  // Hit area (see ./hitTest). Last, so it is the topmost layer and the first the query walks;
  // `line-opacity: 0` keeps it out of everything that is drawn, and it carries no `kind`
  // filter so it covers exactly the set of features the casing draws — every track, including
  // one whose `kind` neither coloured layer matches.
  map.addLayer({
    id: LAYER_IDS.hit,
    type: 'line',
    source: SOURCE_IDS.tracks,
    layout,
    paint: { 'line-opacity': 0, 'line-width': hitLineWidthPx(pointer) },
  });
}

/**
 * Hover highlight + name tooltip; click reports the feature properties.
 *
 * Both read the same query — the hit layer of ./hitTest, over a square around the pointer —
 * so anything that highlights can be clicked and nothing selects that never highlighted. That
 * is why hover is a plain `mousemove` on the map and not the layer-scoped `mousemove` +
 * `mouseleave` pair: MapLibre queries those at the bare pointer position, which would make
 * hover the narrower of the two.
 *
 * The hover feature-state and the tooltip still key off the feature of the track source, so
 * the casing and line hover widths respond exactly as before; the hit layer only decides
 * which feature is under the pointer, never what is drawn for it.
 */
function attachTrackInteraction(
  map: MapLibreMap,
  onSelect: ((properties: TrackProperties | null) => void) | undefined,
  pointer: PointerKind,
): void {
  const tooltip = new Popup({
    closeButton: false,
    closeOnClick: false,
    offset: 12,
    className: 'track-map__tooltip',
  });
  const tolerance = queryTolerancePx(pointer);
  let hoveredId: string | number | undefined;

  const setHover = (id: string | number | undefined) => {
    if (hoveredId !== undefined) {
      map.setFeatureState({ source: SOURCE_IDS.tracks, id: hoveredId }, { hover: false });
    }
    hoveredId = id;
    if (id !== undefined) {
      map.setFeatureState({ source: SOURCE_IDS.tracks, id }, { hover: true });
    }
  };

  const trackAt = (point: { x: number; y: number }) =>
    map.queryRenderedFeatures(queryBox(point, tolerance), { layers: HIT_LAYERS })[0];

  const clearHover = () => {
    map.getCanvas().style.cursor = '';
    setHover(undefined);
    tooltip.remove();
  };

  map.on('mousemove', (e: MapMouseEvent) => {
    const feature = trackAt(e.point);
    if (!feature) {
      if (hoveredId !== undefined) clearHover();
      return;
    }
    map.getCanvas().style.cursor = 'pointer';
    if (feature.id !== hoveredId) setHover(feature.id);
    const name = typeof feature.properties?.name === 'string' ? feature.properties.name : '';
    tooltip.setLngLat(e.lngLat).setText(name).addTo(map);
  });
  // The pointer can leave the canvas without ever passing over empty map.
  map.on('mouseout', clearHover);

  if (!onSelect) return;
  map.on('click', (e) => {
    const hit = trackAt(e.point);
    onSelect(hit ? (hit.properties as TrackProperties) : null);
  });
}

// --- Markers (detail mode) --------------------------------------------------------------

function createMarkerElement(kind: 'start' | 'end' | 'waypoint', label: string): HTMLElement {
  const el = document.createElement('div');
  el.className = `track-marker track-marker--${kind}`;
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', label);
  if (kind === 'waypoint') {
    const text = document.createElement('span');
    text.className = 'track-marker__label';
    text.textContent = label;
    el.append(text);
  }
  return el;
}

function addDetailMarkers(map: MapLibreMap, data: FeatureCollection, sink: Marker[]): void {
  const ends = trackEndpoints(data.features.filter(isLineFeature));
  if (ends) {
    sink.push(
      new Marker({ element: createMarkerElement('start', 'Partenza') })
        .setLngLat(toLngLat(ends.start))
        .addTo(map),
      new Marker({ element: createMarkerElement('end', 'Arrivo') })
        .setLngLat(toLngLat(ends.end))
        .addTo(map),
    );
  }
  for (const waypoint of data.features.filter(isPointFeature)) {
    const name = typeof waypoint.properties?.name === 'string' ? waypoint.properties.name : 'Punto';
    sink.push(
      new Marker({ element: createMarkerElement('waypoint', name), anchor: 'bottom' })
        .setLngLat(toLngLat(waypoint.geometry.coordinates))
        .addTo(map),
    );
  }
}

// --- Photo markers (detail mode, task 6.5) -----------------------------------------------

function createPhotoMarkerElement(photo: PhotoMarker, index: number): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'track-marker track-marker--photo';
  el.dataset.photoId = photo.id;
  // The caption is the only description of the photo the visitor has before opening it.
  el.setAttribute('aria-label', photo.caption ? `Foto: ${photo.caption}` : `Foto ${index + 1}`);

  const thumb = document.createElement('img');
  thumb.className = 'track-marker__thumb';
  thumb.src = photo.thumb;
  thumb.alt = '';
  thumb.loading = 'lazy';

  // Camera badge (CSS only) so the marker reads as a photo and not as a waypoint.
  const camera = document.createElement('span');
  camera.className = 'track-marker__camera';
  camera.setAttribute('aria-hidden', 'true');

  el.append(thumb, camera);
  return el;
}

/**
 * Id carried by a `photo:select` event, or null for "nothing is selected".
 *
 * `PhotoSelectDetail.id` is still declared `string` in src/components/gallery.ts. The clear
 * signal needs it to be `string | null`, which is that module's change to make; until then the
 * value is read through this widening, which also absorbs an event dispatched with no detail.
 */
function selectedPhotoId(detail: PhotoSelectDetail | undefined): string | null {
  const id = (detail as { id?: string | null } | undefined)?.id;
  return typeof id === 'string' && id !== '' ? id : null;
}

/**
 * One marker per photo, plus both halves of the `photo:select` contract (design D10).
 *
 * Map → gallery: a marker click focuses its own button and then dispatches
 * `{ id, source: 'map' }`. The focus call is what lets the gallery restore focus afterwards:
 * it captures `document.activeElement` when it opens or updates the lightbox, and a click does
 * not focus a button in every browser (Safari does not), so without it the opener would be
 * whatever had focus before — the previous marker, or nothing at all when the lightbox was
 * already open.
 *
 * Gallery → map: `{ id, source: 'gallery' }` highlights the marker of that photo, and
 * `{ id: null, source: 'gallery' }` clears the highlight. The gallery dispatches the second
 * one when the lightbox closes; without it a marker would stay highlighted over a closed
 * lightbox. An id that matches no marker also clears, since nothing here is selected then.
 *
 * Returns the listener teardown.
 */
function addPhotoMarkers(map: MapLibreMap, photos: readonly PhotoMarker[], sink: Marker[]): () => void {
  const elements = new Map<string, HTMLElement>();

  const highlight = (id: string | null) => {
    for (const [photoId, el] of elements) el.classList.toggle('track-marker--selected', photoId === id);
  };

  photos.forEach((photo, index) => {
    const element = createPhotoMarkerElement(photo, index);
    element.addEventListener('click', (event) => {
      // Without this the map click handler would also run and clear the track selection.
      event.stopPropagation();
      highlight(photo.id);
      element.focus();
      document.dispatchEvent(photoSelectEvent({ id: photo.id, source: 'map' }));
    });
    elements.set(photo.id, element);
    sink.push(new Marker({ element }).setLngLat([photo.lon, photo.lat]).addTo(map));
  });

  const onSelect = (event: CustomEvent<PhotoSelectDetail>) => {
    // Our own click already highlighted the marker; reacting here would be the return leg of
    // a gallery ↔ map loop.
    if (event.detail?.source === 'map') return;
    const photo = photos.find((p) => p.id === selectedPhotoId(event.detail));
    if (!photo) {
      highlight(null);
      return;
    }
    highlight(photo.id);
    // Pan only when the marker is off screen, so selecting a visible photo does not move the map.
    if (!map.getBounds().contains([photo.lon, photo.lat])) map.panTo([photo.lon, photo.lat]);
  };
  document.addEventListener(PHOTO_SELECT_EVENT, onSelect);
  return () => document.removeEventListener(PHOTO_SELECT_EVENT, onSelect);
}

// --- Report picking (task 7.3) ----------------------------------------------------------

/**
 * Point picking for the problem-report panel. The panel switches the mode with `report:pick`
 * and this island answers every click with `report:point`; the two events travel in opposite
 * directions and neither side listens to the one it sends, so they cannot feed each other.
 *
 * A single marker is kept and moved, never duplicated, and it is removed when picking is
 * switched off (a cancel) so the panel and the map never disagree on what is being reported.
 * `e.lngLat` is the ground position under the cursor, which MapLibre resolves against the
 * terrain mesh when terrain is on, so picking works in 2D and in 3D alike.
 */
function attachReportPicking(map: MapLibreMap): () => void {
  let active = false;
  let marker: Marker | null = null;

  const element = () => {
    const el = document.createElement('div');
    el.className = 'track-marker track-marker--report';
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', 'Punto della segnalazione');
    return el;
  };

  // Same four decimals the panel displays and sends (COORDINATE_DECIMALS in lib/reportForm).
  const round = (value: number) => Math.round(value * 1e4) / 1e4;

  const onClick = (e: { lngLat: { lat: number; lng: number } }) => {
    if (!active) return;
    const lat = round(e.lngLat.lat);
    const lon = round(e.lngLat.lng);
    if (marker) marker.setLngLat([lon, lat]);
    else marker = new Marker({ element: element() }).setLngLat([lon, lat]).addTo(map);
    document.dispatchEvent(new CustomEvent<ReportPointDetail>('report:point', { detail: { lat, lon } }));
  };

  // Registered after the track interaction, so it has the last word on the cursor: the hover
  // handler would otherwise leave a pointer cursor behind while picking.
  const onMouseMove = () => {
    if (active) map.getCanvas().style.cursor = 'crosshair';
  };

  const onPick = (e: CustomEvent<ReportPickDetail>) => {
    active = e.detail.active;
    map.getCanvas().style.cursor = active ? 'crosshair' : '';
    if (!active) {
      marker?.remove();
      marker = null;
    }
  };

  map.on('click', onClick);
  map.on('mousemove', onMouseMove);
  document.addEventListener('report:pick', onPick);

  return () => {
    document.removeEventListener('report:pick', onPick);
    marker?.remove();
    marker = null;
  };
}

// --- Component --------------------------------------------------------------------------

export default function TrackMap({
  dataUrl,
  mode,
  terrain,
  exaggeration = DEFAULT_TERRAIN_EXAGGERATION,
  fit,
  height = '60vh',
  legend,
  photos = NO_PHOTOS,
  reportPicking = false,
}: TrackMapProps) {
  const terrainEnabled = terrain ?? mode === 'overview';
  const showLegend = legend ?? mode === 'overview';
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [dataError, setDataError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TrackProperties | null>(null);
  // Legend open by default only where there is room for it.
  const [legendOpen] = useState(() => window.matchMedia('(min-width: 768px)').matches);

  useEffect(() => {
    if (!isWebGLAvailable()) {
      setStatus('unsupported');
      return;
    }
    const container = canvasRef.current;
    const root = rootRef.current;
    if (!container || !root) return;

    let cancelled = false;
    let map: MapLibreMap | null = null;
    // Read once: the hit-area width is baked into the layer, and a device that gains a mouse
    // mid-session is not worth rebuilding the map for.
    const pointer = detectPointerKind();
    const markers: Marker[] = [];
    let detachReportPicking: (() => void) | null = null;
    let detachPhotos: (() => void) | null = null;

    const start = async () => {
      // Fetch before creating the map so the first tiles requested are the framed ones.
      let data: FeatureCollection = { type: 'FeatureCollection', features: [] };
      try {
        const response = await fetch(dataUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        data = (await response.json()) as FeatureCollection;
      } catch (err) {
        console.error('[TrackMap] cannot load track data:', err);
        if (!cancelled) setDataError('Impossibile caricare le tracce.');
      }
      if (cancelled) return;

      const bounds = fit === 'data' ? collectionBounds(data) : null;
      const created = new MapLibreMap({
        container,
        style: buildStyle(),
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        minPitch: MIN_PITCH,
        maxPitch: MAX_PITCH,
        // Reverses MapLibre's drag direction; see PITCH_DRAG_SPEED in lib/mapConfig.
        pitchSpeed: PITCH_DRAG_SPEED,
        attributionControl: false,
        locale: LOCALE,
        ...(bounds ? { bounds, fitBoundsOptions: { padding: FIT_PADDING } } : {}),
      });
      map = created;

      created.addControl(new AttributionControl({ compact: false }), 'bottom-right');
      created.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
      // Between the compass and the terrain toggle: the three are what move or reshape the
      // camera, and the pitch buttons are the only way to tilt that needs no modifier key.
      created.addControl(new PitchControl(), 'top-right');
      const terrainControl = new TerrainControl({ source: SOURCE_IDS.terrain, exaggeration });
      created.addControl(terrainControl, 'top-right');
      attachDemFailureHandler(created, terrainControl);

      created.on('load', () => {
        if (cancelled) return;
        if (terrainEnabled) created.setTerrain({ source: SOURCE_IDS.terrain, exaggeration });
        addTrackLayers(created, data, pointer);
        attachTrackInteraction(created, mode === 'overview' ? setSelected : undefined, pointer);
        if (mode === 'detail') addDetailMarkers(created, data, markers);
        // Only where the page says the report form is configured: with no panel to talk to,
        // the listener and its marker would be behaviour reachable by a stray `report:pick`.
        if (mode === 'detail' && reportPicking) detachReportPicking = attachReportPicking(created);
        // Photo markers are a detail-page feature; the overview is given no photo data at all.
        if (mode === 'detail' && photos.length > 0) detachPhotos = addPhotoMarkers(created, photos, markers);
        setStatus('ready');
        document.dispatchEvent(
          new CustomEvent<TrackMapReadyDetail>('map:ready', {
            detail: { map: created, mode, container: root },
          }),
        );
      });
    };
    void start();

    return () => {
      cancelled = true;
      detachReportPicking?.();
      detachPhotos?.();
      markers.forEach((m) => m.remove());
      map?.remove();
    };
    // Everything here rebuilds the map from scratch, so the list must hold only values that
    // are stable across renders: the props are primitives except `photos`, whose identity the
    // caller keeps (the default is the frozen NO_PHOTOS, not a fresh literal). `setSelected`
    // and `setStatus` are React setters, stable by contract, and are deliberately not listed.
  }, [dataUrl, mode, terrainEnabled, exaggeration, fit, photos, reportPicking]);

  /*
   * No effect resizes the map when the selection panel opens or closes. On desktop the panel
   * is a flex sibling that takes width from `.track-map__canvas`, which is the element given
   * to MapLibre, and MapLibre 6 observes its container: `Map._setupResizeObserver`
   * (node_modules/maplibre-gl/src/ui/map.ts) attaches a ResizeObserver whose callback calls
   * `resize()` and `redraw()` while `trackResize` is true, which is the default. The callback
   * is throttled at 50 ms on the trailing edge only after a first immediate call, so the first
   * change of the container box is handled in the same frame, before paint — earlier than a
   * React effect could. On mobile the panel is absolutely positioned and the canvas box does
   * not change at all.
   */

  if (status === 'unsupported') {
    return (
      <div className="track-map track-map--unsupported" style={{ height }} role="status">
        <p>{UNSUPPORTED_MESSAGE}</p>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={`track-map track-map--${mode}${selected ? ' track-map--has-panel' : ''}`}
      style={{ height }}
    >
      <div className="track-map__canvas" ref={canvasRef} />
      {status === 'loading' && (
        <p className="track-map__status" role="status">
          Caricamento della mappa…
        </p>
      )}
      {dataError && (
        <p className="track-map__status track-map__status--error" role="alert">
          {dataError}
        </p>
      )}
      {showLegend && <Legend defaultOpen={legendOpen} />}
      {selected && <SelectionPanel track={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

// --- Legend and panel ------------------------------------------------------------------

function Legend({ defaultOpen }: { defaultOpen: boolean }) {
  return (
    <details className="track-map__legend" open={defaultOpen}>
      <summary>Legenda</summary>
      <ul>
        {(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map((d) => (
          <li key={d}>
            <span className="track-map__swatch" data-difficulty={d} aria-hidden="true" />
            <strong>{d}</strong> {DIFFICULTY_LABELS[d]}
          </li>
        ))}
        <li>
          <span className="track-map__swatch track-map__swatch--trail" aria-hidden="true" />
          {KIND_LABELS.trail} (linea continua)
        </li>
        <li>
          <span className="track-map__swatch track-map__swatch--route" aria-hidden="true" />
          {KIND_LABELS.route} (linea tratteggiata)
        </li>
      </ul>
    </details>
  );
}

function SelectionPanel({ track, onClose }: { track: TrackProperties; onClose: () => void }) {
  const difficulty = isDifficulty(track.difficulty) ? track.difficulty : undefined;
  // The overview data carries the count of the entry's photos and nothing else about them
  // (design D10); it is what tells the visitor whether the detail page is worth a look.
  const photoCount = formatPhotoCount(track.photos);
  return (
    <aside className="track-map__panel" aria-label="Traccia selezionata">
      <button type="button" className="track-map__close" onClick={onClose} aria-label="Chiudi il pannello">
        ×
      </button>
      <p className="track-map__kind">{kindLabel(track.kind)}</p>
      <h2 className="track-map__title">{track.name}</h2>
      {difficulty && (
        <p>
          <span className="badge-difficulty" data-difficulty={difficulty}>
            {difficulty}
          </span>{' '}
          <span className="track-map__muted">{difficultyLabel(difficulty)}</span>
        </p>
      )}
      <dl className="track-map__stats">
        <div>
          <dt>Lunghezza</dt>
          <dd>{formatLengthKm(track.length_m)}</dd>
        </div>
        <div>
          <dt>Dislivello in salita</dt>
          <dd>{formatAscentM(track.ascent_m)}</dd>
        </div>
      </dl>
      {photoCount && <p className="track-map__photos">{photoCount}</p>}
      {track.url && (
        <a className="track-map__cta" href={track.url}>
          Apri la scheda
        </a>
      )}
    </aside>
  );
}
