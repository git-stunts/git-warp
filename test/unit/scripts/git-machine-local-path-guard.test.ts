import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { GitBatchReadWindow } from '../../../scripts/GitBatchReadWindow.ts';
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

  it('scans an exact committed tree instead of mutable working-tree bytes', async () => {
    const repository = createRepository();
    const fixturePath = join(repository, 'fixture.txt');
    writeFileSync(fixturePath, personalHome('git', 'project'), 'utf8');
    git(repository, 'add', 'fixture.txt');
    git(repository, 'commit', '--quiet', '-m', 'committed leak');
    const committedObject = gitText(repository, 'rev-parse', 'HEAD');
    writeFileSync(fixturePath, 'portable working tree', 'utf8');

    const guard = new GitMachineLocalPathGuard(repository, new MachineLocalPathPolicy());

    await expect(guard.findTreePaths(committedObject)).resolves.toEqual(['fixture.txt']);
    expect(guard.findWorkingTreePaths()).toEqual([]);
  });

  it('bounds exact-tree scan memory independently of aggregate blob bytes', async () => {
    const repository = createRepository();
    writeFileSync(join(repository, 'first.txt'), 'portable first payload', 'utf8');
    writeFileSync(join(repository, 'second.txt'), 'portable second payload', 'utf8');
    git(repository, 'add', 'first.txt', 'second.txt');
    git(repository, 'commit', '--quiet', '-m', 'clean aggregate');
    const committedObject = gitText(repository, 'rev-parse', 'HEAD');
    const guard = new GitMachineLocalPathGuard(
      repository,
      new MachineLocalPathPolicy(),
      new GitBatchReadWindow(5)
    );

    await expect(guard.findTreePaths(committedObject)).resolves.toEqual([]);
  });

  it('accepts an exact empty tree without spawning a blob batch', async () => {
    const repository = createRepository();
    git(repository, 'commit', '--allow-empty', '--quiet', '-m', 'empty tree');
    const committedObject = gitText(repository, 'rev-parse', 'HEAD');
    const guard = new GitMachineLocalPathGuard(repository, new MachineLocalPathPolicy());

    await expect(guard.findTreePaths(committedObject)).resolves.toEqual([]);
  });

  it('detects a machine-local path split across exact-tree read windows', async () => {
    const repository = createRepository();
    writeFileSync(join(repository, 'fixture.txt'), personalHome('build', 'artifact'), 'utf8');
    git(repository, 'add', 'fixture.txt');
    git(repository, 'commit', '--quiet', '-m', 'split leak');
    const committedObject = gitText(repository, 'rev-parse', 'HEAD');
    const guard = new GitMachineLocalPathGuard(
      repository,
      new MachineLocalPathPolicy(),
      new GitBatchReadWindow(3)
    );

    await expect(guard.findTreePaths(committedObject)).resolves.toEqual(['fixture.txt']);
  });

  it('preserves binary blob and symlink target inspection for exact trees', async () => {
    const repository = createRepository();
    const binary = Buffer.concat([
      Buffer.from([0xff, 0]),
      Buffer.from(personalHome('build', 'artifact'), 'utf8'),
      Buffer.from([0]),
    ]);
    writeFileSync(join(repository, 'fixture.bin'), binary);
    symlinkSync(personalHome('git', 'project'), join(repository, 'fixture.link'));
    git(repository, 'add', 'fixture.bin', 'fixture.link');
    git(repository, 'commit', '--quiet', '-m', 'binary and symlink leaks');
    const committedObject = gitText(repository, 'rev-parse', 'HEAD');
    const guard = new GitMachineLocalPathGuard(repository, new MachineLocalPathPolicy());

    await expect(guard.findTreePaths(committedObject)).resolves.toEqual([
      'fixture.bin',
      'fixture.link',
    ]);
  });

  it('makes exact-tree path hygiene a dedicated required CI lane', () => {
    const workflow = readFileSync(ciPath, 'utf8');

    expect(workflow).toContain('type-firewall-path-hygiene:');
    expect(workflow).toContain('node scripts/check-machine-local-paths.ts --tree "$GITHUB_SHA"');
    expect(workflow).toContain('- type-firewall-path-hygiene');
    expect(workflow).toContain("needs['type-firewall-path-hygiene'].result");
  });
});
