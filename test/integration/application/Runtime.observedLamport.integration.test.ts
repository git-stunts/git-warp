import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Plumbing from '@git-stunts/plumbing';
import ContentAddressableStore from '@git-stunts/git-cas';
import GitCasAssetStorageAdapter from '../../../src/infrastructure/adapters/GitCasAssetStorageAdapter.ts';
import { CborPatchJournalAdapter } from '../../../src/infrastructure/adapters/CborPatchJournalAdapter.ts';
import codec from '../../../src/infrastructure/codecs/CborCodec.ts';
import Patch from '../../../src/domain/types/Patch.ts';
import VersionVector from '../../../src/domain/crdt/VersionVector.ts';
import { describe, expect, it, vi } from 'vitest';
import { Runtime } from '../../../index.ts';
import { intent } from '../../../advanced.ts';
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

async function retainedWriterPatch(repository: GitRepoFixture, writer: string): Promise<Readonly<{ sha: string; patch: Patch }>> {
  const sha = await repository.persistence.readRef('refs/warp/L/writers/' + writer);
  if (sha === null) { throw new Error('Expected writer publication'); }
  const cas = ContentAddressableStore.createCbor({ plumbing: repository.plumbing, applicationRefPrefixes: ['refs/warp/'] });
  try {
    const journal = new CborPatchJournalAdapter({
      assetStorage: new GitCasAssetStorageAdapter({ cas }), cas, codec,
      commitReader: repository.persistence, graph: 'L',
    });
    const patch = await journal.readPatch(decodePatchMessage(await repository.persistence.showNode(sha)));
    return Object.freeze({ sha, patch });
  } finally { await cas.close(); }
}

function repair(repository: GitRepoFixture): void {
  execFileSync(process.execPath, [CLI, 'repair', '--repo', repository.tempDir,
    '--lane', 'L', '--writer', 'maintenance', '--action', 'materialization'], {
    timeout: CHILD_TIMEOUT_MS, stdio: 'pipe',
  });
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
      const observed = await retainedWriterPatch(repository, 'a');
      writerProcess(repository, 'b', 'write', 'B');
      const published = await retainedWriterPatch(repository, 'b');
      expect(published.patch.lamport).toBeGreaterThan(observed.patch.lamport);
      expect(published.patch.observedFrontier?.frontier()).toEqual(new Map([['a', observed.sha]]));
      expect(VersionVector.from(published.patch.context).get('a'))
        .toBe(VersionVector.from(observed.patch.context).get('a'));
      expect(VersionVector.from(published.patch.context).get('a')).not.toBe(observed.patch.lamport);
      repair(repository);
      writerProcess(repository, 'reader', 'observe', 'B');
      writerProcess(repository, 'b', 'write', 'B-again');
      const subsequent = await retainedWriterPatch(repository, 'b');
      expect(subsequent.patch.lamport).toBeGreaterThan(published.patch.lamport);
      expect(subsequent.patch.observedFrontier?.frontier().get('b')).toBe(published.sha);
      expect(VersionVector.from(subsequent.patch.context).get('a'))
        .toBe(VersionVector.from(published.patch.context).get('a'));
      repair(repository);
      writerProcess(repository, 'reader', 'observe', 'B-again');
    } finally {
      await repository.cleanup();
    }
  }, TEST_TIMEOUT_MS);
});

describe('unseen replicas keep independent histories', () => {
  it.each(['sha1', 'sha256'])('resolves three writers consistently after reverse fetch in %s', async format => {
    if (format !== 'sha1' && format !== 'sha256') { throw new Error('Unsupported fixture object format'); }
    const sources: GitRepoFixture[] = [];
    const receivers: GitRepoFixture[] = [];
    try {
      for (const writer of ['a', 'b', 'c']) {
        const source = await repositoryFor(format);
        sources.push(source);
        writerProcess(source, writer, 'independent', writer.toUpperCase());
        const stored = await retainedWriterPatch(source, writer);
        expect(stored.patch.lamport).toBe(2);
        expect(VersionVector.serialize(VersionVector.from(stored.patch.context))).toEqual({ [writer]: 1 });
        expect(stored.patch.observedFrontier?.heads.map(head => head.writerId)).toEqual([writer]);
      }
      for (const order of [[0, 1, 2], [2, 1, 0]]) {
        const receiver = await repositoryFor(format);
        receivers.push(receiver);
        writerProcess(receiver, 'maintenance', 'initialize', 'unused');
        for (const index of order) {
          const source = sources[index];
          const writer = ['a', 'b', 'c'][index];
          if (source === undefined || writer === undefined) { throw new Error('Missing independent source'); }
          execFileSync('git', ['-C', receiver.tempDir, 'fetch', '--no-tags', source.tempDir,
            'refs/warp/L/writers/' + writer + ':refs/warp/L/writers/' + writer], {
            timeout: CHILD_TIMEOUT_MS, stdio: 'pipe',
          });
        }
        repair(receiver);
        writerProcess(receiver, 'reader', 'observe', 'C');
      }
    } finally {
      for (const repo of [...receivers, ...sources]) { await repo.cleanup(); }
    }
  }, TEST_TIMEOUT_MS);
});


describe('simultaneous same-writer observation captures', () => {
  it.each(['sha1', 'sha256'])('publishes exactly one winner from the same absent predecessor in %s', async format => {
    if (format !== 'sha1' && format !== 'sha256') { throw new Error('Unsupported fixture object format'); }
    const repository = await repositoryFor(format);
    const first = await Runtime.open({ at: repository.tempDir, writer: 'b' });
    const second = await Runtime.open({ at: repository.tempDir, writer: 'b' });
    try {
      const left = await first.lane('L');
      const right = await second.lane('L');
      const original = GitTimelineHistoryAdapter.prototype.readRef;
      let release = (): void => {};
      const bothCaptured = new Promise<void>(resolve => { release = resolve; });
      let captures = 0;
      const spy = vi.spyOn(GitTimelineHistoryAdapter.prototype, 'readRef').mockImplementation(async function (this: GitTimelineHistoryAdapter, ref) {
        const current = await original.call(this, ref);
        if (ref === 'refs/warp/L/writers/b' && current === null && captures < 2) {
          captures++;
          if (captures === 2) { release(); }
          await bothCaptured;
        }
        return current;
      });
      try {
        const receipts = await Promise.all([
          left.write(intent.node.add({ subject: 'left' })),
          right.write(intent.node.add({ subject: 'right' })),
        ]);
        expect(captures).toBe(2);
        expect(receipts.filter(receipt => receipt.outcome.kind === 'derived')).toHaveLength(1);
        expect(receipts.filter(receipt => receipt.outcome.kind === 'obstruction')).toHaveLength(1);
        const stored = await retainedWriterPatch(repository, 'b');
        expect(stored.patch.observedFrontier?.heads).toEqual([]);
        expect(stored.patch.ops).toHaveLength(1);
      } finally { spy.mockRestore(); }
    } finally {
      await first.close();
      await second.close();
      await repository.cleanup();
    }
  }, TEST_TIMEOUT_MS);
});
