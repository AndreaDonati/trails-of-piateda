import { describe, expect, it } from 'vitest';
import { coverPhoto, photoAlt, toGalleryPhoto, toPhotoMarkers } from '../src/components/gallery';
import type { DerivedPhoto } from '../src/lib/photos';

/** A DerivedPhoto with only the fields the gallery reads; the rest is filler. */
function photo(id: string, overrides: Partial<DerivedPhoto> = {}): DerivedPhoto {
  return {
    id,
    file: `${id}.jpg`,
    path: `content/trails/prova/photos/${id}.jpg`,
    caption: null,
    author: null,
    lat: 46.16,
    lon: 9.93,
    positionSource: 'exif',
    distanceAlongTrack_m: 0,
    distanceFromTrack_m: 0,
    isCover: false,
    display: { url: `/base/photos/prova/display/${id}.jpg`, width: 1600, height: 1200 },
    thumb: { url: `/base/photos/prova/thumb/${id}.jpg`, width: 400, height: 300 },
    ...overrides,
  };
}

describe('coverPhoto', () => {
  it('prefers the photo marked as cover by the metadata', () => {
    const marked = photo('cima', { isCover: true });
    expect(coverPhoto([photo('partenza'), marked, photo('arrivo')])).toBe(marked);
  });

  it('falls back to the first photo in track order', () => {
    const first = photo('partenza');
    expect(coverPhoto([first, photo('arrivo')])).toBe(first);
  });

  it('returns null for an entry without photos, so the card can show the placeholder', () => {
    expect(coverPhoto([])).toBeNull();
  });
});

describe('photoAlt', () => {
  it('uses the caption when the contributor wrote one', () => {
    expect(photoAlt('I tornanti sopra la Val Venina.', 'Piateda - Ambria', 0)).toBe(
      'I tornanti sopra la Val Venina.',
    );
  });

  it('describes the photo from the entry name and its position when there is no caption', () => {
    expect(photoAlt(null, 'Piateda - Ambria', 1)).toBe('Foto 2 di Piateda - Ambria');
  });

  it('treats a blank caption as absent rather than producing an empty alt', () => {
    expect(photoAlt('   ', 'Piateda - Ambria', 0)).toBe('Foto 1 di Piateda - Ambria');
  });
});

describe('published photo data', () => {
  it('drops the build-machine path from what reaches the page', () => {
    const published = toGalleryPhoto(photo('partenza'));
    expect(published).not.toHaveProperty('path');
    expect(published).not.toHaveProperty('file');
    expect(JSON.stringify(published)).not.toContain('content/trails');
  });

  it('gives the map island the position, the thumbnail URL and the caption only', () => {
    const markers = toPhotoMarkers([toGalleryPhoto(photo('partenza', { caption: 'Piazza' }))]);
    expect(markers).toEqual([
      { id: 'partenza', lat: 46.16, lon: 9.93, thumb: '/base/photos/prova/thumb/partenza.jpg', caption: 'Piazza' },
    ]);
  });
});
