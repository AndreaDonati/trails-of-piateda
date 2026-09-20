import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, routeSchema, trailSchema } from '../src/content.config';

// Astro prefixes schema failures with the entry id ("**routes → anello** data does not match
// collection schema"); these tests cover the part this project controls: which field fails and
// what the message says.

const validTrail = {
  name: 'Piateda - Ambria',
  summary: 'Salita ad Ambria.',
  difficulty: 'E',
  municipalities: ['Piateda'],
  start: { name: 'Piateda' },
};

function issues(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return result.success ? [] : result.error!.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

describe('trail schema', () => {
  it('accepts a minimal valid entry and applies defaults', () => {
    const r = trailSchema.safeParse(validTrail);
    expect(r.success, issues(r).join('\n')).toBe(true);
    expect(r.data).toMatchObject({ status: 'open', tags: [], sources: [], contributors: [] });
    expect(r.data).not.toHaveProperty('loop');
  });

  it('missing difficulty names the field and the accepted values', () => {
    const { difficulty: _omit, ...data } = validTrail;
    const r = trailSchema.safeParse(data);
    expect(r.success).toBe(false);
    const msgs = issues(r);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatch(/^difficulty: /);
    for (const d of DIFFICULTIES) expect(msgs[0]).toContain(d);
  });

  it('an unknown field is rejected and named', () => {
    const r = trailSchema.safeParse({ ...validTrail, dificulty: 'E' });
    expect(r.success).toBe(false);
    expect(issues(r).join('\n')).toContain('dificulty');
  });

  it('route-only fields are unknown on a trail', () => {
    const r = trailSchema.safeParse({ ...validTrail, loop: true });
    expect(issues(r).join('\n')).toContain('loop');
  });

  it('summary longer than 200 characters fails', () => {
    const r = trailSchema.safeParse({ ...validTrail, summary: 'x'.repeat(201) });
    expect(issues(r)[0]).toMatch(/^summary: .*200/);
  });

  it('municipalities must include Piateda or a neighbour', () => {
    const r = trailSchema.safeParse({ ...validTrail, municipalities: ['Milano'] });
    expect(issues(r)[0]).toMatch(/^municipalities: .*Piateda/);
    expect(trailSchema.safeParse({ ...validTrail, municipalities: ['Sondrio', 'albosaggia'] }).success).toBe(true);
    expect(trailSchema.safeParse({ ...validTrail, municipalities: [] }).success).toBe(false);
  });

  it('start.lat and start.lon come together', () => {
    const r = trailSchema.safeParse({ ...validTrail, start: { name: 'x', lat: 46.16 } });
    expect(issues(r)[0]).toMatch(/^start: .*lat.*lon/);
    expect(trailSchema.safeParse({ ...validTrail, start: { name: 'x', lat: 46.16, lon: 9.93 } }).success).toBe(true);
  });

  it('verified_on accepts a Date (unquoted YAML) or an ISO string and normalises to YYYY-MM-DD', () => {
    const fromDate = trailSchema.safeParse({ ...validTrail, verified_on: new Date('2025-06-01T00:00:00Z') });
    expect(fromDate.success && fromDate.data.verified_on).toBe('2025-06-01');
    const fromString = trailSchema.safeParse({ ...validTrail, verified_on: '2025-06-01' });
    expect(fromString.success && fromString.data.verified_on).toBe('2025-06-01');
    expect(trailSchema.safeParse({ ...validTrail, verified_on: 'ieri' }).success).toBe(false);
    expect(trailSchema.safeParse({ ...validTrail, verified_on: '2025-13-45' }).success).toBe(false);
  });

  it('duration_minutes must be a positive integer', () => {
    expect(trailSchema.safeParse({ ...validTrail, duration_minutes: 0 }).success).toBe(false);
    expect(trailSchema.safeParse({ ...validTrail, duration_minutes: 90.5 }).success).toBe(false);
    expect(trailSchema.safeParse({ ...validTrail, duration_minutes: 90 }).success).toBe(true);
  });
});

describe('route schema', () => {
  const known = new Set(['piateda-ambria']);

  it('accepts route fields and resolves trail references', () => {
    const r = routeSchema(known).safeParse({ ...validTrail, loop: true, trails: ['piateda-ambria'] });
    expect(r.success, issues(r).join('\n')).toBe(true);
    expect(r.data?.loop).toBe(true);
    expect(r.data?.trails).toEqual([{ id: 'piateda-ambria', collection: 'trails' }]);
  });

  it('defaults loop to false and trails to an empty list', () => {
    const r = routeSchema(known).safeParse(validTrail);
    expect(r.success && r.data).toMatchObject({ loop: false, trails: [] });
  });

  it('a reference to a non-existent trail fails and names it', () => {
    const r = routeSchema(known).safeParse({ ...validTrail, trails: ['piateda-ambria', 'sentiero-inesistente'] });
    expect(r.success).toBe(false);
    const msgs = issues(r);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatch(/^trails\.1: /);
    expect(msgs[0]).toContain('sentiero-inesistente');
    expect(msgs[0]).not.toContain('piateda-ambria');
  });
});
