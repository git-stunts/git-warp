import { vi, type Mock } from 'vitest';
import PatchEntry from '../../../../src/domain/artifacts/PatchEntry.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { PatchBuilder } from '../../../../src/domain/services/PatchBuilder.ts';
import WarpState from '../../../../src/domain/services/state/WarpState.ts';
import AssetHandle from '../../../../src/domain/storage/AssetHandle.ts';
import BundleHandle from '../../../../src/domain/storage/BundleHandle.ts';
import WarpStream from '../../../../src/domain/stream/WarpStream.ts';
import type Patch from '../../../../src/domain/types/Patch.ts';
import AssetStoragePort, {
  type AssetWriteOptions,
  type StagedAsset,
} from '../../../../src/ports/AssetStoragePort.ts';
import type { CommitLogChunk } from '../../../../src/ports/CommitPort.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import PatchJournalPort, {
  type AppendPatchRequest,
  type PublishedPatch,
} from '../../../../src/ports/PatchJournalPort.ts';
import type { PatchCommitMessage } from '../../../../src/ports/CommitMessageCodecPort.ts';
import { collectAsyncIterable } from '../../../../src/domain/utils/streamUtils.ts';
import { testRetentionWitness } from '../../../helpers/storageRetention.ts';

type PatchBuilderOptions = ConstructorParameters<typeof PatchBuilder>[0];
type PatchBuilderPersistence = PatchBuilderOptions['persistence'];

const DEFAULT_COMMIT_OID = 'c'.repeat(40);
const WRITTEN_PATCHES = new WeakMap<object, Patch>();

export type PatchBuilderMockPersistence = PatchBuilderPersistence & {
  readRef: Mock<(ref: string) => Promise<string | null>>;
  showNode: Mock<(sha: string) => Promise<string>>;
  updateRef: Mock<(ref: string, oid: string) => Promise<void>>;
  compareAndSwapRef: Mock<(ref: string, newOid: string, expectedOid: string | null) => Promise<void>>;
  deleteRef: Mock<(ref: string) => Promise<void>>;
  listRefs: Mock<(prefix: string, options?: { limit?: number }) => Promise<string[]>>;
  commitNode: Mock<(options: { message: string; parents?: string[]; sign?: boolean }) => Promise<string>>;
  getNodeInfo: Mock<(sha: string) => Promise<{
    sha: string;
    message: string;
    author: string;
    date: string;
    parents: string[];
  }>>;
  logNodes: Mock<(options: { ref: string; limit?: number; format?: string }) => Promise<string>>;
  logNodesStream: Mock<(
    options: { ref: string; limit?: number; format?: string },
  ) => Promise<WarpStream<CommitLogChunk>>>;
  countNodes: Mock<(ref: string) => Promise<number>>;
  nodeExists: Mock<(sha: string) => Promise<boolean>>;
  ping: Mock<() => Promise<{ ok: boolean; latencyMs: number }>>;
};

function emptyCommitLogStream(): WarpStream<CommitLogChunk> {
  return WarpStream.from<CommitLogChunk>([]);
}

export function createPatchBuilderMockPersistence(
  overrides: Partial<PatchBuilderMockPersistence> = {},
): PatchBuilderMockPersistence {
  const persistence = {
    readRef: vi.fn(async (_ref: string): Promise<string | null> => null),
    showNode: vi.fn(async (_sha: string): Promise<string> => ''),
    updateRef: vi.fn(async (_ref: string, _oid: string): Promise<void> => {}),
    compareAndSwapRef: vi.fn(async (_ref: string, _newOid: string, _expectedOid: string | null): Promise<void> => {}),
    deleteRef: vi.fn(async (_ref: string): Promise<void> => {}),
    listRefs: vi.fn(async (_prefix: string, _options?: { limit?: number }): Promise<string[]> => []),
    commitNode: vi.fn(async (_options: {
      message: string;
      parents?: string[];
      sign?: boolean;
    }): Promise<string> => DEFAULT_COMMIT_OID),
    getNodeInfo: vi.fn(async (sha: string) => ({
      sha,
      message: '',
      author: '',
      date: '',
      parents: [],
    })),
    logNodes: vi.fn(async (_options: {
      ref: string;
      limit?: number;
      format?: string;
    }): Promise<string> => ''),
    logNodesStream: vi.fn(async (_options: {
      ref: string;
      limit?: number;
      format?: string;
    }): Promise<WarpStream<CommitLogChunk>> => emptyCommitLogStream()),
    countNodes: vi.fn(async (_ref: string): Promise<number> => 0),
    nodeExists: vi.fn(async (_sha: string): Promise<boolean> => true),
    ping: vi.fn(async () => ({ ok: true, latencyMs: 0 })),
    ...overrides,
  } satisfies PatchBuilderMockPersistence;

  if (overrides.compareAndSwapRef === undefined) {
    persistence.compareAndSwapRef.mockImplementation(async (
      ref: string,
      newOid: string,
      expectedOid: string | null,
    ): Promise<void> => {
      const actualOid = await persistence.readRef(ref);
      if (actualOid !== expectedOid) {
        throw new Error(`CAS mismatch for ${ref}`);
      }
      persistence.readRef.mockResolvedValue(newOid);
    });
  }
  return persistence;
}

export class RecordingPatchJournal extends PatchJournalPort {
  readonly requests: AppendPatchRequest[] = [];
  failure: unknown = null;
  sha = DEFAULT_COMMIT_OID;
  readonly #persistence: object;

  constructor(persistence: object) {
    super();
    this.#persistence = persistence;
  }

  override async appendPatch(request: AppendPatchRequest): Promise<PublishedPatch> {
    this.requests.push(request);
    if (this.failure !== null) {
      throw this.failure;
    }
    WRITTEN_PATCHES.set(this.#persistence, request.patch);
    const stagedPatch = stagedAsset(new AssetHandle('asset:test-patch'), 1);
    return Object.freeze({
      sha: this.sha,
      bundleHandle: new BundleHandle('bundle:test-patch'),
      stagedPatch,
      retention: testRetentionWitness(this.sha),
    });
  }

  override readPatch(_message: PatchCommitMessage): Promise<Patch> {
    throw new PatchBuilderFixtureError('readPatch is outside this fixture');
  }

  override scanPatchRange(
    _writerId: string,
    _fromSha: string | null,
    _toSha: string,
  ): WarpStream<PatchEntry> {
    return WarpStream.from([]);
  }
}

export class RecordingAssetStorage extends AssetStoragePort {
  readonly calls: Array<{ bytes: Uint8Array; options: AssetWriteOptions }> = [];
  readonly #handles: string[];
  readonly #assets = new Map<string, Uint8Array>();
  failure: unknown = null;

  constructor(handles: readonly string[] = ['asset:test-content']) {
    super();
    this.#handles = [...handles];
  }

  override async stage(
    source: AsyncIterable<Uint8Array>,
    options: AssetWriteOptions,
  ): Promise<StagedAsset> {
    if (this.failure !== null) {
      throw this.failure;
    }
    const bytes = await collectAsyncIterable(source);
    const token = this.#handles[this.calls.length] ?? `asset:test-content-${this.calls.length}`;
    const handle = new AssetHandle(token);
    this.calls.push({ bytes, options });
    this.#assets.set(token, bytes.slice());
    return stagedAsset(handle, bytes.byteLength);
  }

  override async *open(handle: AssetHandle): AsyncIterable<Uint8Array> {
    const bytes = this.#assets.get(handle.toString());
    if (bytes === undefined) {
      throw new PatchBuilderFixtureError(`unknown test asset: ${handle.toString()}`);
    }
    yield bytes.slice();
  }
}

export function createPatchBuilderMockState(): WarpState {
  return WarpState.empty();
}

export function createPatchJournal(
  persistence: PatchBuilderMockPersistence,
): RecordingPatchJournal {
  return new RecordingPatchJournal(persistence);
}

export function createPatchBuilderOptions(
  overrides: Partial<PatchBuilderOptions> = {},
): PatchBuilderOptions {
  const persistence = overrides.persistence ?? createPatchBuilderMockPersistence();
  return {
    persistence,
    graphName: 'test-graph',
    writerId: 'writer1',
    lamport: 1,
    versionVector: VersionVector.empty(),
    getCurrentState: () => null,
    commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
    ...overrides,
  };
}

export function createPatchBuilder(
  overrides: Partial<PatchBuilderOptions> = {},
): PatchBuilder {
  return new PatchBuilder(createPatchBuilderOptions(overrides));
}

export function decodeWrittenPatch(
  persistence: PatchBuilderMockPersistence,
  _callIndex = 0,
): Patch {
  const patch = WRITTEN_PATCHES.get(persistence);
  if (patch === undefined) {
    throw new PatchBuilderFixtureError('expected the semantic journal to receive a patch');
  }
  return patch;
}

function stagedAsset(handle: AssetHandle, size: number): StagedAsset {
  return Object.freeze({
    handle,
    size,
    observedAt: '1970-01-01T00:00:00.000Z',
    retention: Object.freeze({
      reachability: 'unanchored',
      protection: 'not-established',
    }),
  });
}

class PatchBuilderFixtureError extends Error {}
