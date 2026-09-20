/**
 * MapLibre map island (tasks 5.2, 5.3; design D4). Used as
 * `<TrackMap client:only="react" ... />` so MapLibre never runs at build time.
 *
 * Extension points for later features (photo markers, report picking): the
 * `map:ready` CustomEvent on `document` hands out the map instance, and the
 * marker / popup / interaction code lives in the small functions below so new
 * behaviour is added as another function rather than by editing the effect.
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
  type MapLayerMouseEvent,
  type StyleSpecification,
} from 'maplibre-gl';
import type { FeatureCollection, Position } from 'geojson';
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
  SOURCE_IDS,
  type Difficulty,
} from '../../lib/mapConfig';
import { isWebGLAvailable } from './webgl';
import { difficultyLabel, formatAscentM, formatLengthKm, isDifficulty, kindLabel } from './format';
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
const INTERACTIVE_LAYERS: string[] = [LAYER_IDS.trail, LAYER_IDS.route];

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
 * Once the DEM source fails (TileJSON unreachable, network error on tiles),
 * settle the map in 2D: drop terrain, hillshade and the terrain toggle so the
 * user cannot re-enable a source that will fail again. MapLibre does not fire
 * `error` for 404 tiles, so this only reacts to real outages.
 */
function attachDemFailureHandler(map: MapLibreMap, terrainControl: TerrainControl): void {
  const demSources = new Set<string>([SOURCE_IDS.terrain, SOURCE_IDS.hillshade]);
  let handled = false;
  map.on('error', (e) => {
    const { sourceId, error } = e as ErrorEvent & { sourceId?: string };
    if (!sourceId || !demSources.has(sourceId)) {
      // Adding a listener silences MapLibre's default console output; keep it for other errors.
      console.error(error ?? e);
      return;
    }
    if (handled) return;
    handled = true;
    console.warn('[TrackMap] terrain data unavailable, rendering in 2D:', error?.message);
    map.setTerrain(null);
    if (map.getLayer(LAYER_IDS.hillshade)) map.removeLayer(LAYER_IDS.hillshade);
    if (map.hasControl(terrainControl)) map.removeControl(terrainControl);
  });
}

// --- Tracks --------------------------------------------------------------------------

function addTrackLayers(map: MapLibreMap, data: FeatureCollection): void {
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
}

/** Hover highlight + name tooltip on both track layers; click reports the feature properties. */
function attachTrackInteraction(
  map: MapLibreMap,
  onSelect: ((properties: TrackProperties | null) => void) | undefined,
): void {
  const tooltip = new Popup({
    closeButton: false,
    closeOnClick: false,
    offset: 12,
    className: 'track-map__tooltip',
  });
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

  map.on('mousemove', INTERACTIVE_LAYERS, (e: MapLayerMouseEvent) => {
    const feature = e.features?.[0];
    if (!feature) return;
    map.getCanvas().style.cursor = 'pointer';
    if (feature.id !== hoveredId) setHover(feature.id);
    const name = typeof feature.properties?.name === 'string' ? feature.properties.name : '';
    tooltip.setLngLat(e.lngLat).setText(name).addTo(map);
  });
  map.on('mouseleave', INTERACTIVE_LAYERS, () => {
    map.getCanvas().style.cursor = '';
    setHover(undefined);
    tooltip.remove();
  });

  if (!onSelect) return;
  map.on('click', (e) => {
    const hit = map.queryRenderedFeatures(e.point, { layers: INTERACTIVE_LAYERS })[0];
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

// --- Component --------------------------------------------------------------------------

export default function TrackMap({
  dataUrl,
  mode,
  terrain,
  exaggeration = DEFAULT_TERRAIN_EXAGGERATION,
  fit,
  height = '60vh',
  legend,
}: TrackMapProps) {
  const terrainEnabled = terrain ?? mode === 'overview';
  const showLegend = legend ?? mode === 'overview';
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
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
    const markers: Marker[] = [];

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
        maxPitch: 70,
        attributionControl: false,
        locale: LOCALE,
        ...(bounds ? { bounds, fitBoundsOptions: { padding: FIT_PADDING } } : {}),
      });
      map = created;
      mapRef.current = created;

      created.addControl(new AttributionControl({ compact: false }), 'bottom-right');
      created.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
      const terrainControl = new TerrainControl({ source: SOURCE_IDS.terrain, exaggeration });
      created.addControl(terrainControl, 'top-right');
      attachDemFailureHandler(created, terrainControl);

      created.on('load', () => {
        if (cancelled) return;
        if (terrainEnabled) created.setTerrain({ source: SOURCE_IDS.terrain, exaggeration });
        addTrackLayers(created, data);
        attachTrackInteraction(created, mode === 'overview' ? setSelected : undefined);
        if (mode === 'detail') addDetailMarkers(created, data, markers);
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
      markers.forEach((m) => m.remove());
      map?.remove();
      mapRef.current = null;
    };
  }, [dataUrl, mode, terrainEnabled, exaggeration, fit]);

  // The side panel takes width from the map on desktop; MapLibre only watches window resizes.
  useEffect(() => {
    mapRef.current?.resize();
  }, [selected]);

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
      {track.url && (
        <a className="track-map__cta" href={track.url}>
          Apri la scheda
        </a>
      )}
    </aside>
  );
}
