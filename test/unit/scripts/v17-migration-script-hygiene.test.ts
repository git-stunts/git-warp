import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

function readRepoFile(relativePath: string): string {
  return readFileSync(`${repoRoot}${relativePath}`, 'utf8');
}

const migrationScriptPaths = [
  'scripts/migrations/v17.0.0/fix-imports.ts',
  'scripts/migrations/v17.0.0/fix-renames.ts',
  'scripts/migrations/v17.0.0/verify.ts',
] as const;

describe('v17 migration script hygiene', () => {
  it('uses custom script errors instead of raw Error construction in touched release scripts', () => {
    const paths = [
      ...migrationScriptPaths,
      'scripts/smoke-packed-artifact.sh',
    ] as const;

    for (const path of paths) {
      expect(readRepoFile(path), path).not.toContain('new Error(');
    }
  });

  it('shares one migration file walker instead of duplicating recursive traversal', () => {
    for (const path of migrationScriptPaths) {
      const source = readRepoFile(path);

      expect(source, path).toContain("from './MigrationFileWalker.ts'");
      expect(source, path).not.toContain('async function* walkFiles');
    }

    expect(readRepoFile('scripts/migrations/v17.0.0/MigrationFileWalker.ts')).toContain(
      'export async function* walkMigrationFiles',
    );
  });
});
