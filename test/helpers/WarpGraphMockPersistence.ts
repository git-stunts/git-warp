import { vi } from 'vitest';
import { encodePatchMessage } from '../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import PatchEntry from '../../src/domain/artifacts/PatchEntry.ts';
import WarpStream from '../../src/domain/stream/WarpStream.ts';
import PatchJournalPort, {
  type AppendPatchRequest,
  type PublishedPatch,
} from '../../src/ports/PatchJournalPort.ts';
import type Patch from '../../src/domain/types/Patch.ts';
import type { PatchCommitMessage } from '../../src/ports/CommitMessageCodecPort.ts';
import { generateOidFromNumber } from './WarpGraphObjectIds.ts';

type PopulatedCommit = {
  readonly index: number;
  readonly patch: Patch;
  readonly parentIndex: number | null;
  readonly writerId: string;
  readonly lamport: number;
};

type StoredCommit = {
  readonly sha: string;
  readonly message: string;
  readonly author: string;
  readonly date: string;
  readonly parents: string[];
  readonly patchOid: string;
};

class MockPersistenceFixtureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MockPersistenceFixtureError';
  }
}

class WarpGraphMockPersistence {
  readonly #refs = new Map<string, string>();

  readonly readRef = vi.fn(async (ref: string) => this.#refs.get(ref) ?? null);
  readonly showNode = vi.fn();
  readonly writeBlob = vi.fn();
  readonly writeTree = vi.fn();
  readonly readBlob = vi.fn();
  readonly readTreeOids = vi.fn(async (_treeOid: string): Promise<Record<string, string>> => ({}));
  readonly commitNode = vi.fn();
  readonly commitNodeWithTree = vi.fn();
  readonly updateRef = vi.fn(async (ref: string, sha: string) => {
    this.#refs.set(ref, sha);
  });
  readonly listRefs = vi.fn().mockResolvedValue([]);
  readonly getNodeInfo = vi.fn();
  readonly ping = vi.fn().mockResolvedValue({ ok: true, latencyMs: 1 });
  readonly configGet = vi.fn().mockResolvedValue(null);
  readonly configSet = vi.fn().mockResolvedValue(undefined);
  readonly nodeExists = vi.fn().mockResolvedValue(true);
  readonly isAncestor = vi.fn().mockResolvedValue(true);
  readonly logNodes = vi.fn().mockResolvedValue('');
  readonly logNodesStream = vi.fn();
  readonly countNodes = vi.fn().mockResolvedValue(0);
  readonly getCommitTree = vi.fn();
  readonly readTree = vi.fn().mockResolvedValue({});
  readonly deleteRef = vi.fn(async (ref: string) => {
    this.#refs.delete(ref);
  });
  readonly compareAndSwapRef = vi.fn(async (ref: string, newOid: string, expectedOid: string | null) => {
    const actualOid = this.#refs.get(ref) ?? null;
    if (actualOid !== expectedOid) {
      throw new MockPersistenceFixtureError(
        `CAS mismatch for ${ref}: expected ${expectedOid ?? '(missing)'}, got ${actualOid ?? '(missing)'}`,
      );
    }
    this.#refs.set(ref, newOid);
    this.readRef.mockImplementation(async (queryRef: string) => this.#refs.get(queryRef) ?? null);
  });

  get emptyTree(): string {
    return '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
  }
}

class PopulatedWarpGraphMockPersistence extends WarpGraphMockPersistence {
  readonly #commitMap = new Map<string, StoredCommit>();
  readonly #patchMap = new Map<string, Patch>();
  readonly #shaMap = new Map<number, string>();
  readonly patchJournal: PatchJournalPort;

  override readonly nodeExists = vi.fn(async (sha: string) => this.#commitMap.has(sha));
  override readonly getNodeInfo = vi.fn(async (sha: string) => {
    const commit = this.#commitMap.get(sha);
    if (!commit) {
      throw new MockPersistenceFixtureError(`Commit not found: ${sha}`);
    }
    return {
      sha: commit.sha,
      message: commit.message,
      author: commit.author,
      date: commit.date,
      parents: commit.parents,
    };
  });
  constructor(commits: readonly PopulatedCommit[], graphName: string) {
    super();
    for (const commit of commits) {
      this.#storeCommit(commit, graphName);
    }
    this.patchJournal = new PopulatedPersistencePatchJournal(this);
  }

  #storeCommit(commit: PopulatedCommit, graphName: string): void {
    const sha = generateOidFromNumber(commit.index * 1000);
    const parentSha = commit.parentIndex !== null ? generateOidFromNumber(commit.parentIndex * 1000) : null;
    const patchOid = generateOidFromNumber(commit.index * 1000 + 1);
    const message = encodePatchMessage({
      graph: graphName,
      writer: commit.writerId,
      lamport: commit.lamport,
      patchOid,
      schema: 2,
    });

    this.#shaMap.set(commit.index, sha);
    this.#patchMap.set(patchOid, commit.patch);
    this.#commitMap.set(sha, {
      sha,
      message,
      author: 'Test <test@example.com>',
      date: '2026-01-01T00:00:00.000Z',
      parents: parentSha ? [parentSha] : [],
      patchOid,
    });
  }

  getSha(index: number): string {
    const sha = this.#shaMap.get(index);
    if (sha === undefined) {
      throw new MockPersistenceFixtureError(`SHA not found for fixture index: ${index}`);
    }
    return sha;
  }

  readFixturePatch(handle: string): Patch {
    const patch = this.#patchMap.get(handle);
    if (patch === undefined) {
      throw new MockPersistenceFixtureError(`Patch not found: ${handle}`);
    }
    return patch;
  }
}

class PopulatedPersistencePatchJournal extends PatchJournalPort {
  readonly #persistence: PopulatedWarpGraphMockPersistence;

  constructor(persistence: PopulatedWarpGraphMockPersistence) {
    super();
    this.#persistence = persistence;
  }

  override appendPatch(_request: AppendPatchRequest): Promise<PublishedPatch> {
    throw new MockPersistenceFixtureError('appendPatch is outside this fixture');
  }

  override readPatch(message: PatchCommitMessage): Promise<Patch> {
    return Promise.resolve(this.#persistence.readFixturePatch(message.patchHandle.toString()));
  }

  override scanPatchRange(
    _writerId: string,
    _fromSha: string | null,
    _toSha: string,
  ): WarpStream<PatchEntry> {
    return WarpStream.from([]);
  }
}

export function createMockPersistence(): WarpGraphMockPersistence {
  return new WarpGraphMockPersistence();
}

export function createPopulatedMockPersistence(
  commits: readonly PopulatedCommit[],
  graphName = 'test-graph',
): { readonly persistence: PopulatedWarpGraphMockPersistence; readonly getSha: (index: number) => string } {
  const persistence = new PopulatedWarpGraphMockPersistence(commits, graphName);
  return {
    persistence,
    getSha: (index: number) => persistence.getSha(index),
  };
}
