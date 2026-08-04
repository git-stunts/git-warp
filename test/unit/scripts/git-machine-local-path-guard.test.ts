import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { GitMachineLocalPathGuard } from '../../../scripts/GitMachineLocalPathGuard.ts';
import { MachineLocalPathPolicy } from '../../../scripts/MachineLocalPathPolicy.ts';

const hookPath = fileURLToPath(new URL('../../../scripts/hooks/pre-commit', import.meta.url));
const tempDirs: string[] = [];

function git(repository: string, ...args: readonly string[]): void {
  execFileSync('git', args, { cwd: repository, stdio: 'pipe' });
}

function createRepository(): string {
  const repository = mkdtempSync(join(tmpdir(), 'git-warp-path-guard-'));
  tempDirs.push(repository);
  git(repository, 'init', '--quiet');
  return repository;
}

function personalHome(...segments: readonly string[]): string {
  return ['', 'Users', 'example', ...segments].join('/');
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop();
    if (directory !== undefined) {
      rmSync(directory, { force: true, recursive: true });
    }
  }
});

describe('Git machine-local path guard', () => {
  it('scans exact staged blobs instead of mutable working-tree bytes', () => {
    const repository = createRepository();
    const fixturePath = join(repository, 'fixture.txt');
    writeFileSync(fixturePath, personalHome('git', 'project'), 'utf8');
    git(repository, 'add', 'fixture.txt');
    writeFileSync(fixturePath, 'portable content', 'utf8');

    const guard = new GitMachineLocalPathGuard(repository, new MachineLocalPathPolicy());

    expect(guard.findStagedPaths()).toEqual(['fixture.txt']);
    expect(guard.findWorkingTreePaths()).toEqual([]);
  });

  it('runs the exact-index scanner from the pre-commit hook', () => {
    const hook = readFileSync(hookPath, 'utf8');

    expect(hook).toContain('node scripts/check-machine-local-paths.ts --staged');
  });
});
