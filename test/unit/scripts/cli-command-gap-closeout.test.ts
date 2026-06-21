import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = new URL('../../../', import.meta.url);

function repoPath(relativePath: string): URL {
  return new URL(relativePath, REPO_ROOT);
}

describe('CLI command gap closeout docs', () => {
  it('documents the honest command families and the omitted boundaries', async () => {
    const guide = await readFile(repoPath('docs/CLI_GUIDE.md'), 'utf8');

    expect(guide).toContain('git warp checkpoint status');
    expect(guide).toContain('git warp gc status');
    expect(guide).toContain('git warp sync status');
    expect(guide).toContain('git warp serve');
    expect(guide).toContain('git warp fork');
    expect(guide).toContain('git warp watch');
    expect(guide).toContain('`export` / `import` and `upgrade` / `migrate` remain intentionally absent');
    expect(guide).toContain('explicit file-exchange and substrate');
    expect(guide).toContain('upgrade adapter boundaries');
  });

  it('does not teach the removed view flag as a runnable workflow', async () => {
    const guide = await readFile(repoPath('docs/CLI_GUIDE.md'), 'utf8');

    expect(guide).toContain('The old `--view` flag has been removed.');
    expect(guide).not.toContain('git warp --view');
  });
});
