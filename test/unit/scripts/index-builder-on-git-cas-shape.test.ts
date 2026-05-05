import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

function readText(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('0057 index-builder-on-git-cas docs shape', () => {
  it('frames the cycle in git-cas and bounded-residency terms', () => {
    const design = readText('docs/design/0057-index-builder-on-git-cas.md');
    expect(design).toContain('git-cas');
    expect(design).toContain('bounded-residency');
    expect(design).toContain('whole-blob reads');
  });

  it('keeps the v17 release ledger focused on storage and streaming, not file-size theater', () => {
    const release = readText('docs/releases/v17.0.0/README.md');
    expect(release).toContain('INFRA_index-builder-on-git-cas');
    expect(release).not.toContain('INFRA_index-builder-on-git-cas            ← god');
  });
});
