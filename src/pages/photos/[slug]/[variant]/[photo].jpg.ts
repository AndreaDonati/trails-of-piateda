import type { APIRoute, GetStaticPaths } from 'astro';
import { getEntries, getPhotos } from '../../../../lib/catalog';
import { renderPhotoVariant, VARIANT_NAMES, type DerivedPhoto, type Variant } from '../../../../lib/photos';

interface Props {
  photo: DerivedPhoto;
  variant: Variant;
}

/**
 * Derived images of every photo of every entry: `/photos/<slug>/<display|thumb>/<id>.jpg`.
 *
 * This endpoint is the only way a photo reaches the output. The originals under content/ are
 * never copied to dist/, and the bytes written here carry no EXIF (see photos.ts for why sharp
 * is driven directly instead of Astro's image service).
 */
export const getStaticPaths = (async () => {
  const entries = await getEntries();
  const perEntry = await Promise.all(entries.map(async (entry) => ({ entry, photos: await getPhotos(entry) })));
  return perEntry.flatMap(({ entry, photos }) =>
    photos.flatMap((photo) =>
      VARIANT_NAMES.map((variant) => ({
        params: { slug: entry.slug, variant, photo: photo.id },
        props: { photo, variant } satisfies Props,
      })),
    ),
  );
}) satisfies GetStaticPaths;

export const GET: APIRoute<Props> = async ({ props }) => {
  return new Response(await renderPhotoVariant(props.photo, props.variant), {
    headers: { 'Content-Type': 'image/jpeg' },
  });
};
