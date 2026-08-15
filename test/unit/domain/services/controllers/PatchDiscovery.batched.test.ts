import { describe, expect, it, vi } from 'vitest';

import { PatchDiscovery, type PatchDiscoveryHost } from '../../../../../src/domain/services/controllers/PatchDiscovery.ts';
import WarpStream from '../../../../../src/domain/stream/WarpStream.ts';
import PatchError from '../../../../../src/domain/errors/PatchError.ts';
import type { CorePersistence } from '../../../../../src/domain/types/WarpPersistence.ts';
import type { CommitLogChunk, LogNodesOptions, NodeInfo } from '../../../../../src/ports/CommitPort.ts';
import type CommitMessageCodecPort from '../../../../../src/ports/CommitMessageCodecPort.ts';
import type { PatchCommitMessage } from '../../../../../src/ports/CommitMessageCodecPort.ts';
import type PatchJournalPort from '../../../../../src/ports/PatchJournalPort.ts';
import type Patch from '../../../../../src/domain/types/Patch.ts';

/**
 * Spawn-count law for patch-chain traversal.
 *
 * Loading a chain of N patch commits must issue ONE bulk history read
 * (`logNodesStream`) instead of N per-commit `getNodeInfo` reads. On the
 * Git adapter every `getNodeInfo` call is a `git show` subprocess, so the
 * per-commit walk makes every materialization O(history × spawn latency).
 */

interface FakeCommit {
  sha: string;
  parents: string[];
  message: string;
}

/** Builds a linear chain: chain[0] is the tip, last element is the root. */
function linearChain(length: number, options: { rootKind?: string } = {}): FakeCommit[] {
  const commits: FakeCommit[] = [];
  for (let index = 0; index < length; index += 1) {
    const sha = shaFor(index);
    const parentSha = index + 1 < length ? shaFor(index + 1) : null;
    const isRoot = index === length - 1;
    const kind = isRoot && options.rootKind !== undefined ? options.rootKind : 'patch';
    commits.push({
      sha,
      parents: parentSha === null ? [] : [parentSha],
      message: `${kind}:${length - index}`,
    });
  }
  return commits;
}

function shaFor(index: number): string {
  return index.toString(16).padStart(40, 'a');
}

/** Formats commits the way GitLogParser expects logNodesStream records. */
function toLogStream(commits: FakeCommit[]): WarpStream<CommitLogChunk> {
  const records = commits.map(
    (commit) => `${commit.sha}\nAuthor <author@test>\n2026-08-15T00:00:00Z\n${commit.parents.join(' ')}\n${commit.message}`,
  );
  const joined = records.join('\0') + (records.length > 0 ? '\0' : '');
  return WarpStream.of<CommitLogChunk>(joined);
}

interface CountingPersistenceOptions {
  commits: FakeCommit[];
  omitLogNodesStream?: boolean;
}

interface CountingPersistence {
  persistence: CorePersistence;
  getNodeInfoCalls: () => number;
  logNodesStreamCalls: () => number;
}

function countingPersistence({ commits, omitLogNodesStream = false }: CountingPersistenceOptions): CountingPersistence {
  const bySha = new Map(commits.map((commit) => [commit.sha, commit]));
  let getNodeInfoCount = 0;
  let logNodesStreamCount = 0;

  const base = {
    async getNodeInfo(sha: string): Promise<NodeInfo> {
      getNodeInfoCount += 1;
      const commit = bySha.get(sha);
      if (commit === undefined) {
        throw new Error(`missing commit: ${sha}`);
      }
      return {
        sha: commit.sha,
        message: commit.message,
        author: 'Author <author@test>',
        date: '2026-08-15T00:00:00Z',
        parents: [...commit.parents],
      };
    },
    async readRef(_ref: string): Promise<string | null> {
      return commits[0]?.sha ?? null;
    },
    async listRefs(_prefix: string): Promise<string[]> {
      return [];
    },
  };

  const withStream = omitLogNodesStream
    ? base
    : {
        ...base,
        async logNodesStream(_options: LogNodesOptions): Promise<WarpStream<CommitLogChunk>> {
          logNodesStreamCount += 1;
          return toLogStream(commits);
        },
      };

  return {
    persistence: withStream as unknown as CorePersistence,
    getNodeInfoCalls: () => getNodeInfoCount,
    logNodesStreamCalls: () => logNodesStreamCount,
  };
}

/** Codec for `<kind>:<lamport>` fake messages. */
const fakeCodec = {
  detectKind(message: string): string {
    const kind = message.split(':')[0];
    return kind === 'patch' ? 'patch' : 'other';
  },
  decodePatch(message: string): PatchCommitMessage {
    const lamport = Number(message.split(':')[1]);
    return { kind: 'patch', lamport } as unknown as PatchCommitMessage;
  },
} as unknown as CommitMessageCodecPort;

function fakeJournal(): PatchJournalPort {
  return {
    async readPatch(message: PatchCommitMessage): Promise<Patch> {
      return { lamport: message.lamport, ops: [] } as unknown as Patch;
    },
  } as unknown as PatchJournalPort;
}

function hostWith(persistence: CorePersistence, journal: PatchJournalPort | null = fakeJournal()): PatchDiscoveryHost {
  return {
    _graphName: 'think',
    _persistence: persistence,
    _maxObservedLamport: 0,
    _logger: null,
    _patchJournal: journal,
    _commitMessageCodec: fakeCodec,
  };
}

describe('PatchDiscovery batched chain reads', () => {
  it('loads a patch chain with one bulk history read and zero per-commit reads', async () => {
    const commits = linearChain(50);
    const counting = countingPersistence({ commits });
    const discovery = new PatchDiscovery(hostWith(counting.persistence));

    const entries = await discovery.loadPatchChainFromSha(shaFor(0));

    expect(entries).toHaveLength(50);
    expect(entries[0]?.sha).toBe(shaFor(49));
    expect(entries[49]?.sha).toBe(shaFor(0));
    expect((entries[0]?.patch as unknown as { lamport: number }).lamport).toBe(1);
    expect(counting.logNodesStreamCalls()).toBe(1);
    expect(counting.getNodeInfoCalls()).toBe(0);
  });

  it('returns patches in chronological order identical to the per-commit walk', async () => {
    const commits = linearChain(7);
    const batched = countingPersistence({ commits });
    const legacy = countingPersistence({ commits, omitLogNodesStream: true });

    const batchedEntries = await new PatchDiscovery(hostWith(batched.persistence)).loadPatchChainFromSha(shaFor(0));
    const legacyEntries = await new PatchDiscovery(hostWith(legacy.persistence)).loadPatchChainFromSha(shaFor(0));

    expect(batchedEntries.map((entry) => entry.sha)).toEqual(legacyEntries.map((entry) => entry.sha));
  });

  it('stops at stopAtSha without reading past it', async () => {
    const commits = linearChain(10);
    const counting = countingPersistence({ commits });
    const discovery = new PatchDiscovery(hostWith(counting.persistence));

    const entries = await discovery.loadPatchChainFromSha(shaFor(0), shaFor(4));

    expect(entries.map((entry) => entry.sha)).toEqual([shaFor(3), shaFor(2), shaFor(1), shaFor(0)]);
  });

  it('stops at the first non-patch commit', async () => {
    const commits = linearChain(5, { rootKind: 'checkpoint' });
    const counting = countingPersistence({ commits });
    const discovery = new PatchDiscovery(hostWith(counting.persistence));

    const entries = await discovery.loadPatchChainFromSha(shaFor(0));

    expect(entries).toHaveLength(4);
    expect(entries.map((entry) => entry.sha)).not.toContain(shaFor(4));
  });

  it('throws E_MISSING_JOURNAL when the journal is absent and patches exist', async () => {
    const commits = linearChain(3);
    const counting = countingPersistence({ commits });
    const discovery = new PatchDiscovery(hostWith(counting.persistence, null));

    await expect(discovery.loadPatchChainFromSha(shaFor(0))).rejects.toThrowError(PatchError);
  });

  it('falls back to per-commit reads when the persistence lacks logNodesStream', async () => {
    const commits = linearChain(6);
    const counting = countingPersistence({ commits, omitLogNodesStream: true });
    const discovery = new PatchDiscovery(hostWith(counting.persistence));

    const entries = await discovery.loadPatchChainFromSha(shaFor(0));

    expect(entries).toHaveLength(6);
    expect(counting.getNodeInfoCalls()).toBe(6);
  });

  it('preserves journal read order oldest-first regardless of read concurrency', async () => {
    const commits = linearChain(20);
    const counting = countingPersistence({ commits });
    const resolved: number[] = [];
    const journal = {
      async readPatch(message: PatchCommitMessage): Promise<Patch> {
        await new Promise((resolve) => setTimeout(resolve, (message.lamport % 3) * 2));
        resolved.push(message.lamport);
        return { lamport: message.lamport, ops: [] } as unknown as Patch;
      },
    } as unknown as PatchJournalPort;
    const discovery = new PatchDiscovery(hostWith(counting.persistence, journal));

    const entries = await discovery.loadPatchChainFromSha(shaFor(0));

    expect(entries.map((entry) => (entry.patch as unknown as { lamport: number }).lamport)).toEqual(
      Array.from({ length: 20 }, (_unused, index) => index + 1),
    );
    expect(resolved).toHaveLength(20);
  });

  it('discovers ticks with one bulk history read per writer', async () => {
    const commits = linearChain(30);
    const counting = countingPersistence({ commits });
    const persistence = counting.persistence as unknown as {
      listRefs(prefix: string): Promise<string[]>;
    };
    persistence.listRefs = vi.fn(async (prefix: string) => [`${prefix}writer-a`]);
    const discovery = new PatchDiscovery(hostWith(counting.persistence));

    const result = await discovery.discoverTicks();

    expect(result.maxTick).toBe(30);
    expect(result.perWriter.get('writer-a')?.ticks).toHaveLength(30);
    expect(counting.logNodesStreamCalls()).toBe(1);
    expect(counting.getNodeInfoCalls()).toBe(0);
  });
});
