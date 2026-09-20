/**
 * Contract shared by the three places photos are rendered (tasks 6.4/6.5, design D10):
 * PhotoGallery.astro (thumbnails + lightbox), EntryCard.astro (cover in the list) and the
 * TrackMap island (camera markers on the detail map).
 *
 * Two reasons this is a module of its own rather than code inside the components:
 * - `DerivedPhoto` carries `path`, the source file on the build machine. Pages must publish
 *   the derived URLs only, so everything that reaches HTML or island props goes through
 *   `toGalleryPhoto` / `toPhotoMarkers`, which drop it.
 * - the gallery script and the React island talk through the `photo:select` event; the name,
 *   the payload and the loop guard have to be written down once.
 *
 * The only import is type-only, so bundling this module into the client keeps no reference to
 * src/lib/photos.ts (which reads the filesystem).
 */
import type { DerivedPhoto } from '../lib/photos';

/** A photo as the browser may see it: no source path. */
export interface GalleryPhoto {
  id: string;
  caption: string | null;
  author: string | null;
  lat: number;
  lon: number;
  display: { url: string; width: number; height: number };
  thumb: { url: string; width: number; height: number };
  isCover: boolean;
}

/** Cover thumbnail of the list card, resolved by the page and rendered by EntryCard. */
export interface CardCover {
  url: string;
  width: number;
  height: number;
  alt: string;
  /** True for the first card only: the one likely above the fold, which is not lazy-loaded. */
  eager?: boolean;
}

/** What the detail map needs per photo: position, the thumbnail to draw, a label. */
export interface PhotoMarker {
  id: string;
  lat: number;
  lon: number;
  /** Thumbnail URL, base path included. */
  thumb: string;
  caption: string | null;
}

/**
 * Name of the `CustomEvent` dispatched on `document` when a photo is selected, in either
 * direction between the gallery and the map island (design D10).
 */
export const PHOTO_SELECT_EVENT = 'photo:select';

export interface PhotoSelectDetail {
  /**
   * `DerivedPhoto.id`, unique within the entry, or `null` to mean "nothing is selected any
   * more". The gallery sends the null form when the lightbox closes, so the map can drop the
   * marker highlight instead of leaving one lit with no lightbox open.
   */
  id: string | null;
  /**
   * Who selected the photo. Each side ignores the events it dispatched itself, which is what
   * keeps gallery → map → gallery from looping: both listen on `document`, so without this
   * field a dispatch would come straight back.
   */
  source: 'gallery' | 'map';
}

declare global {
  interface DocumentEventMap {
    [PHOTO_SELECT_EVENT]: CustomEvent<PhotoSelectDetail>;
  }
}

export function photoSelectEvent(detail: PhotoSelectDetail): CustomEvent<PhotoSelectDetail> {
  return new CustomEvent<PhotoSelectDetail>(PHOTO_SELECT_EVENT, { detail });
}

/** Publishable view of one photo: everything but the source path. */
export function toGalleryPhoto(photo: DerivedPhoto): GalleryPhoto {
  return {
    id: photo.id,
    caption: photo.caption,
    author: photo.author,
    lat: photo.lat,
    lon: photo.lon,
    display: { ...photo.display },
    thumb: { ...photo.thumb },
    isCover: photo.isCover,
  };
}

export function toPhotoMarkers(photos: readonly GalleryPhoto[]): PhotoMarker[] {
  return photos.map((photo) => ({
    id: photo.id,
    lat: photo.lat,
    lon: photo.lon,
    thumb: photo.thumb.url,
    caption: photo.caption,
  }));
}

/**
 * Cover of an entry: the photo named by `cover` in the metadata, otherwise the first in track
 * order (the order `loadPhotos` returns), otherwise none. The list page shows a placeholder for
 * the `null` case rather than collapsing the card layout.
 */
export function coverPhoto<T extends { isCover: boolean }>(photos: readonly T[]): T | null {
  return photos.find((photo) => photo.isCover) ?? photos[0] ?? null;
}

/**
 * Alternative text of a thumbnail or of the display image. The caption is the contributor's own
 * description, so it is preferred; without one, the position in the entry is the only thing
 * known about the image, and an empty alt would hide a content image from screen readers.
 */
export function photoAlt(caption: string | null | undefined, entryName: string, index: number): string {
  const text = caption?.trim();
  return text ? text : `Foto ${index + 1} di ${entryName}`;
}
