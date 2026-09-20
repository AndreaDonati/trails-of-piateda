import { afterEach, describe, expect, it, vi } from 'vitest';

// The module reads process.env at import time, so each case needs a fresh module instance.
async function load(repoUrl?: string) {
  vi.resetModules();
  if (repoUrl === undefined) vi.stubEnv('REPO_URL', undefined);
  else vi.stubEnv('REPO_URL', repoUrl);
  return import('../src/lib/site');
}

describe('REPO_URL', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('defaults to this repository, so a local build and astro dev work unconfigured', async () => {
    const { REPO_URL, DATA_LICENSE_URL } = await load();
    expect(REPO_URL).toBe('https://github.com/AndreaDonati/trails-of-piateda');
    expect(DATA_LICENSE_URL).toBe('https://github.com/AndreaDonati/trails-of-piateda/blob/main/LICENSE-DATA');
  });

  it('comes from the environment, so a fork links to its own repository', async () => {
    const { REPO_URL, DATA_LICENSE_URL } = await load('https://github.com/mario/trails-of-piateda');
    expect(REPO_URL).toBe('https://github.com/mario/trails-of-piateda');
    expect(DATA_LICENSE_URL).toBe('https://github.com/mario/trails-of-piateda/blob/main/LICENSE-DATA');
  });

  it('tolerates a trailing slash in the configured value', async () => {
    const { DATA_LICENSE_URL } = await load('https://github.com/mario/trails-of-piateda/');
    expect(DATA_LICENSE_URL).toBe('https://github.com/mario/trails-of-piateda/blob/main/LICENSE-DATA');
  });
});
