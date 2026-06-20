import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = new URL('../../../', import.meta.url);

function repoPath(relativePath: string): URL {
  return new URL(relativePath, REPO_ROOT);
}

describe('observer-first guide posture', () => {
  it('keeps the day-to-day guide centered on worldlines and observers before raw graph reads', async () => {
    const guide = await readFile(repoPath('docs/GUIDE.md'), 'utf8');

    expect(guide.indexOf('## Common read patterns')).toBeLessThan(guide.indexOf('## Common query patterns'));
    expect(guide).toContain('Add an observer when the caller should not see everything.');
    expect(guide).toContain('worldlines, observers, optics, and query builders first');
  });

  it('warns that observer redaction is not a cryptographic boundary', async () => {
    const guide = await readFile(repoPath('docs/GUIDE.md'), 'utf8');
    const advanced = await readFile(repoPath('docs/ADVANCED_GUIDE.md'), 'utf8');

    expect(guide).toContain('Observer redaction is application-layer filtering.');
    expect(guide).toContain('not a cryptographic');
    expect(guide).toContain('CasContentEncryptionPolicy');
    expect(guide).toContain('@git-stunts/vault');
    expect(guide).toContain('do not put graph encryption secrets in `.env` files');
    expect(advanced).toContain('Observer redaction is not encryption');
    expect(advanced).toContain('They do not rewrite patch history');
    expect(advanced).toContain('OS-native keychain');
  });
});
