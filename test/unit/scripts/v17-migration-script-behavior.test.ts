import { execFile, type ExecFileException } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { walkMigrationFiles } from '../../../scripts/migrations/v17.0.0/MigrationFileWalker.ts';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

type ScriptResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

class MigrationFixture {
  readonly samplePath: string;

  constructor(readonly root: string) {
    this.samplePath = join(root, 'src', 'sample.ts');
  }

  async sampleSource(): Promise<string> {
    return await readFile(this.samplePath, 'utf8');
  }
}

async function withMigrationFixture(
  test: (fixture: MigrationFixture) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'warp-v17-migration-'));
  try {
    await mkdir(join(root, 'src', 'nested'), { recursive: true });
    await mkdir(join(root, 'node_modules', 'ignored'), { recursive: true });
    await mkdir(join(root, '.git', 'ignored'), { recursive: true });
    await writeFile(
      join(root, 'src', 'sample.ts'),
      [
        "import { PatchBuilderV2, PatchV2, Lens } from '@git-stunts/git-warp/services/PatchBuilderV2.js';",
        'const patch: PatchV2 = new PatchBuilderV2();',
        'function useAperture(aperture: Lens): Lens { return aperture; }',
        'void patch;',
        'void useAperture;',
        '',
      ].join('\n'),
      'utf8',
    );
    await writeFile(join(root, 'src', 'nested', 'extra.js'), 'const ok = true;\n', 'utf8');
    await writeFile(join(root, 'README.md'), 'PatchV2 should not be scanned here.\n', 'utf8');
    await writeFile(join(root, 'node_modules', 'ignored', 'package.ts'), 'const stale: PatchV2 = null;\n', 'utf8');
    await writeFile(join(root, '.git', 'ignored', 'hook.ts'), 'const stale: PatchV2 = null;\n', 'utf8');

    await test(new MigrationFixture(root));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function runMigrationScript(scriptPath: string, args: readonly string[]): Promise<ScriptResult> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [join(REPO_ROOT, scriptPath), ...args],
      { cwd: REPO_ROOT, encoding: 'utf8' },
      (error: ExecFileException | null, stdout: string, stderr: string) => {
        const exitCode = typeof error?.code === 'number' ? error.code : 0;
        resolve({ exitCode, stdout, stderr });
      },
    );
  });
}

describe('v17 migration script behavior', () => {
  it('walks migration source files while skipping markdown, node_modules, and git internals', async () => {
    await withMigrationFixture(async (fixture) => {
      const visited: string[] = [];

      for await (const filePath of walkMigrationFiles(fixture.root)) {
        visited.push(relative(fixture.root, filePath));
      }

      expect(visited.sort()).toEqual([
        'src/nested/extra.js',
        'src/sample.ts',
      ]);
    });
  });

  it('reports stale v16 APIs, rewrites them, and verifies the migrated fixture', async () => {
    await withMigrationFixture(async (fixture) => {
      const stale = await runMigrationScript('scripts/migrations/v17.0.0/verify.ts', [
        '--dir',
        fixture.root,
      ]);
      expect(stale.exitCode).toBe(1);
      expect(stale.stdout).toContain('PatchBuilderV2.js renamed to PatchBuilder.ts');
      expect(stale.stdout).toContain('PatchV2 renamed to Patch');

      const imports = await runMigrationScript('scripts/migrations/v17.0.0/fix-imports.ts', [
        '--dir',
        fixture.root,
      ]);
      expect(imports).toMatchObject({ exitCode: 0, stderr: '' });
      expect(imports.stdout).toContain('1 imports updated across 1 files');

      const renames = await runMigrationScript('scripts/migrations/v17.0.0/fix-renames.ts', [
        '--dir',
        fixture.root,
      ]);
      expect(renames).toMatchObject({ exitCode: 0, stderr: '' });
      expect(renames.stdout).toContain('3 renames across 1 files');

      const migrated = await fixture.sampleSource();
      expect(migrated).toContain("from '@git-stunts/git-warp/services/PatchBuilder.ts'");
      expect(migrated).toContain('PatchBuilder');
      expect(migrated).toContain('Patch');
      expect(migrated).toContain('Aperture');
      expect(migrated).not.toContain('PatchBuilderV2');
      expect(migrated).not.toContain('PatchV2');
      expect(migrated).not.toContain('Lens');

      const clean = await runMigrationScript('scripts/migrations/v17.0.0/verify.ts', [
        '--dir',
        fixture.root,
      ]);
      expect(clean).toMatchObject({ exitCode: 0, stderr: '' });
      expect(clean.stdout).toContain('No v16 migration issues found');
    });
  });
});
