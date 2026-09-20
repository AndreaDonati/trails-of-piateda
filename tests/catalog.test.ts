import { describe, expect, it } from 'vitest';
import { checkCatalogLayout, entryUrl, getPhotos, SLUG_PATTERN, type CatalogEntry } from '../src/lib/catalog';

const fixture = (name: string) => `tests/fixtures/layout/${name}`;

describe('checkCatalogLayout', () => {
  it('returns the slugs of a valid layout, accepting a photos/ directory', () => {
    expect(checkCatalogLayout(fixture('valid'))).toEqual({
      trails: ['con-foto', 'piateda-ambria'],
      routes: ['anello'],
    });
  });

  it('accepts the fixture entries committed under content/', () => {
    expect(checkCatalogLayout()).toEqual({
      trails: ['piateda-ambria', 'sentiero-senza-quota'],
      routes: ['anello-piateda-alta', 'percorso-chiuso'],
    });
  });

  it('rejects a directory name that is not a slug, naming the directory and the pattern', () => {
    expect(() => checkCatalogLayout(fixture('bad-slug'))).toThrow(
      new RegExp(`^${fixture('bad-slug')}/trails/Piateda_Ambria: .*${SLUG_PATTERN.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
    );
  });

  it('rejects an entry without track.gpx, naming the directory and the file', () => {
    expect(() => checkCatalogLayout(fixture('missing-gpx'))).toThrow(
      `${fixture('missing-gpx')}/trails/senza-traccia: missing track.gpx`,
    );
  });

  it('rejects a route directory with trail.yaml instead of route.yaml', () => {
    expect(() => checkCatalogLayout(fixture('wrong-meta'))).toThrow(
      `${fixture('wrong-meta')}/routes/con-trail-yaml: missing route.yaml`,
    );
  });

  it('rejects unexpected files inside an entry', () => {
    expect(() => checkCatalogLayout(fixture('extra-file'))).toThrow(/trails\/con-note: unexpected file "note\.txt"/);
  });

  it('rejects a slug used by both a trail and a route', () => {
    expect(() => checkCatalogLayout(fixture('duplicate-slug'))).toThrow(
      /routes\/doppio: slug "doppio" is already used by .*trails\/doppio/,
    );
  });

  it('rejects files placed directly under trails/', () => {
    expect(() => checkCatalogLayout(fixture('stray-file'))).toThrow(/trails\/trail\.yaml: only entry directories/);
  });

  it('treats a missing kind directory as an empty collection', () => {
    expect(checkCatalogLayout('tests/fixtures/gpx')).toEqual({ trails: [], routes: [] });
  });
});

describe('entryUrl', () => {
  it('builds kind-specific paths with a trailing slash', () => {
    expect(entryUrl('trail', 'piateda-ambria', '/')).toBe('/sentieri/piateda-ambria/');
    expect(entryUrl('route', 'anello', '/')).toBe('/percorsi/anello/');
  });

  it('accepts the site base with or without trailing slash', () => {
    expect(entryUrl('trail', 'x', '/trails-of-piateda/')).toBe('/trails-of-piateda/sentieri/x/');
    expect(entryUrl('trail', 'x', '/trails-of-piateda')).toBe('/trails-of-piateda/sentieri/x/');
  });
});

describe('getPhotos', () => {
  // getOverview counts the photos of every entry, and the detail page, the list page and the
  // /photos/ endpoint derive the same photos again. They must share one derivation per build,
  // which they only do if catalog.ts hands loadPhotos arguments that produce the same cache key
  // every time: a per-call `base`, or metadata rebuilt into a different shape, would silently
  // defeat the memoisation and make every build decode the files several times.
  //
  // The entry used here has no photos/ directory, so the assertion is about the key and not
  // about the derivation itself, which tests/photos.test.ts covers on real files.
  const entry = {
    kind: 'route',
    slug: 'anello-piateda-alta',
    url: '/percorsi/anello-piateda-alta/',
    dir: 'content/routes/anello-piateda-alta',
    data: { photos: [] },
  } as unknown as CatalogEntry;

  it('derives the photos of an entry once per build', async () => {
    const first = await getPhotos(entry);
    expect(first).toEqual([]);
    expect(await getPhotos(entry)).toBe(first);
    // A distinct CatalogEntry object for the same entry, as getEntries() builds on every call.
    expect(await getPhotos({ ...entry })).toBe(first);
  });
});
