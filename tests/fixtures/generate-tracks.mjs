// Generates the synthetic track.gpx files of the fixture entries under content/.
// Deterministic (seeded PRNG) so re-running it reproduces the committed files byte for byte.
//
//   node tests/fixtures/generate-tracks.mjs
//
// The tracks are plausible for the area (Piateda village at about 46.16 N 9.93 E, 330 m;
// Ambria up Val Venina at about 1000 m) but are not real recordings. They exist so the
// build, the endpoints and the tests have data until the owner adds the real GPX files.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fmt = (n, digits) => n.toFixed(digits);

function gpx({ name, points, waypoints = [], withEle = true }) {
  const wpts = waypoints
    .map((w) => `  <wpt lat="${fmt(w.lat, 6)}" lon="${fmt(w.lon, 6)}">\n    <name>${w.name}</name>\n  </wpt>`)
    .join('\n');
  const trkpts = points
    .map((p) => {
      const ele = withEle ? `<ele>${fmt(p.ele, 1)}</ele>` : '';
      return `      <trkpt lat="${fmt(p.lat, 6)}" lon="${fmt(p.lon, 6)}">${ele}</trkpt>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="trails-of-piateda fixtures" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${name}</name>
  </metadata>
${wpts ? wpts + '\n' : ''}  <trk>
    <name>${name}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`;
}

// A path from `from` to `to` with sinusoidal wiggle (switchbacks) and noisy elevation.
function path({ from, to, n, wiggle, rand, eleNoise = 2 }) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const s = Math.sin(t * Math.PI * wiggle.cycles) * wiggle.amp;
    pts.push({
      lon: from.lon + (to.lon - from.lon) * t + s + (rand() - 0.5) * 0.00002,
      lat: from.lat + (to.lat - from.lat) * t + (rand() - 0.5) * 0.00002,
      // Elevation follows an eased ramp with noise so ascent/descent are not trivially exact.
      ele: from.ele + (to.ele - from.ele) * (0.5 - 0.5 * Math.cos(t * Math.PI)) + (rand() - 0.5) * eleNoise,
    });
  }
  return pts;
}

function loop({ centre, rLon, rLat, n, rand }) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    const r = 1 + 0.15 * Math.sin(3 * a);
    pts.push({
      lon: centre.lon + rLon * r * Math.cos(a) + (rand() - 0.5) * 0.00002,
      lat: centre.lat + rLat * r * Math.sin(a) + (rand() - 0.5) * 0.00002,
      ele: centre.ele + 180 * Math.sin(a) + 40 * Math.sin(3 * a) + (rand() - 0.5) * 2,
    });
  }
  pts.push({ ...pts[0] }); // close the loop exactly
  return pts;
}

function write(rel, text) {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  console.log(`wrote ${rel}`);
}

{
  const rand = mulberry32(1);
  write(
    'content/trails/piateda-ambria/track.gpx',
    gpx({
      name: 'Piateda - Ambria',
      points: path({
        from: { lon: 9.9312, lat: 46.1612, ele: 330 },
        to: { lon: 9.9455, lat: 46.118, ele: 1010 },
        n: 420,
        wiggle: { cycles: 14, amp: 0.0012 },
        rand,
      }),
      waypoints: [
        { name: 'Piateda', lat: 46.1612, lon: 9.9312 },
        { name: 'Ambria', lat: 46.118, lon: 9.9455 },
      ],
    }),
  );
}

{
  const rand = mulberry32(2);
  write(
    'content/trails/sentiero-senza-quota/track.gpx',
    gpx({
      name: 'Sentiero senza quota',
      withEle: false,
      points: path({
        from: { lon: 9.95, lat: 46.17, ele: 0 },
        to: { lon: 9.972, lat: 46.182, ele: 0 },
        n: 200,
        wiggle: { cycles: 6, amp: 0.0006 },
        rand,
      }),
    }),
  );
}

{
  const rand = mulberry32(3);
  write(
    'content/routes/anello-piateda-alta/track.gpx',
    gpx({
      name: 'Anello di Piateda Alta',
      points: loop({ centre: { lon: 9.94, lat: 46.152, ele: 650 }, rLon: 0.012, rLat: 0.008, n: 600, rand }),
    }),
  );
}

{
  const rand = mulberry32(4);
  write(
    'content/routes/percorso-chiuso/track.gpx',
    gpx({
      name: 'Percorso chiuso',
      points: path({
        from: { lon: 9.9, lat: 46.17, ele: 400 },
        to: { lon: 9.92, lat: 46.2, ele: 900 },
        n: 300,
        wiggle: { cycles: 8, amp: 0.0008 },
        rand,
      }),
    }),
  );
}
