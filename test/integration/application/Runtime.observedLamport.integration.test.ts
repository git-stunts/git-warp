import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Plumbing from '@git-stunts/plumbing';
import { describe, expect, it } from 'vitest';
import GitTimelineHistoryAdapter from '../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import { decodePatchMessage } from '../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import { GitRepoFixture } from '../../helpers/WarpGraphTestRepositories.ts';

const CHILD_TIMEOUT_MS = 60_000;
const TEST_TIMEOUT_MS = 120_000;
const WRITER_PROCESS = fileURLToPath(new URL('./fixtures/ObservedWriterProcess.ts', import.meta.url));
const CLI = fileURLToPath(new URL('../../../dist/bin/git-warp.js', import.meta.url));

async function repositoryFor(format: 'sha1' | 'sha256'): Promise<GitRepoFixture> {
  const directory = await mkdtemp(join(tmpdir(), 'observed-lamport-'));
  try {
    const plumbing = await Plumbing.createDefault({ cwd: directory });
    await plumbing.execute({ args: ['init', `--object-format=${format}`] });
    await plumbing.execute({ args: ['config', 'user.email', 'test@example.invalid'] });
    await plumbing.execute({ args: ['config', 'user.name', 'Observed writer test'] });
    return new GitRepoFixture(directory, plumbing, new GitTimelineHistoryAdapter({ plumbing }));
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

function writerProcess(repository: GitRepoFixture, writer: string, mode: string, expected: string): void {
  execFileSync(process.execPath, [WRITER_PROCESS, repository.tempDir, writer, mode, expected], {
    timeout: CHILD_TIMEOUT_MS, stdio: 'pipe',
  });
}

async function writerLamport(repository: GitRepoFixture, writer: string): Promise<number> {
  const tip = await repository.persistence.readRef(`refs/warp/L/writers/${writer}`);
  if (tip === null) { throw new Error(`Writer ${writer} did not publish a patch`); }
  return decodePatchMessage(await repository.persistence.showNode(tip)).lamport;
}

describe('observed writer Lamports across real process restart', () => {
  it.each(['sha1', 'sha256'])('publishes above an observed remote chain in %s', async (format) => {
    if (format !== 'sha1' && format !== 'sha256') { throw new Error('Unsupported fixture object format'); }
    const repository = await repositoryFor(format);
    try {
      writerProcess(repository, 'a', 'seed', 'A19');
      execFileSync(process.execPath, [CLI, 'repair', '--repo', repository.tempDir,
        '--lane', 'L', '--writer', 'maintenance', '--action', 'materialization'], {
        timeout: CHILD_TIMEOUT_MS, stdio: 'pipe',
      });
      writerProcess(repository, 'b', 'observe', 'A19');
      const observedLamport = await writerLamport(repository, 'a');
      writerProcess(repository, 'b', 'write', 'B');
      expect(await writerLamport(repository, 'b')).toBeGreaterThan(observedLamport);
      writerProcess(repository, 'reader', 'observe', 'B');
    } finally {
      await repository.cleanup();
    }
  }, TEST_TIMEOUT_MS);
});
