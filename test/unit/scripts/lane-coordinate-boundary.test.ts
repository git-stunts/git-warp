import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = new URL('../../../', import.meta.url);

function repoPath(relativePath: string): URL {
  return new URL(relativePath, REPO_ROOT);
}

describe('lane coordinate capability boundary docs', () => {
  it('documents the substrate-owned lane and coordinate nouns', async () => {
    const doc = await readFile(repoPath('docs/specs/LANE_COORDINATE_CAPABILITY_BOUNDARY.md'), 'utf8');

    expect(doc).toContain('`worldline`');
    expect(doc).toContain('`strand`');
    expect(doc).toContain('`braid`');
    expect(doc).toContain('`live`');
    expect(doc).toContain('`frontier`');
    expect(doc).toContain('`checkpoint`');
    expect(doc).toContain('`strand-base`');
  });

  it('keeps debugger/session policy out of substrate authority', async () => {
    const doc = await readFile(repoPath('docs/specs/LANE_COORDINATE_CAPABILITY_BOUNDARY.md'), 'utf8');

    expect(doc).toContain('`worldline.live`');
    expect(doc).toContain('`coordinate.transfer-plan`');
    expect(doc).toContain('`debugger.cursor`');
    expect(doc).toContain('not substrate facts');
    expect(doc).toContain('the substrate boundary wins');
  });
});
