import { describe, expect, it } from 'vitest';

import {
  CHAIN_LOG_FORMAT,
  PatchDiscovery,
  type PatchDiscoveryHost,
} from '../../../../../src/domain/services/controllers/PatchDiscovery.ts';
import WarpStream from '../../../../../src/domain/stream/WarpStream.ts';
import PatchError from '../../../../../src/domain/errors/PatchError.ts';
import Patch from '../../../../../src/domain/types/Patch.ts';
import AssetHandle from '../../../../../src/domain/storage/AssetHandle.ts';
import CommitMessageCodecPort, {
  createGitCasPatchStorage,
  type AnchorCommitMessage,
  type CheckpointCommitMessage,
  type CommitMessageKind,
  type PatchCommitMessage,
} from '../../../../../src/ports/CommitMessageCodecPort.ts';
import PatchJournalPort, {
  type AppendPatchRequest,
  type PublishedPatch,
} from '../../../../../src/ports/PatchJournalPort.ts';
import type PatchEntry from '../../../../../src/domain/artifacts/PatchEntry.ts';
import type { CorePersistence } from '../../../../../src/domain/types/WarpPersistence.ts';
import LoggerPort from '../../../../../src/ports/LoggerPort.ts';
import type {
  CommitLogChunk,
  CommitNodeOptions,
  LogNodesOptions,
  NodeInfo,
  PingResult,
} from '../../../../../src/ports/CommitPort.ts';

/**
 * Spawn-count law for patch-chain traversal.
 *
 * Loading a chain of N patch commits must issue ONE bulk history read
 * (`logNodesStream`) instead of N per-commit `getNodeInfo` reads. On the
 * Git adapter every `getNodeInfo` call is a `git show` subprocess, so the
 * per-commit walk makes every materialization O(history × spawn latency).
 */

const TEST_GRAPH = 'think';
const TEST_WRITER = 'writer-a';
const UNIMPLEMENTED = 'not implemented in this test double';

type FakeCommit = {
  sha: string;
  parents: string[];
  message: string;
};

function shaFor(index: number): string {
  return index.toString(16).padStart(40, 'a');
}

/** Builds a linear chain: chain[0] is the tip, last element is the root. */
function linearChain(length: number, options: { rootKind?: string } = {}): FakeCommit[] {
  const commits: FakeCommit[] = [];
  for (let index = 0; index < length; index += 1) {
    const parentSha = index + 1 < length ? shaFor(index + 1) : null;
    const isRoot = index === length - 1;
    const kind = isRoot && options.rootKind !== undefined ? options.rootKind : 'patch';
    commits.push({
      sha: shaFor(index),
      parents: parentSha === null ? [] : [parentSha],
      message: `${kind}:${length - index}`,
    });
  }
  return commits;
}

/** Formats commits the way GitLogParser expects logNodesStream records. */
function toLogStream(commits: FakeCommit[]): WarpStream<CommitLogChunk> {
  const records = commits.map(
    (commit) =>
      `${commit.sha}\nAuthor <author@test>\n2026-08-15T00:00:00Z\n${commit.parents.join(' ')}\n${commit.message}`,
  );
  const joined = records.join('\0') + (records.length > 0 ? '\0' : '');
  return WarpStream.of<CommitLogChunk>(joined);
}

function patchMessageFor(lamport: number): PatchCommitMessage {
  return {
    kind: 'patch',
    graph: TEST_GRAPH,
    writer: TEST_WRITER,
    lamport,
    schema: 2,
    patchHandle: new AssetHandle(`asset-${lamport}`),
    storage: createGitCasPatchStorage({ encrypted: false }),
  };
}

function patchFor(lamport: number): Patch {
  return new Patch({ writer: TEST_WRITER, lamport, context: {}, ops: [] });
}

/** Codec for `<kind>:<lamport>` fake messages. */
class FakeCodec extends CommitMessageCodecPort {
  detectKind(message: string): CommitMessageKind | null {
    return message.split(':')[0] === 'patch' ? 'patch' : 'checkpoint';
  }

  decodePatch(message: string): PatchCommitMessage {
    return patchMessageFor(Number(message.split(':')[1]));
  }

  encodePatch(_message: PatchCommitMessage): string {
    throw new Error(UNIMPLEMENTED);
  }

  encodeCheckpoint(_message: CheckpointCommitMessage): string {
    throw new Error(UNIMPLEMENTED);
  }

  decodeCheckpoint(_message: string): CheckpointCommitMessage {
    throw new Error(UNIMPLEMENTED);
  }

  encodeAnchor(_message: AnchorCommitMessage): string {
    throw new Error(UNIMPLEMENTED);
  }

  decodeAnchor(_message: string): AnchorCommitMessage {
    throw new Error(UNIMPLEMENTED);
  }
}

type ReadPatchHook = (message: PatchCommitMessage) => Promise<Patch>;

class FakeJournal extends PatchJournalPort {
  readonly reads: number[] = [];
  readonly #hook: ReadPatchHook | null;

  constructor(hook: ReadPatchHook | null = null) {
    super();
    this.#hook = hook;
  }

  async readPatch(message: PatchCommitMessage): Promise<Patch> {
    if (this.#hook !== null) {
      const patch = await this.#hook(message);
      this.reads.push(message.lamport);
      return patch;
    }
    this.reads.push(message.lamport);
    return patchFor(message.lamport);
  }

  appendPatch(_request: AppendPatchRequest): Promise<PublishedPatch> {
    throw new Error(UNIMPLEMENTED);
  }

  scanPatchRange(_writerId: string, _fromSha: string | null, _toSha: string): WarpStream<PatchEntry> {
    throw new Error(UNIMPLEMENTED);
  }
}

type FakePersistenceOptions = {
  commits: FakeCommit[];
  /** Simulates a persistence whose bulk history surface is unusable. */
  logStreamFailure?: 'omit' | 'reject';
  /** SHAs deliberately withheld from the bulk read to force per-commit fallback. */
  withholdFromBulk?: readonly string[];
  writerRefs?: readonly string[];
};

class FakePersistence implements CorePersistence {
  getNodeInfoCalls = 0;
  logNodesStreamCalls = 0;
  bulkRecordsEmitted = 0;
  lastLogOptions: LogNodesOptions | null = null;

  readonly #commits: FakeCommit[];
  readonly #bySha: Map<string, FakeCommit>;
  readonly #logStreamFailure: 'omit' | 'reject' | null;
  readonly #withheld: ReadonlySet<string>;
  readonly #writerRefs: readonly string[];

  constructor({
    commits,
    logStreamFailure,
    withholdFromBulk = [],
    writerRefs = [],
  }: FakePersistenceOptions) {
    this.#commits = commits;
    this.#bySha = new Map(commits.map((commit) => [commit.sha, commit]));
    this.#logStreamFailure = logStreamFailure ?? null;
    this.#withheld = new Set(withholdFromBulk);
    this.#writerRefs = writerRefs;
  }

  async getNodeInfo(sha: string): Promise<NodeInfo> {
    this.getNodeInfoCalls += 1;
    const commit = this.#bySha.get(sha);
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
  }

  async logNodesStream(options: LogNodesOptions): Promise<WarpStream<CommitLogChunk>> {
    this.logNodesStreamCalls += 1;
    this.lastLogOptions = options;
    if (this.#logStreamFailure === 'omit') {
      throw new TypeError('persistence.logNodesStream is not a function');
    }
    if (this.#logStreamFailure === 'reject') {
      throw new Error('bulk history read failed');
    }
    const emitted = this.#visibleCommits(options);
    this.bulkRecordsEmitted = emitted.length;
    return toLogStream(emitted);
  }

  /**
   * Applies the LogNodesOptions contract this double is asked to honour.
   *
   * A double that ignored `stopAt` would let an unbounded read pass review, so
   * it implements the same range semantics as a conforming persistence.
   */
  #visibleCommits(options: LogNodesOptions): FakeCommit[] {
    const available = this.#commits.filter((commit) => !this.#withheld.has(commit.sha));
    const stopAt = options.stopAt;
    if (stopAt === undefined) {
      return available;
    }
    const excluded = new Set<string>();
    const queue = [stopAt];
    while (queue.length > 0) {
      const sha = queue.shift();
      if (sha === undefined || excluded.has(sha)) {
        continue;
      }
      excluded.add(sha);
      const commit = available.find((candidate) => candidate.sha === sha);
      if (commit !== undefined) {
        queue.push(...commit.parents);
      }
    }
    return available.filter((commit) => !excluded.has(commit.sha));
  }

  async readRef(_ref: string): Promise<string | null> {
    return this.#commits[0]?.sha ?? null;
  }

  async listRefs(prefix: string): Promise<string[]> {
    return this.#writerRefs.map((writer) => `${prefix}${writer}`);
  }

  commitNode(_options: CommitNodeOptions): Promise<string> {
    throw new Error(UNIMPLEMENTED);
  }

  showNode(_sha: string): Promise<string> {
    throw new Error(UNIMPLEMENTED);
  }

  logNodes(_options: LogNodesOptions): Promise<string> {
    throw new Error(UNIMPLEMENTED);
  }

  countNodes(_ref: string): Promise<number> {
    throw new Error(UNIMPLEMENTED);
  }

  nodeExists(_sha: string): Promise<boolean> {
    throw new Error(UNIMPLEMENTED);
  }

  ping(): Promise<PingResult> {
    throw new Error(UNIMPLEMENTED);
  }

  updateRef(_ref: string, _oid: string): Promise<void> {
    throw new Error(UNIMPLEMENTED);
  }

  deleteRef(_ref: string): Promise<void> {
    throw new Error(UNIMPLEMENTED);
  }

  compareAndSwapRef(_ref: string, _newOid: string, _expectedOid: string | null): Promise<void> {
    throw new Error(UNIMPLEMENTED);
  }
}

function hostWith(
  persistence: CorePersistence,
  journal: PatchJournalPort | null = new FakeJournal(),
  logger: LoggerPort | null = null,
): PatchDiscoveryHost {
  return {
    _graphName: TEST_GRAPH,
    _persistence: persistence,
    _maxObservedLamport: 0,
    _logger: logger,
    _patchJournal: journal,
    _commitMessageCodec: new FakeCodec(),
  };
}

/** Captures warn() calls so a silent fallback can be asserted against. */
class RecordingLogger extends LoggerPort {
  readonly warnings: string[] = [];

  override warn(message: string): void {
    this.warnings.push(message);
  }

  override debug(): void { /* unused by these tests */ }
  override info(): void { /* unused by these tests */ }
  override error(): void { /* unused by these tests */ }

  override child(): LoggerPort {
    return this;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe('PatchDiscovery batched chain reads', () => {
  it('loads a patch chain with one bulk history read and zero per-commit reads', async () => {
    const persistence = new FakePersistence({ commits: linearChain(50) });
    const discovery = new PatchDiscovery(hostWith(persistence));

    const entries = await discovery.loadPatchChainFromSha(shaFor(0));

    expect(entries).toHaveLength(50);
    expect(entries[0]?.sha).toBe(shaFor(49));
    expect(entries[49]?.sha).toBe(shaFor(0));
    expect(entries[0]?.patch.lamport).toBe(1);
    expect(persistence.logNodesStreamCalls).toBe(1);
    expect(persistence.getNodeInfoCalls).toBe(0);
  });

  it('requests the bulk history read with the chain log format', async () => {
    const persistence = new FakePersistence({ commits: linearChain(4) });
    const discovery = new PatchDiscovery(hostWith(persistence));

    await discovery.loadPatchChainFromSha(shaFor(0));

    expect(persistence.lastLogOptions?.ref).toBe(shaFor(0));
    expect(persistence.lastLogOptions?.format).toBe(CHAIN_LOG_FORMAT);
  });

  it('requests first-parent traversal so merge side branches are never read', async () => {
    const persistence = new FakePersistence({ commits: linearChain(4) });
    const discovery = new PatchDiscovery(hostWith(persistence));

    await discovery.loadPatchChainFromSha(shaFor(0));

    expect(persistence.lastLogOptions?.firstParent).toBe(true);
  });

  it('excludes side-parent commits when a chain commit is a merge', async () => {
    // shaFor(1) is a merge: first parent shaFor(2) continues the chain, and
    // sideSha is a patch commit reachable only through the second parent.
    const sideSha = 'f'.repeat(40);
    const commits = linearChain(4);
    const merge = commits[1];
    if (merge === undefined) {
      throw new Error('fixture chain too short');
    }
    merge.parents = [shaFor(2), sideSha];
    // A real `git log --first-parent` would not emit the side branch at all;
    // this double is deliberately laxer and emits it, proving the walk itself
    // never follows a second parent even when the bulk read is over-broad.
    commits.push({ sha: sideSha, parents: [], message: 'patch:99' });
    const persistence = new FakePersistence({ commits });
    const discovery = new PatchDiscovery(hostWith(persistence));

    const entries = await discovery.loadPatchChainFromSha(shaFor(0));

    expect(entries.map((entry) => entry.sha)).not.toContain(sideSha);
    expect(entries.map((entry) => entry.sha)).toEqual([shaFor(3), shaFor(2), shaFor(1), shaFor(0)]);
  });

  it('returns patches in chronological order identical to the per-commit walk', async () => {
    const commits = linearChain(7);
    const batched = new FakePersistence({ commits });
    const legacy = new FakePersistence({ commits, logStreamFailure: 'omit' });

    const batchedEntries = await new PatchDiscovery(hostWith(batched)).loadPatchChainFromSha(shaFor(0));
    const legacyEntries = await new PatchDiscovery(hostWith(legacy)).loadPatchChainFromSha(shaFor(0));

    expect(batchedEntries.map((entry) => entry.sha)).toEqual(legacyEntries.map((entry) => entry.sha));
  });

  it('stops at stopAtSha without reading past it', async () => {
    const persistence = new FakePersistence({ commits: linearChain(10) });
    const discovery = new PatchDiscovery(hostWith(persistence));

    const entries = await discovery.loadPatchChainFromSha(shaFor(0), shaFor(4));

    expect(entries.map((entry) => entry.sha)).toEqual([shaFor(3), shaFor(2), shaFor(1), shaFor(0)]);
    // The walk stopping is not enough: an unbounded bulk read would fetch and
    // index all ten commits and still produce these four. Bound the read too.
    expect(persistence.lastLogOptions?.stopAt).toBe(shaFor(4));
    expect(persistence.bulkRecordsEmitted).toBe(4);
  });

  it('bounds the bulk read even when the persistence ignores stopAt', async () => {
    // A non-conforming persistence emits the whole chain regardless of stopAt.
    // Parsing must still stop at the boundary, or one bad adapter reinstates
    // the unbounded read this class exists to avoid.
    const commits = linearChain(10);
    const persistence = new (class extends FakePersistence {
      override async logNodesStream(options: LogNodesOptions): Promise<WarpStream<CommitLogChunk>> {
        this.logNodesStreamCalls += 1;
        this.lastLogOptions = options;
        return toLogStream(commits);
      }
    })({ commits });
    const discovery = new PatchDiscovery(hostWith(persistence));

    const entries = await discovery.loadPatchChainFromSha(shaFor(0), shaFor(4));

    expect(entries.map((entry) => entry.sha)).toEqual([shaFor(3), shaFor(2), shaFor(1), shaFor(0)]);
    expect(persistence.getNodeInfoCalls).toBe(0);
  });

  it('stops at the first non-patch commit', async () => {
    const persistence = new FakePersistence({ commits: linearChain(5, { rootKind: 'checkpoint' }) });
    const discovery = new PatchDiscovery(hostWith(persistence));

    const entries = await discovery.loadPatchChainFromSha(shaFor(0));

    expect(entries).toHaveLength(4);
    expect(entries.map((entry) => entry.sha)).not.toContain(shaFor(4));
  });

  it('throws E_MISSING_JOURNAL when the journal is absent and patches exist', async () => {
    const persistence = new FakePersistence({ commits: linearChain(3) });
    const discovery = new PatchDiscovery(hostWith(persistence, null));

    await expect(discovery.loadPatchChainFromSha(shaFor(0))).rejects.toThrowError(PatchError);
  });

  it('falls back to per-commit reads when the persistence lacks logNodesStream', async () => {
    const persistence = new FakePersistence({ commits: linearChain(6), logStreamFailure: 'omit' });
    const discovery = new PatchDiscovery(hostWith(persistence));

    const entries = await discovery.loadPatchChainFromSha(shaFor(0));

    expect(entries).toHaveLength(6);
    expect(persistence.getNodeInfoCalls).toBe(6);
  });

  it('falls back to per-commit reads when the bulk history read rejects', async () => {
    const persistence = new FakePersistence({ commits: linearChain(6), logStreamFailure: 'reject' });
    const discovery = new PatchDiscovery(hostWith(persistence));

    const entries = await discovery.loadPatchChainFromSha(shaFor(0));

    expect(entries).toHaveLength(6);
    expect(persistence.logNodesStreamCalls).toBe(1);
    expect(persistence.getNodeInfoCalls).toBe(6);
  });

  it('reads per-commit only for commits the bulk history read omitted', async () => {
    const persistence = new FakePersistence({
      commits: linearChain(6),
      withholdFromBulk: [shaFor(3)],
    });
    const discovery = new PatchDiscovery(hostWith(persistence));

    const entries = await discovery.loadPatchChainFromSha(shaFor(0));

    expect(entries).toHaveLength(6);
    expect(entries.map((entry) => entry.sha)).toEqual([
      shaFor(5),
      shaFor(4),
      shaFor(3),
      shaFor(2),
      shaFor(1),
      shaFor(0),
    ]);
    expect(persistence.logNodesStreamCalls).toBe(1);
    expect(persistence.getNodeInfoCalls).toBe(1);
  });

  it('preserves journal read order oldest-first regardless of read concurrency', async () => {
    const persistence = new FakePersistence({ commits: linearChain(20) });
    const journal = new FakeJournal(async (message) => {
      await delay((message.lamport % 3) * 2);
      return patchFor(message.lamport);
    });
    const discovery = new PatchDiscovery(hostWith(persistence, journal));

    const entries = await discovery.loadPatchChainFromSha(shaFor(0));

    expect(entries.map((entry) => entry.patch.lamport)).toEqual(
      Array.from({ length: 20 }, (_unused, index) => index + 1),
    );
    expect(journal.reads).toHaveLength(20);
  });

  it('reports the earliest pending failure when several payload reads reject', async () => {
    // pending is tip-to-root, so lamport 4 precedes lamport 2. Lamport 4 is
    // made the SLOWER rejection: index order must beat rejection timing.
    const persistence = new FakePersistence({ commits: linearChain(5) });
    const journal = new FakeJournal(async (message) => {
      if (message.lamport === 4) {
        await delay(30);
        throw new Error('slow failure at lamport 4');
      }
      if (message.lamport === 2) {
        throw new Error('fast failure at lamport 2');
      }
      return patchFor(message.lamport);
    });
    const discovery = new PatchDiscovery(hostWith(persistence, journal));

    await expect(discovery.loadPatchChainFromSha(shaFor(0))).rejects.toThrowError(
      'slow failure at lamport 4',
    );
  });

  it('returns the whole chain when stopAtSha is not part of it', async () => {
    // A stale checkpoint frontier can name a commit that is not an ancestor of
    // this tip. Bounding the read must never drop patches the walk still needs:
    // over-exclusion loses history silently, which is worse than reading too much.
    const unrelated = 'e'.repeat(40);
    const persistence = new FakePersistence({ commits: linearChain(6) });
    const discovery = new PatchDiscovery(hostWith(persistence));

    const entries = await discovery.loadPatchChainFromSha(shaFor(0), unrelated);

    expect(entries.map((entry) => entry.sha)).toEqual([
      shaFor(5), shaFor(4), shaFor(3), shaFor(2), shaFor(1), shaFor(0),
    ]);
  });

  it('warns when the bulk read is unusable so the slow path is not silent', async () => {
    // A silent fallback restores the per-commit cost this class exists to
    // remove. The degradation must be observable, not merely correct.
    const logger = new RecordingLogger();
    const persistence = new FakePersistence({ commits: linearChain(4), logStreamFailure: 'reject' });
    const discovery = new PatchDiscovery(hostWith(persistence, new FakeJournal(), logger));

    const entries = await discovery.loadPatchChainFromSha(shaFor(0));

    expect(entries).toHaveLength(4);
    expect(logger.warnings).toHaveLength(1);
    expect(logger.warnings[0]).toMatch(/falling back to per-commit/i);
  });

  it('does not warn when the bulk read succeeds', async () => {
    const logger = new RecordingLogger();
    const persistence = new FakePersistence({ commits: linearChain(4) });
    const discovery = new PatchDiscovery(hostWith(persistence, new FakeJournal(), logger));

    await discovery.loadPatchChainFromSha(shaFor(0));

    expect(logger.warnings).toEqual([]);
  });

  it('stops instead of spinning when the chain contains a parent cycle', async () => {
    // Corrupt history: the root points back at the tip. The walk needs no I/O
    // per step now, so an unguarded cycle would spin the event loop forever.
    const commits = linearChain(4);
    const root = commits[3];
    if (root === undefined) {
      throw new Error('fixture chain too short');
    }
    root.parents = [shaFor(0)];
    const persistence = new FakePersistence({ commits });
    const discovery = new PatchDiscovery(hostWith(persistence));

    const entries = await discovery.loadPatchChainFromSha(shaFor(0));

    expect(entries.map((entry) => entry.sha)).toEqual([shaFor(3), shaFor(2), shaFor(1), shaFor(0)]);
  });

  it('discovers ticks with one bulk history read per writer', async () => {
    const persistence = new FakePersistence({
      commits: linearChain(30),
      writerRefs: [TEST_WRITER],
    });
    const discovery = new PatchDiscovery(hostWith(persistence));

    const result = await discovery.discoverTicks();

    expect(result.maxTick).toBe(30);
    expect(result.perWriter.get(TEST_WRITER)?.ticks).toHaveLength(30);
    expect(persistence.logNodesStreamCalls).toBe(1);
    expect(persistence.getNodeInfoCalls).toBe(0);
  });
});
