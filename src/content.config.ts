import { dirname } from 'node:path';
import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { checkCatalogLayout } from './lib/catalog';

// This module is loaded once at the start of `astro sync`, `astro dev` and `astro build`,
// before any loader reads an entry, so the directory check runs here and a bad layout fails
// the build before Zod ever sees a metadata file.
const layout = checkCatalogLayout();

export const DIFFICULTIES = ['T', 'E', 'EE', 'EEA'] as const;
export const STATUSES = ['open', 'closed', 'maintenance'] as const;

/**
 * Piateda and the municipalities bordering it. Every entry must involve at least one, which
 * keeps the catalog to the area it claims to cover. Compared case-insensitively.
 */
// Source: the "comuni confinanti" list in the Italian Wikipedia entry for Piateda
// (Carona and Valbondione are across the Orobie ridge, in the province of Bergamo).
export const LOCAL_MUNICIPALITIES = [
  'Piateda',
  'Albosaggia',
  'Caiolo',
  'Carona',
  'Faedo Valtellino',
  'Montagna in Valtellina',
  'Poggiridenti',
  'Ponte in Valtellina',
  'Tresivio',
  'Valbondione',
] as const;

const normalise = (s: string) => s.trim().toLowerCase();
const localSet = new Set(LOCAL_MUNICIPALITIES.map(normalise));

// js-yaml turns an unquoted `2025-06-01` into a Date; a quoted one stays a string. Both are
// accepted and normalised to YYYY-MM-DD so pages deal with one representation.
const isoDate = z
  .union([
    z.date(),
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected an ISO date (YYYY-MM-DD)')
      .refine((s) => !Number.isNaN(Date.parse(s)), 'not a valid calendar date'),
  ])
  .transform((v) => (typeof v === 'string' ? v : v.toISOString().slice(0, 10)));

const start = z
  .object({
    name: z.string().min(1, 'start.name must not be empty'),
    lat: z.number().min(-90).max(90).optional(),
    lon: z.number().min(-180).max(180).optional(),
  })
  .strict()
  .refine((s) => (s.lat === undefined) === (s.lon === undefined), {
    message: 'start.lat and start.lon must be given together',
  });

export const baseSchema = z
  .object({
    name: z.string().min(1, 'name must not be empty'),
    summary: z.string().max(200, 'summary must be at most 200 characters'),
    difficulty: z.enum(DIFFICULTIES, { error: `difficulty must be one of ${DIFFICULTIES.join(', ')}` }),
    municipalities: z
      .array(z.string().min(1))
      .min(1, 'municipalities must list at least one municipality')
      .refine((list) => list.some((m) => localSet.has(normalise(m))), {
        message: `municipalities must include Piateda or a bordering municipality (${LOCAL_MUNICIPALITIES.join(', ')})`,
      }),
    start,
    description: z.string().optional(),
    signage: z.string().optional(),
    duration_minutes: z.number().int().positive().optional(),
    tags: z.array(z.string().min(1)).default([]),
    status: z.enum(STATUSES).default('open'),
    verified_on: isoDate.optional(),
    sources: z.array(z.string().min(1)).default([]),
    contributors: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const trailSchema = baseSchema;

/**
 * Route schema. `knownTrails` are the slugs present under content/trails: a reference to any
 * other slug fails here with a message naming it. Astro checks references again when it
 * builds the data store, so this is a second, earlier report of the same mistake, kept so the
 * behaviour is unit-testable without a build.
 */
export function routeSchema(knownTrails: ReadonlySet<string>) {
  return baseSchema
    .extend({
      loop: z.boolean().default(false),
      trails: z
        .array(
          reference('trails').superRefine((ref, ctx) => {
            if (!knownTrails.has(ref.id)) {
              ctx.addIssue({
                code: 'custom',
                message: `trails: no trail "${ref.id}" exists (expected content/trails/${ref.id}/)`,
              });
            }
          }),
        )
        .default([]),
    })
    .strict();
}

const trails = defineCollection({
  loader: glob({
    pattern: '*/trail.yaml',
    base: './content/trails',
    // `entry` is the path relative to base, e.g. piateda-ambria/trail.yaml
    generateId: ({ entry }) => dirname(entry),
  }),
  schema: trailSchema,
});

const routes = defineCollection({
  loader: glob({
    pattern: '*/route.yaml',
    base: './content/routes',
    generateId: ({ entry }) => dirname(entry),
  }),
  schema: routeSchema(new Set(layout.trails)),
});

export const collections = { trails, routes };
