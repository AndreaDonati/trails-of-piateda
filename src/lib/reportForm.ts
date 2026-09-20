/**
 * Problem-report form: configuration and pre-fill URL construction (design D11, task 7.1).
 *
 * The site never receives a report. It only builds the URL of a Google Form owned by the
 * site owner, with two questions pre-filled through Google's `usp=pp_url` parameters; see
 * docs/report-form.md for the form itself and for how the field ids are read.
 *
 * Everything here is pure except `readReportFormConfig`, which is the single place that
 * touches the environment, so the URL construction can be unit tested without a build.
 */

export interface ReportFormConfig {
  /** Form URL, the one ending in `/viewform`. */
  url: string;
  /** Pre-fill field id of the "Sentiero o percorso" question. */
  entryField: string;
  /** Pre-fill field id of the "Posizione (lat, lon)" question. */
  positionField: string;
}

export interface ReportPoint {
  lat: number;
  lon: number;
}

export interface ReportTarget {
  /** Entry name, as shown on the detail page. */
  name: string;
  /** Absolute URL of the detail page: the owner must be able to open it from the spreadsheet. */
  url: string;
  /** First point of the track, used when the visitor picks no point on the map. */
  start: ReportPoint;
}

/** Detail of `report:pick`, sent by the panel to switch picking mode on the detail map. */
export interface ReportPickDetail {
  active: boolean;
}

/** Detail of `report:point`, sent by the map island for every click while picking is active. */
export interface ReportPointDetail {
  lat: number;
  lon: number;
}

declare global {
  interface DocumentEventMap {
    'report:pick': CustomEvent<ReportPickDetail>;
    'report:point': CustomEvent<ReportPointDetail>;
  }
}

/** Id of the panel element, shared by the action button (aria-controls) and the panel itself. */
export const REPORT_PANEL_ID = 'segnalazione';

/**
 * Decimal places of the reported position. Four is about 11 m, finer than the accuracy of a
 * point tapped on a map at trail zoom, and it keeps the value readable in the spreadsheet.
 */
export const COORDINATE_DECIMALS = 4;

/** `46.1612, 9.9375` — the format the form's "Posizione (lat, lon)" question expects. */
export function formatPoint(point: ReportPoint): string {
  return `${point.lat.toFixed(COORDINATE_DECIMALS)}, ${point.lon.toFixed(COORDINATE_DECIMALS)}`;
}

/**
 * `entry.123` from either `123` or `entry.123`. docs/report-form.md tells the owner to copy
 * the number that follows `entry.` in the pre-filled link, but copying the whole parameter
 * name is the obvious slip and costs nothing to absorb.
 */
function fieldName(id: string): string {
  const trimmed = id.trim();
  return trimmed.startsWith('entry.') ? trimmed : `entry.${trimmed}`;
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

type Env = Record<string, unknown>;

let warned = false;

/**
 * The three build-time variables, or null when reporting is not configured: any missing value
 * or an unparseable URL disables the feature entirely, so a half-set configuration never
 * produces a button leading to a broken form.
 */
export function readReportFormConfig(env: Env = import.meta.env as unknown as Env): ReportFormConfig | null {
  const read = (key: string): string => (typeof env[key] === 'string' ? (env[key] as string).trim() : '');
  const url = read('PUBLIC_REPORT_FORM_URL');
  const entryField = read('PUBLIC_REPORT_FORM_FIELD_ENTRY');
  const positionField = read('PUBLIC_REPORT_FORM_FIELD_POSITION');

  if (!url && !entryField && !positionField) return null;
  if (!url || !entryField || !positionField || !parseUrl(url)) {
    // Once per build: with hundreds of entries this would otherwise repeat per page.
    if (!warned) {
      warned = true;
      console.warn(
        '[reportForm] incomplete configuration: PUBLIC_REPORT_FORM_URL (parseable), ' +
          'PUBLIC_REPORT_FORM_FIELD_ENTRY and PUBLIC_REPORT_FORM_FIELD_POSITION must all be set. ' +
          'The report action is omitted from the detail pages.',
      );
    }
    return null;
  }
  return { url, entryField, positionField };
}

/**
 * Pre-filled form URL, or null when reporting is not configured (the caller then renders
 * nothing). `point` is the position picked on the map; without one the track start is sent.
 */
export function buildReportUrl(
  config: ReportFormConfig | null,
  target: ReportTarget,
  point?: ReportPoint | null,
): string | null {
  if (!config) return null;
  const url = parseUrl(config.url);
  if (!url) return null;

  // `usp=pp_url` is what marks the query string as a Google Forms pre-fill.
  url.searchParams.set('usp', 'pp_url');
  url.searchParams.set(fieldName(config.entryField), `${target.name} — ${target.url}`);
  url.searchParams.set(fieldName(config.positionField), formatPoint(point ?? target.start));
  return url.toString();
}
