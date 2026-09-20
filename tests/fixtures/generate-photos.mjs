// Generates the fixture photos: the ones committed in the piateda-ambria entry and the ones
// tests/photos.test.ts copies into temporary entries.
//
//   node tests/fixtures/generate-photos.mjs
//
// Deterministic: sharp writes the same bytes for the same input, so re-running reproduces the
// committed files. The images are two flat colour bands, not photographs; what matters for the
// tests is the pixel size, the EXIF block and the JPEG magic bytes.
//
// Positions are taken from content/trails/piateda-ambria/track.gpx so the derived photos land on
// that track. The script prints the distance of each position from the nearest track point, so a
// change to the track shows up as a distance that no longer matches the intent stated here.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const AMBRIA = join(root, 'content/trails/piateda-ambria/track.gpx');

const trackPoints = [...readFileSync(AMBRIA, 'utf8').matchAll(/<trkpt lat="([\d.]+)" lon="([\d.]+)"/g)].map((m) => ({
  lat: Number(m[1]),
  lon: Number(m[2]),
}));

function haversine(a, b) {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}

const distanceFromTrack = (p) => Math.min(...trackPoints.map((t) => haversine(p, t)));

/** EXIF rationals: "d/1 m/1 s/1000", the form libvips writes into the GPS IFD. */
function dms(value) {
  const abs = Math.abs(value);
  const d = Math.floor(abs);
  const m = Math.floor((abs - d) * 60);
  const s = (abs - d - m / 60) * 3600;
  return `${d}/1 ${m}/1 ${Math.round(s * 1000)}/1000`;
}

function exifFor({ lat, lon, altitude }) {
  return {
    IFD0: { Make: 'Fixture', Model: 'Camera di prova', Software: 'generate-photos.mjs' },
    IFD2: { DateTimeOriginal: '2025:06:01 10:24:13' },
    IFD3: {
      GPSLatitudeRef: lat >= 0 ? 'N' : 'S',
      GPSLatitude: dms(lat),
      GPSLongitudeRef: lon >= 0 ? 'E' : 'W',
      GPSLongitude: dms(lon),
      GPSAltitudeRef: '0',
      GPSAltitude: `${Math.round(altitude)}/1`,
    },
  };
}

async function jpeg({ width, height, sky, ground, gps }) {
  const band = await sharp({ create: { width, height: Math.round(height / 2), channels: 3, background: ground } })
    .png()
    .toBuffer();
  let pipeline = sharp({ create: { width, height, channels: 3, background: sky } }).composite([
    { input: band, top: height - Math.round(height / 2), left: 0 },
  ]);
  if (gps) pipeline = pipeline.withExif(exifFor(gps));
  return pipeline.jpeg({ quality: 85 }).toBuffer();
}

async function write(rel, bytes) {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, bytes);
  console.log(`wrote ${rel} (${bytes.length} bytes)`);
}

function report(name, position) {
  console.log(`  ${name}: ${distanceFromTrack(position).toFixed(0)} m from the nearest track point`);
}

// --- photos of the piateda-ambria entry -------------------------------------------------------
// One without EXIF, positioned by lat/lon in trail.yaml (the cover); one geotagged and listed
// with a caption; one geotagged and not listed at all.

const partenza = { lat: 46.1611, lon: 9.9314, altitude: 331 };
const tornanti = { lat: 46.1422, lon: 9.9383, altitude: 610 };
const ambria = { lat: 46.1181, lon: 9.9454, altitude: 1010 };

await write(
  'content/trails/piateda-ambria/photos/partenza-piateda.jpg',
  await jpeg({ width: 2000, height: 1500, sky: '#8fb8de', ground: '#6b7a4e' }),
);
report('partenza-piateda.jpg (position from trail.yaml)', partenza);

await write(
  'content/trails/piateda-ambria/photos/tornanti-val-venina.jpg',
  await jpeg({ width: 1500, height: 2000, sky: '#9ec6e8', ground: '#4f6135', gps: tornanti }),
);
report('tornanti-val-venina.jpg (EXIF)', tornanti);

await write(
  'content/trails/piateda-ambria/photos/ambria.jpg',
  await jpeg({ width: 2000, height: 1500, sky: '#b6d4ef', ground: '#7d6b49', gps: ambria }),
);
report('ambria.jpg (EXIF, not listed in trail.yaml)', ambria);

// --- fixtures used by tests/photos.test.ts ----------------------------------------------------

const near = { lat: 46.1421, lon: 9.9381, altitude: 605 };
// About 900 m east of the middle of the track, well inside the area of interest: the case the
// spec wants warned about instead of rejected.
const far = { lat: 46.14, lon: 9.95, altitude: 700 };
// Milan cathedral: outside the area of interest.
const milan = { lat: 45.4642, lon: 9.19, altitude: 120 };

await write('tests/fixtures/photos/geotagged.jpg', await jpeg({ width: 1200, height: 900, sky: '#8fb8de', ground: '#6b7a4e', gps: near }));
report('geotagged.jpg', near);

await write('tests/fixtures/photos/no-gps.jpg', await jpeg({ width: 900, height: 1200, sky: '#c9d6e3', ground: '#5a6b3c' }));

await write('tests/fixtures/photos/far.jpg', await jpeg({ width: 800, height: 600, sky: '#d8c9a3', ground: '#8a7a4e', gps: far }));
report('far.jpg', far);

await write('tests/fixtures/photos/outside-area.jpg', await jpeg({ width: 800, height: 600, sky: '#e0e0e0', ground: '#909090', gps: milan }));

// A PNG carrying a .jpg name: the JPEG check must look at the bytes, not the extension.
await write(
  'tests/fixtures/photos/not-a-jpeg.jpg',
  await sharp({ create: { width: 64, height: 64, channels: 3, background: '#ff0000' } }).png().toBuffer(),
);
