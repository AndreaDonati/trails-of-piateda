import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import exifr from 'exifr';
import sharp from 'sharp';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { trailSchema } from '../src/content.config';
import { loadTrack, type TrackPoint } from '../src/lib/gpx';
import {
  fitDimensions,
  loadPhotos,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS_PER_ENTRY,
  photoId,
  photoVariantUrl,
  renderPhotoVariant,
  VARIANTS,
  type DerivedPhoto,
  type PhotoMetadata,
} from '../src/lib/photos';

const AMBRIA_DIR = 'content/trails/piateda-ambria';
const fixture = (name: string) => `tests/fixtures/photos/${name}`;
const BASE = '/trails-of-piateda/';

let points: readonly TrackPoint[];
beforeAll(() => {
  points = loadTrack(`${AMBRIA_DIR}/track.gpx`).points;
});

/**
 * Builds a throwaway entry directory with the given files in photos/. Temporary rather than
 * committed because the cases that need a file over 2 MB or thirteen photos would add megabytes
 * to the repository for nothing.
 */
function makeEntry(files: Record<string, string | Buffer>): { dir: string; slug: string } {
  const root = mkdtempSync(join(tmpdir(), 'photos-'));
  const slug = 'entry-di-prova';
  const dir = join(root, 'content', 'trails', slug);
  mkdirSync(join(dir, 'photos'), { recursive: true });
  for (const [name, source] of Object.entries(files)) {
    const target = join(dir, 'photos', name);
    if (typeof source === 'string') copyFileSync(source, target);
    else writeFileSync(target, source);
  }
  return { dir, slug };
}

function load(
  entry: { dir: string; slug: string },
  metadata: PhotoMetadata[] = [],
  cover?: string,
): Promise<DerivedPhoto[]> {
  return loadPhotos({ dir: entry.dir, slug: entry.slug, photos: metadata, cover, points, base: BASE });
}

afterEach(() => vi.restoreAllMocks());

describe('photo metadata schema', () => {
  const validTrail = {
    name: 'Piateda - Ambria',
    summary: 'Salita ad Ambria.',
    difficulty: 'E',
    municipalities: ['Piateda'],
    start: { name: 'Piateda' },
  };
  const messages = (data: unknown) => {
    const r = trailSchema.safeParse(data);
    return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  };

  it('accepts a photos list and a cover, and defaults photos to an empty list', () => {
    const r = trailSchema.safeParse({
      ...validTrail,
      cover: 'cima.jpg',
      photos: [{ file: 'cima.jpg', caption: 'In vetta', lat: 46.16, lon: 9.93, author: 'Tizio' }],
    });
    expect(r.success, messages({ ...validTrail, cover: 'cima.jpg' }).join('\n')).toBe(true);
    expect(trailSchema.safeParse(validTrail).data?.photos).toEqual([]);
  });

  // Astro prefixes a schema failure with the entry id ("**trails → piateda-ambria** data does
  // not match collection schema"); these assertions cover the part of the message this project
  // writes. The checks that need the entry directory (cover, missing file) live in photos.ts and
  // are asserted below with the entry id in the message.
  it('rejects an unknown field inside a photo and names it', () => {
    expect(messages({ ...validTrail, photos: [{ file: 'cima.jpg', autore: 'Tizio' }] }).join('\n')).toContain('autore');
  });

  it('rejects a caption longer than 200 characters', () => {
    expect(messages({ ...validTrail, photos: [{ file: 'a.jpg', caption: 'x'.repeat(201) }] })[0]).toMatch(
      /^photos\.0\.caption: .*200/,
    );
  });

  it('requires lat and lon together', () => {
    expect(messages({ ...validTrail, photos: [{ file: 'a.jpg', lat: 46.16 }] })[0]).toMatch(/^photos\.0: .*lat.*lon/);
  });
});

describe('positioning', () => {
  it('exposes a geotagged photo that is not listed in the metadata, with no warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const entry = makeEntry({ 'cima.jpg': fixture('geotagged.jpg') });
    const [photo] = await load(entry);
    expect(photo?.positionSource).toBe('exif');
    expect(photo?.lat).toBeCloseTo(46.1421, 4);
    expect(photo?.lon).toBeCloseTo(9.9381, 4);
    expect(photo?.caption).toBeNull();
    expect(photo?.distanceFromTrack_m).toBeLessThan(50);
    expect(warn).not.toHaveBeenCalled();
  });

  it('prefers the metadata position over the EXIF one', async () => {
    const entry = makeEntry({ 'cima.jpg': fixture('geotagged.jpg') });
    const [photo] = await load(entry, [{ file: 'cima.jpg', lat: 46.1181, lon: 9.9454 }]);
    expect(photo?.positionSource).toBe('metadata');
    expect(photo?.lat).toBe(46.1181);
    expect(photo?.lon).toBe(9.9454);
  });

  it('fails when a photo has neither EXIF GPS nor lat/lon, explaining how to provide it', async () => {
    const entry = makeEntry({ 'rifugio.jpg': fixture('no-gps.jpg') });
    await expect(load(entry)).rejects.toThrow(
      /entry-di-prova\/photos\/rifugio\.jpg: has no EXIF GPS position; add it to the photos list of .*entry-di-prova with lat\/lon/,
    );
  });

  it('fails when the position is outside the area of interest', async () => {
    const entry = makeEntry({ 'duomo.jpg': fixture('outside-area.jpg') });
    await expect(load(entry)).rejects.toThrow(
      /entry-di-prova\/photos\/duomo\.jpg: position lat 45\.4642\d*, lon 9\.19 \(from exif\) is outside the area of interest \(lat 45\.95–46\.35, lon 9\.60–10\.20\)/,
    );
  });

  it('warns, without failing, for a photo farther than 500 m from the track', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const entry = makeEntry({ 'lontana.jpg': fixture('far.jpg') });
    const [photo] = await load(entry);
    expect(photo?.distanceFromTrack_m).toBeGreaterThan(500);
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain('entry-di-prova');
    expect(message).toContain('lontana.jpg');
    expect(message).toMatch(/\b8\d\d m\b/);
    expect(message).toContain('more than 500 m');
  });

  it('sorts the photos by distance along the track', async () => {
    const entry = makeEntry({
      'c.jpg': fixture('geotagged.jpg'),
      'a.jpg': fixture('geotagged.jpg'),
      'b.jpg': fixture('geotagged.jpg'),
    });
    const photos = await load(entry, [
      { file: 'a.jpg', lat: 46.1181, lon: 9.9454 },
      { file: 'b.jpg', lat: 46.1611, lon: 9.9314 },
    ]);
    // b is at the start, c (EXIF) in the middle, a at the end.
    expect(photos.map((p) => p.id)).toEqual(['b', 'c', 'a']);
    const distances = photos.map((p) => p.distanceAlongTrack_m);
    expect(distances[0]).toBeLessThan(distances[1] as number);
    expect(distances[1]).toBeLessThan(distances[2] as number);
    expect(distances[2]).toBeGreaterThan(4000);
  });
});

describe('file limits', () => {
  it('rejects a file that is not a JPEG, whatever its extension says', async () => {
    const entry = makeEntry({ 'finta.jpg': fixture('not-a-jpeg.jpg') });
    await expect(load(entry)).rejects.toThrow(
      /entry-di-prova\/photos\/finta\.jpg: is not a JPEG file .*export it as JPEG/,
    );
  });

  it('rejects a file over 2 MB, naming its size and the limit', async () => {
    // Random pixels at quality 100: flat colours would compress far below the limit.
    const noise = Buffer.alloc(2400 * 1800 * 3);
    for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761) % 251;
    const big = await sharp(noise, { raw: { width: 2400, height: 1800, channels: 3 } })
      .jpeg({ quality: 100 })
      .toBuffer();
    expect(big.length).toBeGreaterThan(MAX_PHOTO_BYTES);
    const entry = makeEntry({ 'grande.jpg': big });
    await expect(load(entry)).rejects.toThrow(
      new RegExp(
        `entry-di-prova/photos/grande\\.jpg: is \\d+\\.\\d\\d MB \\(${big.length} bytes\\), over the limit of 2\\.00 MB \\(${MAX_PHOTO_BYTES} bytes\\)`,
      ),
    );
  });

  it('rejects more than 12 photos in one entry', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < MAX_PHOTOS_PER_ENTRY + 1; i++) files[`foto-${i}.jpg`] = fixture('geotagged.jpg');
    const entry = makeEntry(files);
    await expect(load(entry)).rejects.toThrow(
      /entry-di-prova: 13 photos in .*photos\/, at most 12 are allowed per entry/,
    );
  });
});

describe('metadata consistency', () => {
  it('fails when the metadata lists a file that is not on disk, naming the entry and the file', async () => {
    const entry = makeEntry({ 'cima.jpg': fixture('geotagged.jpg') });
    await expect(load(entry, [{ file: 'mancante.jpg' }])).rejects.toThrow(
      /entry-di-prova\/photos\/mancante\.jpg: listed in the photos of .*entry-di-prova but not present on disk \(files in .*: cima\.jpg\)/,
    );
  });

  it('fails when cover names a file that is not among the photos, naming the entry and the file', async () => {
    const entry = makeEntry({ 'cima.jpg': fixture('geotagged.jpg') });
    await expect(load(entry, [{ file: 'cima.jpg' }], 'copertina.jpg')).rejects.toThrow(
      /entry-di-prova: cover "copertina\.jpg" is not a photo of this entry \(files in .*photos\/: cima\.jpg\)/,
    );
  });

  it('accepts a cover that exists in photos/ without being listed in the metadata', async () => {
    const entry = makeEntry({ 'cima.jpg': fixture('geotagged.jpg') });
    const [photo] = await load(entry, [], 'cima.jpg');
    expect(photo?.isCover).toBe(true);
  });

  it('rejects two files whose identifiers would collide', async () => {
    const entry = makeEntry({ 'in cima.jpg': fixture('geotagged.jpg'), 'in-cima.jpg': fixture('geotagged.jpg') });
    await expect(load(entry)).rejects.toThrow(/has the same identifier "in-cima" as /);
  });

  it('builds URL-safe identifiers from the file names', () => {
    expect(photoId('Cima Vignone.JPG')).toBe('cima-vignone');
    expect(photoId('località-è.jpeg')).toBe('localita-e');
  });
});

describe('derived images', () => {
  it('scales the long side to 1600 and 400 pixels and keeps the aspect ratio', async () => {
    const entry = makeEntry({ 'cima.jpg': fixture('geotagged.jpg') });
    const [photo] = await load(entry);
    expect(photo?.display).toMatchObject({ width: 1200, height: 900 });
    expect(photo?.thumb).toMatchObject({ width: 400, height: 300 });
    expect(fitDimensions(4000, 3000, VARIANTS.display)).toEqual({ width: 1600, height: 1200 });
    expect(fitDimensions(4000, 3000, VARIANTS.thumb)).toEqual({ width: 400, height: 300 });
    // Never enlarged: a photo smaller than the bound is served as it is.
    expect(fitDimensions(300, 200, VARIANTS.display)).toEqual({ width: 300, height: 200 });
  });

  it('builds base-path aware URLs, one per variant', async () => {
    const entry = makeEntry({ 'cima.jpg': fixture('geotagged.jpg') });
    const [photo] = await load(entry);
    expect(photo?.display.url).toBe('/trails-of-piateda/photos/entry-di-prova/display/cima.jpg');
    expect(photo?.thumb.url).toBe('/trails-of-piateda/photos/entry-di-prova/thumb/cima.jpg');
    expect(photoVariantUrl('x', 'thumb', 'y', '/')).toBe('/photos/x/thumb/y.jpg');
  });

  it('produces bytes without EXIF, at the announced size', async () => {
    // Control: the source does carry GPS, a camera model and a date.
    const source = readFileSync(fixture('geotagged.jpg'));
    const sourceTags = (await exifr.parse(source, true)) as Record<string, unknown>;
    expect(sourceTags).toMatchObject({ Make: 'Fixture', Model: 'Camera di prova' });
    expect(sourceTags.DateTimeOriginal).toBeDefined();
    expect(await exifr.gps(source)).toMatchObject({ latitude: expect.any(Number) });

    const entry = makeEntry({ 'cima.jpg': fixture('geotagged.jpg') });
    const [photo] = await load(entry);
    for (const variant of ['display', 'thumb'] as const) {
      const bytes = Buffer.from(await renderPhotoVariant(photo as DerivedPhoto, variant));
      expect(await exifr.gps(bytes)).toBeUndefined();
      expect(await exifr.parse(bytes, true)).toBeUndefined();
      const meta = await sharp(bytes).metadata();
      expect(meta.format).toBe('jpeg');
      expect({ width: meta.width, height: meta.height }).toEqual({
        width: photo?.[variant].width,
        height: photo?.[variant].height,
      });
      expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(VARIANTS[variant]);
    }
  });

  it('applies the EXIF orientation and reports the resulting dimensions', async () => {
    // withMetadata is the only sharp API that writes the Orientation tag; withExif normalises it
    // back to 1. The fixture is stored 1200x900 with orientation 6, i.e. upright it is 900x1200.
    const rotated = await sharp(readFileSync(fixture('geotagged.jpg')))
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const entry = makeEntry({ 'ruotata.jpg': rotated });
    const [photo] = await load(entry, [{ file: 'ruotata.jpg', lat: 46.16, lon: 9.93 }]);
    expect(photo?.display).toMatchObject({ width: 900, height: 1200 });
    const meta = await sharp(Buffer.from(await renderPhotoVariant(photo as DerivedPhoto, 'thumb'))).metadata();
    expect({ width: meta.width, height: meta.height }).toEqual({ width: photo?.thumb.width, height: photo?.thumb.height });
  });
});

describe('memoisation', () => {
  it('returns the same list for the same unchanged entry and a new one after a change', async () => {
    const entry = makeEntry({ 'cima.jpg': fixture('geotagged.jpg') });
    const first = await load(entry);
    expect(await load(entry)).toBe(first);
    copyFileSync(fixture('far.jpg'), join(entry.dir, 'photos', 'cima.jpg'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await load(entry)).not.toBe(first);
  });

  it('reports a failure again instead of caching the rejection', async () => {
    const entry = makeEntry({ 'rifugio.jpg': fixture('no-gps.jpg') });
    await expect(load(entry)).rejects.toThrow(/no EXIF GPS position/);
    await expect(load(entry)).rejects.toThrow(/no EXIF GPS position/);
  });
});

describe('the piateda-ambria fixture entry', () => {
  it('exposes its three photos in track order, with captions, author and cover', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const photos = await loadPhotos({
      dir: AMBRIA_DIR,
      slug: 'piateda-ambria',
      photos: [
        { file: 'partenza-piateda.jpg', caption: 'Partenza dalla piazza della chiesa.', lat: 46.1611, lon: 9.9314, author: 'Fixture' },
        { file: 'tornanti-val-venina.jpg', caption: 'I tornanti sopra la Val Venina.', author: 'Fixture' },
      ],
      cover: 'partenza-piateda.jpg',
      points,
      base: BASE,
    });

    expect(photos.map((p) => p.file)).toEqual([
      'partenza-piateda.jpg',
      'tornanti-val-venina.jpg',
      'ambria.jpg',
    ]);
    expect(photos.map((p) => p.positionSource)).toEqual(['metadata', 'exif', 'exif']);
    expect(photos.map((p) => p.isCover)).toEqual([true, false, false]);
    expect(photos[2]?.caption).toBeNull();
    expect(photos.every((p) => p.distanceFromTrack_m < 50)).toBe(true);
    expect(photos[0]?.display.url).toBe('/trails-of-piateda/photos/piateda-ambria/display/partenza-piateda.jpg');
    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps every committed photo within the limits', () => {
    for (const file of readdirSync(join(AMBRIA_DIR, 'photos'))) {
      expect(statSync(join(AMBRIA_DIR, 'photos', file)).size).toBeLessThanOrEqual(MAX_PHOTO_BYTES);
    }
  });
});

/**
 * Only the derived images may be published. This reads the build output, so it needs a build to
 * have run: `npm test` on a fresh checkout skips it, `npm run build && npm test` does not.
 */
describe('the build output', () => {
  const distExists = existsSync('dist');

  it.skipIf(!distExists)('contains no original photo file', () => {
    const originals = new Map<string, string>();
    for (const kind of ['trails', 'routes']) {
      const kindDir = join('content', kind);
      if (!existsSync(kindDir)) continue;
      for (const slug of readdirSync(kindDir)) {
        const photosDir = join(kindDir, slug, 'photos');
        if (!existsSync(photosDir)) continue;
        for (const file of readdirSync(photosDir)) {
          const path = join(photosDir, file);
          originals.set(createHash('sha256').update(readFileSync(path)).digest('hex'), path);
        }
      }
    }
    expect(originals.size).toBeGreaterThan(0);

    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      );
    const published = walk('dist');
    expect(published.length).toBeGreaterThan(0);
    for (const file of published) {
      const digest = createHash('sha256').update(readFileSync(file)).digest('hex');
      expect(originals.get(digest), `${file} is a copy of ${originals.get(digest)}`).toBeUndefined();
    }
    // The derived images are there, under their own route.
    const derived = published.filter((f) => f.startsWith(join('dist', 'photos')));
    expect(derived.length).toBe(originals.size * 2);
    expect(derived.every((f) => basename(f).endsWith('.jpg'))).toBe(true);
  });
});
