/**
 * Area of interest for every coordinate the catalog accepts (design D9).
 *
 * The box covers Piateda, the Orobie ridge to the south and the Valtellina
 * floor from Morbegno to Tirano, so any track from Piateda or a neighbouring
 * municipality fits. Its job is not geographic precision: it catches the
 * common contributor mistake of committing a GPX recorded somewhere else.
 * Widening it is a one-line change here; nothing else encodes the limits.
 */
export const AREA_OF_INTEREST = {
  minLat: 45.95,
  maxLat: 46.35,
  minLon: 9.6,
  maxLon: 10.2,
} as const;

export function isInsideArea(lon: number, lat: number): boolean {
  return (
    lat >= AREA_OF_INTEREST.minLat &&
    lat <= AREA_OF_INTEREST.maxLat &&
    lon >= AREA_OF_INTEREST.minLon &&
    lon <= AREA_OF_INTEREST.maxLon
  );
}

/** Human-readable form used in validation messages. */
export function describeArea(): string {
  const a = AREA_OF_INTEREST;
  return `lat ${a.minLat.toFixed(2)}–${a.maxLat.toFixed(2)}, lon ${a.minLon.toFixed(2)}–${a.maxLon.toFixed(2)}`;
}
