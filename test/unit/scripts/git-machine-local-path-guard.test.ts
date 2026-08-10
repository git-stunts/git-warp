import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { GitMachineLocalPathGuard } from '../../../scripts/GitMachineLocalPathGuard.ts';
import { MachineLocalPathPolicy } from '../../../scripts/MachineLocalPathPolicy.ts';

const hookPath = fileURLToPath(new URL('../../../scripts/hooks/pre-commit', import.meta.url));
const ciPath = fileURLToPath(new URL('../../../.github/workflows/ci.yml', import.meta.url));
const tempDirs: string[] = [];

function git(repository: string, ...args: readonly string[]): void {
  execFileSync('git', args, { cwd: repository, stdio: 'pipe' });
}

function gitText(repository: string, ...args: readonly string[]): string {
  return execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim();
}

function createRepository(): string {
  const repository = mkdtempSync(join(tmpdir(), 'git-warp-path-guard-'));
  tempDirs.push(repository);
  git(repository, 'init', '--quiet');
  git(repository, 'config', 'user.name', 'Path Guard Test');
  git(repository, 'config', 'user.email', 'path-guard@example.invalid');
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

  it('detects machine-local paths embedded in binary blobs', () => {
    const repository = createRepository();
    const fixturePath = join(repository, 'fixture.bin');
    const fixture = Buffer.concat([
      Buffer.from([0]),
      Buffer.from(personalHome('build', 'artifact'), 'utf8'),
      Buffer.from([0]),
    ]);
    writeFileSync(fixturePath, fixture);
    git(repository, 'add', 'fixture.bin');

    const guard = new GitMachineLocalPathGuard(repository, new MachineLocalPathPolicy());

    expect(guard.findWorkingTreePaths()).toEqual(['fixture.bin']);
    expect(guard.findStagedPaths()).toEqual(['fixture.bin']);
  });

  it('finds leaked objects even when a later commit makes the branch tip safe', () => {
    const repository = createRepository();
    const fixturePath = join(repository, 'fixture.txt');
    writeFileSync(fixturePath, 'portable base', 'utf8');
    git(repository, 'add', 'fixture.txt');
    git(repository, 'commit', '--quiet', '-m', 'safe base');
    const remoteObject = gitText(repository, 'rev-parse', 'HEAD');

    writeFileSync(fixturePath, personalHome('git', 'project'), 'utf8');
    git(repository, 'add', 'fixture.txt');
    git(repository, 'commit', '--quiet', '-m', 'unsafe middle');
    const leakedBlob = gitText(repository, 'rev-parse', 'HEAD:fixture.txt');

    writeFileSync(fixturePath, 'portable tip', 'utf8');
    git(repository, 'add', 'fixture.txt');
    git(repository, 'commit', '--quiet', '-m', 'safe tip');
    const localObject = gitText(repository, 'rev-parse', 'HEAD');
    const pushUpdate = `refs/heads/main ${localObject} refs/heads/main ${remoteObject}\n`;
    const guard = new GitMachineLocalPathGuard(repository, new MachineLocalPathPolicy());

    expect(guard.findOutgoingObjects(pushUpdate, 'origin')).toContain(`blob:${leakedBlob}`);
  });

  it('runs the exact outgoing-object scanner from the pre-push hook', () => {
    const hookPath = fileURLToPath(new URL('../../../scripts/hooks/pre-push', import.meta.url));
    const hook = readFileSync(hookPath, 'utf8');

    expect(hook).toContain('node scripts/check-machine-local-paths.ts --pre-push "$REMOTE_NAME"');
  });

  it('scans an exact committed tree instead of mutable working-tree bytes', () => {
    const repository = createRepository();
    const fixturePath = join(repository, 'fixture.txt');
    writeFileSync(fixturePath, personalHome('git', 'project'), 'utf8');
    git(repository, 'add', 'fixture.txt');
    git(repository, 'commit', '--quiet', '-m', 'committed leak');
    const committedObject = gitText(repository, 'rev-parse', 'HEAD');
    writeFileSync(fixturePath, 'portable working tree', 'utf8');

    const guard = new GitMachineLocalPathGuard(repository, new MachineLocalPathPolicy());

    expect(guard.findTreePaths(committedObject)).toEqual(['fixture.txt']);
    expect(guard.findWorkingTreePaths()).toEqual([]);
  });

  it('makes exact-tree path hygiene a dedicated required CI lane', () => {
    const workflow = readFileSync(ciPath, 'utf8');

    expect(workflow).toContain('type-firewall-path-hygiene:');
    expect(workflow).toContain('node scripts/check-machine-local-paths.ts --tree "$GITHUB_SHA"');
    expect(workflow).toContain('- type-firewall-path-hygiene');
    expect(workflow).toContain("needs['type-firewall-path-hygiene'].result");
  });
});
