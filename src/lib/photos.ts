/**
 * Geotagged entry photos: validation, positioning and derived images (design D10).
 *
 * Exported API:
 * - loadPhotos(input)                  – validate content/<kind>/<slug>/photos/ against the entry
 *                                        metadata and the track, returning the derived photo list
 *                                        sorted by distance along the track (memoised per entry)
 * - renderPhotoVariant(photo, variant) – JPEG bytes of the display or thumbnail image, for the
 *                                        /photos/ endpoint
 * - photoVariantUrl(...)               – base-path aware URL of one derived image
 * - fitDimensions(w, h, maxPx)         – long-side scaling used for both variants
 * - photoId(file)                      – URL-safe identifier derived from the file name
 * - PhotoError, and the limits: MAX_PHOTOS_PER_ENTRY, MAX_PHOTO_BYTES, FAR_FROM_TRACK_M, VARIANTS
 *
 * Error messages are prefixed with the path of the offending file (or of the entry directory for
 * entry-level problems), so a failed build names the entry and the file the contributor must fix.
 *
 * Why the derived images are produced by a static endpoint driven by sharp, and not by Astro's
 * image service (`getImage`): the image service works on `ImageMetadata`, which only exists for
 * files Vite has resolved as modules — that is, files under `src/`, or files referenced through
 * the content collection `image()` helper. The photos live under `content/` and, per the spec,
 * a photo does NOT have to be listed in the metadata file, so there is nothing to attach an
 * `image()` schema field to. Driving sharp ourselves also gives two properties the spec asks for
 * and the image service does not guarantee: the original bytes are never emitted into `dist/`
 * (an unprocessed Vite image import is copied verbatim into `_astro/`), and the output carries no
 * EXIF, because sharp only keeps metadata when `withMetadata()`/`withExif()` is called and we
 * never call them.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { describeArea, isInsideArea } from './area';
import { haversineMeters, type TrackPoint } from './gpx';

/** Hard limits from the spec; also documented in CONTRIBUTING. */
export const MAX_PHOTOS_PER_ENTRY = 12;
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

/** Beyond this distance from the nearest track point a photo is only warned about, never rejected. */
export const FAR_FROM_TRACK_M = 500;

/** Longest side, in pixels, of each derived image. */
export const VARIANTS = { display: 1600, thumb: 400 } as const;
export type Variant = keyof typeof VARIANTS;
export const VARIANT_NAMES = Object.keys(VARIANTS) as Variant[];

/** Subdirectory of an entry that holds the photos. */
export const PHOTOS_DIR = 'photos';

/**
 * JPEG quality of the derived images. 82 is the usual compromise between visible artefacts and
 * size for photographic content; the source files are already lossy, so going higher mostly
 * re-encodes the existing artefacts at a larger size.
 */
const JPEG_QUALITY = 82;

/** JPEG SOI + first marker. Checked instead of the extension: a renamed PNG or HEIC is common. */
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

export class PhotoError extends Error {
  constructor(label: string, detail: string) {
    super(`${label}: ${detail}`);
    this.name = 'PhotoError';
  }
}

/** One item of the optional `photos` list in the entry metadata. */
export interface PhotoMetadata {
  file: string;
  caption?: string | undefined;
  lat?: number | undefined;
  lon?: number | undefined;
  author?: string | undefined;
}

export interface DerivedImage {
  /** Site URL, base path included. */
  url: string;
  width: number;
  height: number;
}

export interface DerivedPhoto {
  /** URL-safe identifier, unique within the entry; used as the file name of the derived images. */
  id: string;
  /** File name inside photos/, as committed. */
  file: string;
  /** Source path relative to the project root; the endpoint reads it, pages must not publish it. */
  path: string;
  caption: string | null;
  author: string | null;
  lat: number;
  lon: number;
  /** Where the position came from; metadata wins over EXIF when both are present. */
  positionSource: 'exif' | 'metadata';
  /** Distance from the start of the track of the nearest track point, metres. */
  distanceAlongTrack_m: number;
  /** Distance to that nearest track point, metres. */
  distanceFromTrack_m: number;
  /** True for the photo named by `cover` in the metadata. */
  isCover: boolean;
  display: DerivedImage;
  thumb: DerivedImage;
}

export interface LoadPhotosInput {
  /** Entry directory relative to the project root, e.g. `content/trails/piateda-ambria`. */
  dir: string;
  /** Entry slug; the derived image URLs are built from it. */
  slug: string;
  /** The `photos` list from the metadata file (may be empty). */
  photos: readonly PhotoMetadata[];
  /** The `cover` field from the metadata file. */
  cover?: string | undefined;
  /** Track points of the entry, from `loadTrack`. */
  points: readonly TrackPoint[];
  /** Site base path; defaults to the build-time `base`. */
  base?: string;
}

/**
 * Base-path aware URL of one derived image. The route is `/photos/<slug>/<variant>/<id>.jpg`;
 * the slug alone identifies the entry because `checkCatalogLayout` keeps slugs unique across
 * trails and routes, the same assumption the /gpx/ download route makes.
 */
export function photoVariantUrl(
  slug: string,
  variant: Variant,
  id: string,
  base: string = import.meta.env.BASE_URL,
): string {
  return `${base.replace(/\/+$/, '')}/photos/${slug}/${variant}/${id}.jpg`;
}

/**
 * Long-side scaling, never enlarging. The two dimensions are returned rather than only the
 * bound so that the `<img>` width/height attributes match the produced bytes exactly (see
 * renderPhotoVariant, which resizes to these dimensions).
 */
export function fitDimensions(width: number, height: number, maxPx: number): { width: number; height: number } {
  const scale = Math.min(1, maxPx / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Identifier derived from the file name: accents dropped, lowercased, anything else collapsed to
 * a hyphen. The file name reaches a URL and the build output, where contributors' spaces and
 * accented characters would need escaping on every use.
 */
export function photoId(file: string): string {
  return basename(file, extname(file))
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function listPhotoFiles(entryDir: string): string[] {
  const dir = join(entryDir, PHOTOS_DIR);
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith('.')) continue;
    if (!statSync(join(dir, name)).isFile()) {
      throw new PhotoError(join(dir, name), 'photos/ must contain only files');
    }
    files.push(name);
  }
  return files;
}

/** Cumulative distance from the start for every track point, metres. */
function cumulativeDistances(points: readonly TrackPoint[]): number[] {
  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push((cumulative[i - 1] as number) + haversineMeters(points[i - 1] as TrackPoint, points[i] as TrackPoint));
  }
  return cumulative;
}

/**
 * Nearest track point by great-circle distance. The nearest *point* is used rather than the
 * nearest point on the segment between two points: at the few-metres spacing of a recording the
 * difference is below the accuracy of both the photo geotag and the track itself, and this keeps
 * the distance along the track a value that exists in the data instead of an interpolation.
 */
function nearestTrackPoint(
  points: readonly TrackPoint[],
  lat: number,
  lon: number,
): { index: number; distance_m: number } {
  let index = 0;
  let distance_m = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = haversineMeters({ lon, lat }, points[i] as TrackPoint);
    if (d < distance_m) {
      distance_m = d;
      index = i;
    }
  }
  return { index, distance_m };
}

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const cache = new Map<string, Promise<DerivedPhoto[]>>();

/**
 * Validate and describe the photos of one entry.
 *
 * Memoised on the entry directory plus the size and mtime of every file in photos/ and the
 * metadata that influences the result, so the detail page, the gallery, the map island and the
 * overview endpoint processing the same entry in one build decode the files once and the
 * "far from the track" warning is printed once per photo. The promise itself is cached so
 * concurrent callers share the work.
 */
export function loadPhotos(input: LoadPhotosInput): Promise<DerivedPhoto[]> {
  const files = listPhotoFiles(input.dir);
  const stamp = files
    .map((f) => {
      const st = statSync(join(input.dir, PHOTOS_DIR, f));
      return `${f}:${st.mtimeMs}:${st.size}`;
    })
    .join('|');
  const base = input.base ?? import.meta.env.BASE_URL;
  const key = `${input.dir}|${input.slug}|${base}|${stamp}|${JSON.stringify(input.photos)}|${input.cover ?? ''}`;

  const hit = cache.get(key);
  if (hit) return hit;

  const pending = derivePhotos(input, files, base);
  cache.set(key, pending);
  // A failed validation must be reported again on the next call rather than resolved from the
  // cache as a rejected promise nobody is waiting on.
  pending.catch(() => cache.delete(key));
  return pending;
}

async function derivePhotos(input: LoadPhotosInput, files: string[], base: string): Promise<DerivedPhoto[]> {
  const { dir, slug, photos: metadata, cover, points } = input;
  const photosDir = join(dir, PHOTOS_DIR);
  const pathOf = (file: string) => join(photosDir, file);

  const onDisk = new Set(files);
  const byFile = new Map<string, PhotoMetadata>();
  for (const meta of metadata) {
    if (!onDisk.has(meta.file)) {
      throw new PhotoError(
        pathOf(meta.file),
        `listed in the photos of ${dir} but not present on disk (files in ${photosDir}/: ${files.join(', ') || 'none'})`,
      );
    }
    if (byFile.has(meta.file)) {
      throw new PhotoError(pathOf(meta.file), `listed twice in the photos of ${dir}`);
    }
    byFile.set(meta.file, meta);
  }

  if (files.length > MAX_PHOTOS_PER_ENTRY) {
    throw new PhotoError(
      dir,
      `${files.length} photos in ${photosDir}/, at most ${MAX_PHOTOS_PER_ENTRY} are allowed per entry`,
    );
  }

  if (cover !== undefined && !onDisk.has(cover)) {
    throw new PhotoError(
      dir,
      `cover "${cover}" is not a photo of this entry (files in ${photosDir}/: ${files.join(', ') || 'none'})`,
    );
  }

  const ids = new Map<string, string>();
  const cumulative = cumulativeDistances(points);
  const { default: exifr } = await import('exifr');
  const { default: sharp } = await import('sharp');

  const derived: DerivedPhoto[] = [];
  for (const file of files) {
    const path = pathOf(file);
    const size = statSync(path).size;
    if (size > MAX_PHOTO_BYTES) {
      throw new PhotoError(
        path,
        `is ${formatMB(size)} (${size} bytes), over the limit of ${formatMB(MAX_PHOTO_BYTES)} (${MAX_PHOTO_BYTES} bytes); resize it before committing`,
      );
    }

    const bytes = readFileSync(path);
    if (!JPEG_MAGIC.every((b, i) => bytes[i] === b)) {
      throw new PhotoError(path, 'is not a JPEG file (the first bytes are not a JPEG marker); export it as JPEG');
    }

    const id = photoId(file);
    if (id === '') throw new PhotoError(path, 'the file name contains no letters or digits to build an identifier from');
    const clash = ids.get(id);
    if (clash) throw new PhotoError(path, `has the same identifier "${id}" as ${pathOf(clash)}; rename one of the two`);
    ids.set(id, file);

    const meta = byFile.get(file);
    let lat: number;
    let lon: number;
    let positionSource: 'exif' | 'metadata';
    if (meta?.lat !== undefined && meta.lon !== undefined) {
      // Metadata wins over EXIF: it is the contributor's explicit correction.
      lat = meta.lat;
      lon = meta.lon;
      positionSource = 'metadata';
    } else {
      // GPS-only parse: reading the whole EXIF block of a dozen photos per entry is wasted work.
      const gps = await exifr.gps(bytes);
      if (!gps || typeof gps.latitude !== 'number' || typeof gps.longitude !== 'number') {
        throw new PhotoError(
          path,
          `has no EXIF GPS position; add it to the photos list of ${dir} with lat/lon, or commit the original file from the camera (messaging apps strip EXIF)`,
        );
      }
      lat = gps.latitude;
      lon = gps.longitude;
      positionSource = 'exif';
    }

    if (!isInsideArea(lon, lat)) {
      throw new PhotoError(
        path,
        `position lat ${lat}, lon ${lon} (from ${positionSource}) is outside the area of interest (${describeArea()})`,
      );
    }

    const nearest = nearestTrackPoint(points, lat, lon);
    if (nearest.distance_m > FAR_FROM_TRACK_M) {
      console.warn(
        `${path}: the photo is ${Math.round(nearest.distance_m)} m from the nearest point of the track of ${dir}, more than ${FAR_FROM_TRACK_M} m; check the position`,
      );
    }

    const source = await sharp(bytes).metadata();
    if (source.width === undefined || source.height === undefined) {
      throw new PhotoError(path, 'the JPEG has no readable width/height');
    }
    // EXIF orientations 5-8 store the image rotated by 90°; sharp's rotate() applies the tag, so
    // the derived images are upright and their long side is the one the viewer will see.
    const swap = (source.orientation ?? 1) >= 5;
    const width = swap ? source.height : source.width;
    const height = swap ? source.width : source.height;

    derived.push({
      id,
      file,
      path,
      caption: meta?.caption ?? null,
      author: meta?.author ?? null,
      lat,
      lon,
      positionSource,
      distanceAlongTrack_m: Math.round(cumulative[nearest.index] as number),
      distanceFromTrack_m: Math.round(nearest.distance_m),
      isCover: cover === file,
      display: { url: photoVariantUrl(slug, 'display', id, base), ...fitDimensions(width, height, VARIANTS.display) },
      thumb: { url: photoVariantUrl(slug, 'thumb', id, base), ...fitDimensions(width, height, VARIANTS.thumb) },
    });
  }

  return derived.sort((a, b) => a.distanceAlongTrack_m - b.distanceAlongTrack_m || a.id.localeCompare(b.id));
}

/**
 * JPEG bytes of one derived image.
 *
 * `fit: 'fill'` with the dimensions computed by fitDimensions, rather than letting sharp fit the
 * image inside a box: sharp's rounding of the second dimension does not always match ours, and
 * the page must be able to state width/height that are exactly those of the file. Both dimensions
 * come from the same aspect ratio, so the deviation from it is at most half a pixel.
 *
 * No withMetadata()/withExif() call: sharp then writes no EXIF, which is what the spec requires.
 */
export async function renderPhotoVariant(photo: DerivedPhoto, variant: Variant): Promise<Uint8Array<ArrayBuffer>> {
  const { default: sharp } = await import('sharp');
  const { width, height } = photo[variant];
  const out = await sharp(readFileSync(photo.path))
    .rotate()
    .resize({ width, height, fit: 'fill' })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
  return new Uint8Array(out);
}
