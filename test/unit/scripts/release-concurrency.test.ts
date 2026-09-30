import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('release publication serialization', () => {
  it('uses the same non-cancelling concurrency group for every release tag', () => {
    const workflow = readFileSync('.github/workflows/release.yml', 'utf8');
    const concurrency = /^concurrency:\n(?<settings>(?:[ \t]+[^\n]*\n)+)/mu
      .exec(workflow)?.groups?.['settings'];
    expect(concurrency).toBeDefined();
    expect(concurrency).toContain('group: release-${{ github.workflow }}');
    expect(concurrency).toContain('cancel-in-progress: false');
  });
});
