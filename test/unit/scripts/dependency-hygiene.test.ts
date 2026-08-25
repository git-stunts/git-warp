import { readdir, readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const REPO_ROOT = new URL('../../../', import.meta.url);

const PATCH_PACKAGE_FILES: readonly string[] = ['@git-stunts+trailer-codec+2.1.1.patch'];

const PATCH_PACKAGE_README_HEADINGS: readonly string[] = ['### `@git-stunts/trailer-codec@2.1.1`'];

const PACKAGE_FILE_SCHEMA = z.object({
  dependencies: z.record(z.string()),
});

const DENO_IMPORT_MAP_SCHEMA = z.object({
  imports: z.record(z.string()),
});

const SHARED_RUNTIME_DEPENDENCIES: readonly string[] = [
  '@git-stunts/git-cas',
  '@git-stunts/plumbing',
];

function repoPath(relativePath: string): URL {
  return new URL(relativePath, REPO_ROOT);
}

function requireEntry(entries: Readonly<Record<string, string>>, name: string): string {
  const value = entries[name];
  if (value === undefined) {
    throw new Error(`Missing dependency entry: ${name}`);
  }
  return value;
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

  it('keeps Deno on the same git storage ranges as the package manifest', async () => {
    const packageFile = PACKAGE_FILE_SCHEMA.parse(
      JSON.parse(await readFile(repoPath('package.json'), 'utf8'))
    );
    const denoImportMap = DENO_IMPORT_MAP_SCHEMA.parse(
      JSON.parse(await readFile(repoPath('test/runtime/deno/deno.json'), 'utf8'))
    );

    for (const dependency of SHARED_RUNTIME_DEPENDENCIES) {
      const range = requireEntry(packageFile.dependencies, dependency);
      expect(requireEntry(denoImportMap.imports, dependency)).toBe(`npm:${dependency}@${range}`);
    }
  });
});
