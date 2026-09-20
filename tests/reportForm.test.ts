/**
 * Pre-fill URL construction for the problem-report form (task 7.2, design D11).
 * The shape asserted here is the one docs/report-form.md tells the owner to expect.
 */
import { describe, expect, it } from 'vitest';
import {
  buildReportUrl,
  formatPoint,
  readReportFormConfig,
  type ReportFormConfig,
  type ReportTarget,
} from '../src/lib/reportForm';

const config: ReportFormConfig = {
  url: 'https://docs.google.com/forms/d/e/TEST/viewform',
  entryField: '111',
  positionField: '222',
};

const target: ReportTarget = {
  name: 'Piateda – Ambria',
  url: 'https://andreadonati.github.io/trails-of-piateda/sentieri/piateda-ambria/',
  start: { lat: 46.16, lon: 9.9 },
};

const params = (url: string) => new URL(url).searchParams;

describe('formatPoint', () => {
  it('formats both coordinates with four decimals', () => {
    expect(formatPoint({ lat: 46.1612, lon: 9.9375 })).toBe('46.1612, 9.9375');
    expect(formatPoint({ lat: 46.1, lon: 9 })).toBe('46.1000, 9.0000');
  });
});

describe('buildReportUrl', () => {
  it('pre-fills the entry name, the absolute entry URL and the picked point', () => {
    const url = buildReportUrl(config, target, { lat: 46.1612, lon: 9.9375 });
    expect(url).not.toBeNull();

    const search = params(url as string);
    expect(search.get('usp')).toBe('pp_url');
    expect(search.get('entry.111')).toBe(`${target.name} — ${target.url}`);
    expect(search.get('entry.222')).toBe('46.1612, 9.9375');
  });

  it('keeps the form URL and percent-encodes the values in the query string', () => {
    const url = buildReportUrl(config, target, { lat: 46.1612, lon: 9.9375 }) as string;

    expect(url.startsWith('https://docs.google.com/forms/d/e/TEST/viewform?usp=pp_url&')).toBe(true);
    // Google Forms pre-fill syntax: application/x-www-form-urlencoded values.
    expect(url).toContain('entry.111=Piateda+%E2%80%93+Ambria');
    expect(url).toContain(encodeURIComponent(target.url).replace(/%20/g, '+'));
    expect(url).toContain('entry.222=46.1612%2C+9.9375');
  });

  it('falls back to the first track point when no point was picked', () => {
    for (const point of [undefined, null]) {
      const search = params(buildReportUrl(config, target, point) as string);
      expect(search.get('entry.222')).toBe('46.1600, 9.9000');
      expect(search.get('entry.111')).toBe(`${target.name} — ${target.url}`);
    }
  });

  it('accepts a field id written either as the bare number or as the whole parameter name', () => {
    const prefixed = buildReportUrl({ ...config, entryField: 'entry.111', positionField: 'entry.222' }, target);
    expect(prefixed).toBe(buildReportUrl(config, target));
  });

  it('returns null when reporting is not configured, so the caller renders nothing', () => {
    expect(buildReportUrl(null, target, { lat: 46.1612, lon: 9.9375 })).toBeNull();
  });
});

describe('readReportFormConfig', () => {
  const full = {
    PUBLIC_REPORT_FORM_URL: config.url,
    PUBLIC_REPORT_FORM_FIELD_ENTRY: '111',
    PUBLIC_REPORT_FORM_FIELD_POSITION: '222',
  };

  it('reads the three variables', () => {
    expect(readReportFormConfig(full)).toEqual(config);
  });

  it('returns null when nothing is set', () => {
    expect(readReportFormConfig({})).toBeNull();
    expect(
      readReportFormConfig({
        PUBLIC_REPORT_FORM_URL: '',
        PUBLIC_REPORT_FORM_FIELD_ENTRY: '',
        PUBLIC_REPORT_FORM_FIELD_POSITION: '',
      }),
    ).toBeNull();
  });

  it('returns null when a variable is missing or the URL is not parseable', () => {
    for (const key of Object.keys(full)) {
      expect(readReportFormConfig({ ...full, [key]: '' })).toBeNull();
    }
    expect(readReportFormConfig({ ...full, PUBLIC_REPORT_FORM_URL: 'not a url' })).toBeNull();
  });
});
