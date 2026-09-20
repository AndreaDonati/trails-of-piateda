/**
 * WebGL availability probe. `maplibregl.supported()` was removed in v3, so
 * we create a throwaway canvas: MapLibre 6 needs WebGL 2 or falls back to 1.
 * Kept separate from the component so it can be stubbed in tests.
 */
export function isWebGLAvailable(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    return gl !== null;
  } catch {
    return false;
  }
}
