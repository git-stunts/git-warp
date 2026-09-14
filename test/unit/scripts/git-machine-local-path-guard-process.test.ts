import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const spawnBehavior = vi.hoisted(() => ({ current: 'nonzero-exit' }));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: () => {
      if (spawnBehavior.current === 'spawn-error') {
        return actual.spawn('git-warp-deliberately-missing-executable');
      }
      const script = spawnBehavior.current === 'nonzero-exit'
        ? [
            "let input = '';",
            "process.stdin.setEncoding('utf8');",
            "process.stdin.on('data', (chunk) => { input += chunk; });",
            "process.stdin.on('end', () => {",
            "  const objectId = input.trim().split('\\n')[0];",
            "  process.stdout.write(`${objectId} blob 8\\nportable\\n`, () => {",
            '    process.exitCode = 7;',
            '  });',
            '});',
          ].join('\n')
        : spawnBehavior.current === 'silent-hanging'
          ? [
              "process.stdin.on('end', () => {",
              '  setInterval(() => undefined, 1_000);',
              '});',
              'process.stdin.resume();',
            ].join('\n')
          : [
            "process.stdin.on('end', () => {",
            "  process.stdout.write('malformed\\n');",
            '  setInterval(() => undefined, 1_000);',
            '});',
            'process.stdin.resume();',
          ].join('\n');
      return actual.spawn(process.execPath, ['-e', script]);
    },
  };
});

import { GitBatchReadWindow } from '../../../scripts/GitBatchReadWindow.ts';
import { GitBatchScanDeadline } from '../../../scripts/GitBatchScanDeadline.ts';
import { GitMachineLocalPathGuard } from '../../../scripts/GitMachineLocalPathGuard.ts';
import { MachineLocalPathPolicy } from '../../../scripts/MachineLocalPathPolicy.ts';

const tempDirs: string[] = [];

function gitText(repository: string, ...args: readonly string[]): string {
  return execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim();
}

function createCommittedRepository(): string {
  const repository = mkdtempSync(join(tmpdir(), 'git-warp-batch-process-'));
  tempDirs.push(repository);
  execFileSync('git', ['init', '--quiet'], { cwd: repository });
  execFileSync('git', ['config', 'user.name', 'Batch Process Test'], { cwd: repository });
  execFileSync('git', ['config', 'user.email', 'batch-process@example.invalid'], {
    cwd: repository,
  });
  writeFileSync(join(repository, 'fixture.txt'), 'portable', 'utf8');
  execFileSync('git', ['add', 'fixture.txt'], { cwd: repository });
  execFileSync('git', ['commit', '--quiet', '-m', 'portable fixture'], { cwd: repository });
  return repository;
}

afterEach(() => {
  spawnBehavior.current = 'nonzero-exit';
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop();
    if (directory !== undefined) {
      rmSync(directory, { force: true, recursive: true });
    }
  }
});

describe('Git machine-local path guard batch process', () => {
  it('fails closed when a complete batch exits nonzero', async () => {
    const repository = createCommittedRepository();
    const revision = gitText(repository, 'rev-parse', 'HEAD');
    const guard = new GitMachineLocalPathGuard(repository, new MachineLocalPathPolicy());

    await expect(guard.findTreePaths(revision)).rejects.toThrow(
      'git cat-file --batch failed with exit 7'
    );
  });

  it('kills a still-running batch producer after malformed output', async () => {
    spawnBehavior.current = 'malformed-hanging';
    const repository = createCommittedRepository();
    const revision = gitText(repository, 'rev-parse', 'HEAD');
    const guard = new GitMachineLocalPathGuard(repository, new MachineLocalPathPolicy());

    await expect(guard.findTreePaths(revision)).rejects.toThrow('malformed batch blob header');
  });

  it('contains a spawn error while the stream parser fails closed', async () => {
    spawnBehavior.current = 'spawn-error';
    const repository = createCommittedRepository();
    const revision = gitText(repository, 'rev-parse', 'HEAD');
    const guard = new GitMachineLocalPathGuard(repository, new MachineLocalPathPolicy());

    await expect(guard.findTreePaths(revision)).rejects.toThrow();
  });

  it('terminates a silent batch producer at the configured deadline', async () => {
    spawnBehavior.current = 'silent-hanging';
    const repository = createCommittedRepository();
    const revision = gitText(repository, 'rev-parse', 'HEAD');
    const guard = new GitMachineLocalPathGuard(
      repository,
      new MachineLocalPathPolicy(),
      GitBatchReadWindow.standard(),
      new GitBatchScanDeadline(100)
    );

    await expect(guard.findTreePaths(revision)).rejects.toThrow(
      'git cat-file --batch scan exceeded 100 ms deadline'
    );
  });

  it('rejects invalid batch scan deadlines', () => {
    expect(() => new GitBatchScanDeadline(0)).toThrow('positive safe integer');
    expect(() => new GitBatchScanDeadline(Number.NaN)).toThrow('positive safe integer');
  });
});
