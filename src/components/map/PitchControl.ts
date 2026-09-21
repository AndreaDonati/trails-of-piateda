/**
 * Two buttons that step the camera pitch, as a MapLibre `IControl` so they stack with the
 * zoom, compass and terrain controls.
 *
 * Why a control and not only the drag gesture: MapLibre reaches pitch and bearing through
 * `checkCorrectEvent` in node_modules/maplibre-gl/src/ui/handler/mouse.ts, which gates the
 * rotate handler on `(button === 0 && ctrlKey) || (button === 2 && !ctrlKey)`. On macOS
 * ctrl+click is the system secondary click, so Chrome reports `button === 2` *with*
 * `ctrlKey === true`: the pitch handler accepts it (its second branch is `button === 2`, with
 * no `ctrlKey` test) but the rotate handler does not, so the same gesture tilts without
 * rotating while a plain two-finger click-drag does both. There is no public option for that
 * gating — `pitchWithRotate`, `rotateSpeed` and `pitchSpeed` change behaviour, not which
 * events are accepted — and patching the handler is not an option, so tilting is given a
 * control that needs no modifier key at all. The drag gesture keeps working unchanged.
 *
 * The buttons are steppers, not a toggle, so they carry no `aria-pressed`: their state is
 * whether a step is still possible, which is `disabled` plus `aria-disabled` at each end of
 * the range. The pair is wrapped in a labelled `role="group"` so a screen reader announces
 * what the two buttons belong to.
 */
import type { IControl, Map as MapLibreMap } from 'maplibre-gl';
import { MAX_PITCH, MIN_PITCH, PITCH_STEP } from '../../lib/mapConfig';

export const PITCH_GROUP_LABEL = 'Inclinazione della mappa';
export const PITCH_TILT_LABEL = 'Inclina la mappa';
export const PITCH_STRAIGHTEN_LABEL = 'Raddrizza la mappa';

/** Long enough to read as a camera move, short enough not to queue up under repeated clicks. */
export const PITCH_EASE_MS = 250;

/**
 * Degrees below which a remaining step is treated as no step at all. A drag leaves the pitch
 * at values like 69.87, where a button that looks enabled would move the camera by an amount
 * nobody can see.
 */
export const PITCH_EPSILON = 0.5;

/** Where a step from `pitch` lands, clamped to the range the map allows. */
export function steppedPitch(
  pitch: number,
  step: number,
  min: number = MIN_PITCH,
  max: number = MAX_PITCH,
): number {
  return Math.min(max, Math.max(min, pitch + step));
}

/** Which of the two buttons can still move the camera at `pitch`. */
export function pitchStepsAvailable(
  pitch: number,
  min: number = MIN_PITCH,
  max: number = MAX_PITCH,
): { tilt: boolean; straighten: boolean } {
  return {
    tilt: pitch < max - PITCH_EPSILON,
    straighten: pitch > min + PITCH_EPSILON,
  };
}

/**
 * Icons, inline so they take `currentColor` and follow the token colour of the control.
 * A ground plane seen in perspective for "tilt", the same plane seen from above for
 * "straighten"; the accessible name carries the meaning, the shape only distinguishes them.
 */
const TILT_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M9 7h6l5 11H4z"/></svg>';
const STRAIGHTEN_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="4.5" y="6.5" width="15" height="11" rx="1"/></svg>';

export class PitchControl implements IControl {
  private map: MapLibreMap | null = null;
  private container: HTMLDivElement | null = null;
  private tiltButton: HTMLButtonElement | null = null;
  private straightenButton: HTMLButtonElement | null = null;
  /**
   * Pitch the running `easeTo` is heading for, or null when no step of ours is in flight.
   * A second click during the ease must step from there and not from `getPitch()`, which is
   * mid-animation: stepping from the live value swallows clicks (15, 30, 45, 60, 60, 70 for
   * six presses of the same button). Cleared on `pitchend`, which fires both when the ease
   * finishes and when a drag interrupts it, so a later drag is always read from the map.
   */
  private target: number | null = null;

  // A bound field, not a method, so `off` removes the same reference `on` added.
  private readonly sync = (): void => {
    if (!this.map) return;
    const available = pitchStepsAvailable(this.target ?? this.map.getPitch());
    setEnabled(this.tiltButton, available.tilt);
    setEnabled(this.straightenButton, available.straighten);
  };

  private readonly onPitchEnd = (): void => {
    this.target = null;
    this.sync();
  };

  onAdd(map: MapLibreMap): HTMLElement {
    this.map = map;

    const container = document.createElement('div');
    // The two MapLibre classes are what put the control in the stack and give it the shared
    // card look; the third is ours, for the icon layout only.
    container.className = 'maplibregl-ctrl maplibregl-ctrl-group track-map__pitch';
    container.setAttribute('role', 'group');
    container.setAttribute('aria-label', PITCH_GROUP_LABEL);

    this.tiltButton = this.createButton(PITCH_TILT_LABEL, TILT_ICON, PITCH_STEP);
    this.straightenButton = this.createButton(PITCH_STRAIGHTEN_LABEL, STRAIGHTEN_ICON, -PITCH_STEP);
    container.append(this.tiltButton, this.straightenButton);

    // `pitch` fires during the ease and during a drag, `pitchend` closes both; together they
    // keep the disabled state honest whichever way the camera moved.
    map.on('pitch', this.sync);
    map.on('pitchend', this.onPitchEnd);
    this.sync();

    this.container = container;
    return container;
  }

  onRemove(): void {
    this.map?.off('pitch', this.sync);
    this.map?.off('pitchend', this.onPitchEnd);
    this.container?.remove();
    this.container = null;
    this.tiltButton = null;
    this.straightenButton = null;
    this.map = null;
  }

  private createButton(label: string, icon: string, step: number): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', label);
    button.title = label;

    // `maplibregl-ctrl-icon` is the class MapLibre's own stylesheet dims when the button is
    // disabled, so reusing it keeps the disabled look identical to the zoom buttons.
    const iconSpan = document.createElement('span');
    iconSpan.className = 'maplibregl-ctrl-icon track-map__pitch-icon';
    iconSpan.setAttribute('aria-hidden', 'true');
    // Static markup defined in this module; nothing from the page reaches it.
    iconSpan.innerHTML = icon;
    button.append(iconSpan);

    button.addEventListener('click', () => {
      const map = this.map;
      if (!map) return;
      const from = this.target ?? map.getPitch();
      const to = steppedPitch(from, step);
      if (to === from) return;
      this.target = to;
      this.sync();
      map.easeTo({ pitch: to, duration: PITCH_EASE_MS });
    });
    return button;
  }
}

function setEnabled(button: HTMLButtonElement | null, enabled: boolean): void {
  if (!button) return;
  button.disabled = !enabled;
  // `disabled` is what actually blocks the click and drops the button out of the tab order.
  // `aria-disabled` is set alongside it because the state is also what a screen reader user
  // needs when arrowing through the control group, where a skipped button is just missing.
  button.setAttribute('aria-disabled', String(!enabled));
}
