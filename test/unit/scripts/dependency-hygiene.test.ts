import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import PackedArtifactBoundaryAdapter from '../../../src/infrastructure/adapters/PackedArtifactBoundaryAdapter.ts';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const REPO_ROOT = new URL('../../../', import.meta.url);

const DECLARATION_FILES: readonly string[] = [
  'trailer-codec-index.d.ts.txt',
];

const DECLARATION_README_HEADINGS: readonly string[] = [
  '### `@git-stunts/trailer-codec@2.1.1`',
];

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
  it('allows only the reviewed developer-tool security overrides', async () => {
    const packageJson = await readFile(repoPath('package.json'), 'utf8');

    const manifest = new PackedArtifactBoundaryAdapter().read(
      fileURLToPath(repoPath('package.json')),
      z.object({ overrides: z.record(z.union([z.string(), z.record(z.string())])) })
    );
    // Exact allowlist: each out-of-range security fix needs caller evidence and review.
    expect(manifest.overrides).toEqual({
      'markdownlint-cli': { 'js-yaml': '5.4.2', 'smol-toml': '1.9.0' },
      katex: '0.18.2',
    });
    expect(packageJson).not.toContain('"tar": "7.5.16"');
    expect(packageJson).toContain('"zod": "^3.24.1"');
    expect(packageJson).not.toContain('"patch-package"');
    expect(packageJson).toContain('./scripts/TrailerCodecDeclarationInstaller.ts');
    expect(packageJson).toContain('&& node scripts/setup-hooks.ts');
  });

  it('documents the exact dependency-local declaration inventory', async () => {
    const patchFiles = (await readdir(repoPath('patches')))
      .filter((fileName) => fileName.endsWith('.d.ts.txt') || fileName.endsWith('.patch'))
      .sort();
    const readme = await readFile(repoPath('patches/README.md'), 'utf8');

    expect(patchFiles).toEqual(DECLARATION_FILES);

    for (const heading of DECLARATION_README_HEADINGS) {
      expect(readme).toContain(heading);
    }
  });

  it('keeps Deno on the same git storage ranges as the package manifest', async () => {
    const reader = new PackedArtifactBoundaryAdapter();
    const packageFile = reader.read(fileURLToPath(repoPath('package.json')), PACKAGE_FILE_SCHEMA);
    const denoImportMap = reader.read(
      fileURLToPath(repoPath('test/runtime/deno/deno.json')), DENO_IMPORT_MAP_SCHEMA
    );

    for (const dependency of SHARED_RUNTIME_DEPENDENCIES) {
      const range = requireEntry(packageFile.dependencies, dependency);
      expect(requireEntry(denoImportMap.imports, dependency)).toBe(`npm:${dependency}@${range}`);
    }
  });
});
