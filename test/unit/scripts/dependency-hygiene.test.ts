import { readdir, readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = new URL('../../../', import.meta.url);

const PATCH_PACKAGE_FILES: readonly string[] = [
  '@git-stunts+alfred+0.10.3.patch',
  '@git-stunts+trailer-codec+2.1.1.patch',
];

const PATCH_PACKAGE_README_HEADINGS: readonly string[] = [
  '### `@git-stunts/alfred@0.10.3`',
  '### `@git-stunts/trailer-codec@2.1.1`',
];

function repoPath(relativePath: string): URL {
  return new URL(relativePath, REPO_ROOT);
}

describe('dependency hygiene', () => {
  it('keeps direct dependency policy explicit without stale overrides', async () => {
    const packageJson = await readFile(repoPath('package.json'), 'utf8');

    expect(packageJson).not.toMatch(/"overrides"\s*:\s*\{/);
    expect(packageJson).not.toContain('"tar": "7.5.16"');
    expect(packageJson).toContain('"zod": "^3.24.1"');
    expect(packageJson).toContain('"patch-package": "^8.0.0"');
    expect(packageJson).toContain('"prepare": "patch-package && node scripts/setup-hooks.ts"');
  });

  it('documents every patch-package mutation in the patch inventory', async () => {
    const patchFiles = (await readdir(repoPath('patches')))
      .filter((fileName) => fileName.endsWith('.patch'))
      .sort();
    const readme = await readFile(repoPath('patches/README.md'), 'utf8');

    expect(patchFiles).toEqual(PATCH_PACKAGE_FILES);

    for (const heading of PATCH_PACKAGE_README_HEADINGS) {
      expect(readme).toContain(heading);
    }
  });
});
