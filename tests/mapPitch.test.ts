import { describe, expect, it } from 'vitest';
import { MAX_PITCH, MIN_PITCH, PITCH_DRAG_SPEED, PITCH_STEP } from '../src/lib/mapConfig';
import {
  PITCH_EPSILON,
  PITCH_STRAIGHTEN_LABEL,
  PITCH_TILT_LABEL,
  pitchStepsAvailable,
  steppedPitch,
} from '../src/components/map/PitchControl';

describe('PITCH_DRAG_SPEED', () => {
  it('is positive, which is the reverse of MapLibre’s -0.5 default', () => {
    // The whole point of the constant: flipping this sign flips the drag direction back.
    expect(PITCH_DRAG_SPEED).toBeGreaterThan(0);
  });

  it('keeps MapLibre’s magnitude, so only the direction was a decision', () => {
    expect(Math.abs(PITCH_DRAG_SPEED)).toBe(0.5);
  });
});

describe('pitch range', () => {
  it('crosses the range in a handful of presses', () => {
    const presses = (MAX_PITCH - MIN_PITCH) / PITCH_STEP;
    expect(presses).toBeGreaterThanOrEqual(3);
    expect(presses).toBeLessThanOrEqual(8);
  });
});

describe('steppedPitch', () => {
  it('adds the step inside the range', () => {
    expect(steppedPitch(30, PITCH_STEP)).toBe(45);
    expect(steppedPitch(30, -PITCH_STEP)).toBe(15);
  });

  it('clamps to the top of the range instead of overshooting', () => {
    expect(steppedPitch(MAX_PITCH - 5, PITCH_STEP)).toBe(MAX_PITCH);
    expect(steppedPitch(MAX_PITCH, PITCH_STEP)).toBe(MAX_PITCH);
  });

  it('clamps to the bottom of the range', () => {
    expect(steppedPitch(5, -PITCH_STEP)).toBe(MIN_PITCH);
    expect(steppedPitch(MIN_PITCH, -PITCH_STEP)).toBe(MIN_PITCH);
  });
});

describe('pitchStepsAvailable', () => {
  it('offers both directions in the middle of the range', () => {
    expect(pitchStepsAvailable(30)).toEqual({ tilt: true, straighten: true });
  });

  it('offers only tilting at the flat end', () => {
    expect(pitchStepsAvailable(MIN_PITCH)).toEqual({ tilt: true, straighten: false });
  });

  it('offers only straightening at the tilted end', () => {
    expect(pitchStepsAvailable(MAX_PITCH)).toEqual({ tilt: false, straighten: true });
  });

  it('treats a sub-degree remainder left by a drag as the end of the range', () => {
    // A drag settles on values like 69.87; a button enabled there would move nothing visible.
    expect(pitchStepsAvailable(MAX_PITCH - PITCH_EPSILON / 2).tilt).toBe(false);
    expect(pitchStepsAvailable(MIN_PITCH + PITCH_EPSILON / 2).straighten).toBe(false);
  });

  it('still offers a step just outside that remainder', () => {
    expect(pitchStepsAvailable(MAX_PITCH - PITCH_EPSILON * 2).tilt).toBe(true);
    expect(pitchStepsAvailable(MIN_PITCH + PITCH_EPSILON * 2).straighten).toBe(true);
  });
});

describe('button names', () => {
  it('are in Italian and name the two directions', () => {
    expect(PITCH_TILT_LABEL).toBe('Inclina la mappa');
    expect(PITCH_STRAIGHTEN_LABEL).toBe('Raddrizza la mappa');
  });
});
