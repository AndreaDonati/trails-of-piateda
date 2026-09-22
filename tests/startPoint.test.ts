import { describe, expect, it } from 'vitest';
import { resolveStartPoint } from '../src/components/startPoint';
import { formatCoordinates } from '../src/components/format';
import { startMarkerPosition } from '../src/components/map/geometry';
import type { Position } from 'geojson';

describe('resolveStartPoint', () => {
  const points = [
    { lat: 46.1595, lon: 9.9401 },
    { lat: 46.16, lon: 9.941 },
  ];

  it('prefers the declared coordinates over the track', () => {
    // A trailhead is allowed to sit away from the first recorded point (a car park).
    expect(resolveStartPoint({ lat: 46.1612, lon: 9.9375 }, points)).toEqual({
      lat: 46.1612,
      lon: 9.9375,
      source: 'metadata',
    });
  });

  it('falls back to the track first point when the metadata declares none', () => {
    expect(resolveStartPoint({}, points)).toEqual({ lat: 46.1595, lon: 9.9401, source: 'track' });
  });

  it('falls back to the track when only one half of the pair is declared', () => {
    // The schema refuses this; the guard exists for a value arriving from anywhere else.
    expect(resolveStartPoint({ lat: 46.1612 }, points)?.source).toBe('track');
  });

  it('returns null when neither source has coordinates', () => {
    expect(resolveStartPoint({}, [])).toBeNull();
    expect(resolveStartPoint(undefined, undefined)).toBeNull();
  });

  it('treats a non-finite value as absent', () => {
    expect(resolveStartPoint({ lat: Number.NaN, lon: 9.9375 }, [])).toBeNull();
  });
});

describe('formatCoordinates', () => {
  it('rounds to four decimals and uses the Italian decimal comma', () => {
    expect(formatCoordinates(46.16115, 9.9375)).toEqual({ lat: '46,1612', lon: '9,9375' });
  });

  it('pads to four decimals so the two numbers line up', () => {
    expect(formatCoordinates(46, -9.5)).toEqual({ lat: '46,0000', lon: '-9,5000' });
  });

  it('returns the two numbers apart, never as one string', () => {
    // Joined, a screen reader reads them as a single number; the page has to separate them.
    expect(formatCoordinates(46.1612, 9.9375)).toEqual({ lat: '46,1612', lon: '9,9375' });
    expect(Object.keys(formatCoordinates(46.1612, 9.9375))).toEqual(['lat', 'lon']);
  });
});

describe('startMarkerPosition', () => {
  // First point of a GPX recorded at the bridge; the declared start is the church car park,
  // about 200 m north-east of it.
  const ends = (): { start: Position; end: Position } => ({
    start: [9.9401, 46.1595],
    end: [9.9502, 46.1701],
  });
  const declared: [number, number] = [9.9424, 46.1608];

  it('puts the marker on the declared point when the page resolved one', () => {
    expect(startMarkerPosition(declared, ends())).toEqual(declared);
  });

  it('keeps the track first point when no start point is passed', () => {
    expect(startMarkerPosition(null, ends())).toEqual([9.9401, 46.1595]);
    expect(startMarkerPosition(undefined, ends())).toEqual([9.9401, 46.1595]);
  });

  it('still marks the declared point when the collection has no line at all', () => {
    expect(startMarkerPosition(declared, null)).toEqual(declared);
    expect(startMarkerPosition(null, null)).toBeNull();
  });
});
