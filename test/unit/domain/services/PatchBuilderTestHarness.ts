import { vi, type Mock } from 'vitest';
import { PatchBuilder } from '../../../../src/domain/services/PatchBuilder.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import WarpState from '../../../../src/domain/services/state/WarpState.ts';
import WarpStream from '../../../../src/domain/stream/WarpStream.ts';
import Patch from '../../../../src/domain/types/Patch.ts';
import { CborPatchJournalAdapter } from '../../../../src/infrastructure/adapters/CborPatchJournalAdapter.ts';
import { CborCodec, decode } from '../../../../src/infrastructure/codecs/CborCodec.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import { hydrateDecodedPatch } from '../../../../src/domain/services/PatchHydrator.ts';
import type { CommitLogChunk } from '../../../../src/ports/CommitPort.ts';
import type BlobStoragePort from '../../../../src/ports/BlobStoragePort.ts';
import type { BlobStorageOptions } from '../../../../src/ports/BlobStoragePort.ts';

type PatchBuilderOptions = ConstructorParameters<typeof PatchBuilder>[0];
type PatchBuilderPersistence = PatchBuilderOptions['persistence'];

const DEFAULT_PATCH_BLOB_OID = 'a'.repeat(40);
const DEFAULT_TREE_OID = 'b'.repeat(40);
const DEFAULT_COMMIT_OID = 'c'.repeat(40);
const DEFAULT_EMPTY_TREE_OID = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

export type PatchBuilderMockPersistence = PatchBuilderPersistence & {
  readRef: Mock<(ref: string) => Promise<string | null>>;
  showNode: Mock<(sha: string) => Promise<string>>;
  writeBlob: Mock<(content: Uint8Array | string) => Promise<string>>;
  writeTree: Mock<(entries: string[]) => Promise<string>>;
  commitNodeWithTree: Mock<(options: { treeOid: string; parents?: string[]; message: string; sign?: boolean }) => Promise<string>>;
  updateRef: Mock<(ref: string, oid: string) => Promise<void>>;
  compareAndSwapRef: Mock<(ref: string, newOid: string, expectedOid: string | null) => Promise<void>>;
  readBlob: Mock<(oid: string) => Promise<Uint8Array>>;
  readTree: Mock<(treeOid: string) => Promise<Record<string, Uint8Array>>>;
  readTreeOids: Mock<(treeOid: string) => Promise<Record<string, string>>>;
  deleteRef: Mock<(ref: string) => Promise<void>>;
  listRefs: Mock<(prefix: string, options?: { limit?: number }) => Promise<string[]>>;
  commitNode: Mock<(options: { message: string; parents?: string[]; sign?: boolean }) => Promise<string>>;
  getNodeInfo: Mock<(sha: string) => Promise<{ sha: string; message: string; author: string; date: string; parents: string[] }>>;
  getCommitTree: Mock<(sha: string) => Promise<string>>;
  logNodes: Mock<(options: { ref: string; limit?: number; format?: string }) => Promise<string>>;
  logNodesStream: Mock<(options: { ref: string; limit?: number; format?: string }) => Promise<WarpStream<CommitLogChunk>>>;
  countNodes: Mock<(ref: string) => Promise<number>>;
  nodeExists: Mock<(sha: string) => Promise<boolean>>;
  ping: Mock<() => Promise<{ ok: boolean; latencyMs: number }>>;
};

export type PatchBuilderMockBlobStorage = BlobStoragePort & {
  store: Mock<(content: Uint8Array | string, options?: BlobStorageOptions) => Promise<string>>;
  retrieve: Mock<(oid: string) => Promise<Uint8Array>>;
  storeStream: Mock<(source: AsyncIterable<Uint8Array>, options?: BlobStorageOptions) => Promise<string>>;
  retrieveStream: Mock<(oid: string) => AsyncIterable<Uint8Array>>;
};

function emptyCommitLogStream(): WarpStream<CommitLogChunk> {
  return WarpStream.from<CommitLogChunk>({
    [Symbol.asyncIterator]: async function* () {
      // Empty by design.
    },
  });
}

function emptyByteStream(): AsyncIterable<Uint8Array> {
  return {
    [Symbol.asyncIterator]: async function* () {
      // Empty by design.
    },
  };
}

export function createPatchBuilderMockPersistence(
  overrides: Partial<PatchBuilderMockPersistence> = {},
): PatchBuilderMockPersistence {
  const persistence = {
    readRef: vi.fn(async (_ref: string): Promise<string | null> => null),
    showNode: vi.fn(async (_sha: string): Promise<string> => ''),
    writeBlob: vi.fn(async (_content: Uint8Array | string): Promise<string> => DEFAULT_PATCH_BLOB_OID),
    writeTree: vi.fn(async (_entries: string[]): Promise<string> => DEFAULT_TREE_OID),
    commitNodeWithTree: vi.fn(async (_options: {
      treeOid: string;
      parents?: string[];
      message: string;
      sign?: boolean;
    }): Promise<string> => DEFAULT_COMMIT_OID),
    updateRef: vi.fn(async (_ref: string, _oid: string): Promise<void> => {}),
    compareAndSwapRef: vi.fn(),
    readBlob: vi.fn(async (_oid: string): Promise<Uint8Array> => new Uint8Array()),
    readTree: vi.fn(async (_treeOid: string): Promise<Record<string, Uint8Array>> => ({})),
    readTreeOids: vi.fn(async (_treeOid: string): Promise<Record<string, string>> => ({})),
    deleteRef: vi.fn(async (_ref: string): Promise<void> => {}),
    listRefs: vi.fn(async (_prefix: string, _options?: { limit?: number }): Promise<string[]> => []),
    commitNode: vi.fn(async (_options: { message: string; parents?: string[]; sign?: boolean }): Promise<string> => DEFAULT_COMMIT_OID),
    getNodeInfo: vi.fn(async (sha: string): Promise<{ sha: string; message: string; author: string; date: string; parents: string[] }> => ({
      sha,
      message: '',
      author: '',
      date: '',
      parents: [],
    })),
    getCommitTree: vi.fn(async (_sha: string): Promise<string> => DEFAULT_EMPTY_TREE_OID),
    logNodes: vi.fn(async (_options: { ref: string; limit?: number; format?: string }): Promise<string> => ''),
    logNodesStream: vi.fn(async (_options: { ref: string; limit?: number; format?: string }): Promise<WarpStream<CommitLogChunk>> => emptyCommitLogStream()),
    countNodes: vi.fn(async (_ref: string): Promise<number> => 0),
    nodeExists: vi.fn(async (_sha: string): Promise<boolean> => true),
    ping: vi.fn(async (): Promise<{ ok: boolean; latencyMs: number }> => ({ ok: true, latencyMs: 0 })),
    emptyTree: DEFAULT_EMPTY_TREE_OID,
    ...overrides,
  } satisfies PatchBuilderMockPersistence;

  if (overrides.compareAndSwapRef === undefined) {
    persistence.compareAndSwapRef.mockImplementation(async (ref: string, newOid: string, expectedOid: string | null): Promise<void> => {
      const actualOid = await persistence.readRef(ref);
      if (actualOid !== expectedOid) {
        throw new Error(`CAS mismatch for ${ref}`);
      }
      persistence.readRef.mockResolvedValue(newOid);
    });
  }

  return persistence;
}

export function createPatchBuilderMockState(): WarpState {
  return WarpState.empty();
}

export function createPatchBuilderMockBlobStorage(
  opts: { storeOid?: string } = {},
): PatchBuilderMockBlobStorage {
  const oid = opts.storeOid ?? 'd'.repeat(40);
  return {
    store: vi.fn(async (_content: Uint8Array | string, _options?: BlobStorageOptions): Promise<string> => oid),
    retrieve: vi.fn(async (_oid: string): Promise<Uint8Array> => new Uint8Array()),
    storeStream: vi.fn(async (_source: AsyncIterable<Uint8Array>, _options?: BlobStorageOptions): Promise<string> => oid),
    retrieveStream: vi.fn((_oid: string): AsyncIterable<Uint8Array> => emptyByteStream()),
  } satisfies PatchBuilderMockBlobStorage;
}

export function createPatchJournal(persistence: PatchBuilderMockPersistence): CborPatchJournalAdapter {
  return new CborPatchJournalAdapter({
    codec: new CborCodec(),
    blobPort: persistence,
    commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
  });
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

export function createPatchBuilder(overrides: Partial<PatchBuilderOptions> = {}): PatchBuilder {
  return new PatchBuilder(createPatchBuilderOptions(overrides));
}

export function decodeWrittenPatch(persistence: PatchBuilderMockPersistence, callIndex = 0): Patch {
  const blobData = persistence.writeBlob.mock.calls[callIndex]?.[0];
  if (blobData === undefined) {
    throw new Error(`Expected writeBlob call ${callIndex}`);
  }
  if (!(blobData instanceof Uint8Array)) {
    throw new Error(`Expected writeBlob call ${callIndex} to contain bytes`);
  }
  return hydrateDecodedPatch(decode(blobData));
}
