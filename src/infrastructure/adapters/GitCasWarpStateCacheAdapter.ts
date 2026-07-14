/**
 * CAS-backed durable WarpStateCachePort adapter.
 * @module infrastructure/adapters/GitCasWarpStateCacheAdapter
 */
import WarpStateCachePort, {
  type WarpStateCoordinate,
  type WarpStateSnapshotRecord,
} from '../../ports/WarpStateCachePort.ts';
import { buildStateCacheRef } from '../../domain/utils/RefLayout.ts';
import CacheError from '../../domain/errors/CacheError.ts';
import WarpError from '../../domain/errors/WarpError.ts';
import { textEncode, concatBytes } from '../../domain/utils/bytes.ts';
import CasContentEncryptionPolicy, {
  type CasRestoreEncryptionArguments,
  type CasStoreEncryptionOptions,
  mapCasContentEncryptionError,
} from './CasContentEncryptionPolicy.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import { Readable } from 'node:stream';
import { decodeWarpFullState, encodeWarpFullState } from '../codecs/WarpStateCborCodec.ts';
import GitCasStateCacheRootSetCoordinator, {
  type GitCasRootSetClient,
} from './GitCasStateCacheRootSetCoordinator.ts';
import type WarpStateCacheRetentionReport from '../../domain/services/state/WarpStateCacheRetentionReport.ts';
import type WarpStateCacheRepairResult from '../../domain/services/state/WarpStateCacheRepairResult.ts';
import type ContentAddressableStore from '@git-stunts/git-cas';
import type { Manifest } from '@git-stunts/git-cas';
import type WarpStateCacheRetentionPort from '../../ports/WarpStateCacheRetentionPort.ts';
import {
  buildStateSnapshotIndex,
  cacheEntryToSnapshotRecord,
  pruneStateCacheIndex,
  snapshotRecordToCacheEntry,
  stateCacheIndexRecords,
  stateCacheRetentionRoots,
  stateCacheRetentionRootsEqual,
  type GitCasStateCacheIndex,
  type GitCasStateCacheRetentionRoot,
} from './GitCasStateCacheIndex.ts';
import {
  createEmptyGitCasStateCacheIndex,
  parseGitCasStateCacheIndex,
} from './GitCasStateCacheIndexCodec.ts';

type CasStore = Pick<
  ContentAddressableStore,
  'readManifest' | 'restoreStream' | 'store' | 'createTree'
> & {
  readonly rootSets: {
    open(options: { readonly ref: string }): Promise<GitCasRootSetClient>;
  };
};

interface CachePersistence {
  readRef(ref: string): Promise<string | null>;
  readBlob(oid: string): Promise<Uint8Array>;
  writeBlob(data: Uint8Array): Promise<string>;
  compareAndSwapRef(ref: string, newOid: string, expectedOid: string | null): Promise<void>;
  nodeExists(oid: string): Promise<boolean>;
  readObjectType(oid: string): Promise<string>;
}

interface CacheIndexState {
  headOid: string | null;
  index: GitCasStateCacheIndex;
}

interface IndexMutationContext {
  current: CacheIndexState;
  currentRoots: Map<string, GitCasStateCacheRetentionRoot>;
  mutated: GitCasStateCacheIndex;
  knownTreeOids: readonly string[];
}

const DEFAULT_MAX_ENTRIES = 200;
const MAX_CAS_RETRIES = 3;
const EVICTABLE_CAS_PAYLOAD_ERROR_CODES = new Set([
  'GIT_OBJECT_NOT_FOUND',
  'MANIFEST_INTEGRITY_ERROR',
  'MANIFEST_NOT_FOUND',
]);

function isEvictableCasPayloadError(error: unknown): boolean {
  return (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && typeof error.code === 'string'
    && EVICTABLE_CAS_PAYLOAD_ERROR_CODES.has(error.code)
  );
}

function evictConfirmedSnapshotPayload(
  index: GitCasStateCacheIndex,
  record: WarpStateSnapshotRecord,
  clearCheckpointHead: boolean,
): GitCasStateCacheIndex {
  const tracked = index.snapshots[record.snapshotId];
  if (tracked === undefined || tracked.payloadRef !== record.payloadRef) {
    return index;
  }
  delete index.snapshots[record.snapshotId];
  if (clearCheckpointHead && index.checkpointHeadId === record.snapshotId) {
    delete index.checkpointHeadId;
  }
  return index;
}

function cacheUpdateFailure(lastErr: unknown): CacheError {
  const message = lastErr instanceof Error ? lastErr.message : String(lastErr);
  return new CacheError(
    `GitCasWarpStateCacheAdapter: index update failed after retries: ${message}`
  );
}

export class GitCasWarpStateCacheAdapter
  extends WarpStateCachePort
  implements WarpStateCacheRetentionPort
{
  private readonly _persistence: CachePersistence;
  private readonly _cas: CasStore;
  private readonly _maxEntries: number;
  private readonly _ref: string;
  private readonly _encryptionKey: Uint8Array | undefined;
  private readonly _contentEncryption: CasContentEncryptionPolicy;
  private readonly _codec: CodecPort;
  private readonly _retention: GitCasStateCacheRootSetCoordinator;
  private _retentionAdoption: Promise<void> | null = null;
  private _retentionReady = false;

  constructor(opts: {
    persistence: CachePersistence;
    cas: CasStore;
    graphName: string;
    maxEntries?: number;
    encryptionKey?: Uint8Array;
    contentEncryption?: CasContentEncryptionPolicy;
    codec: CodecPort;
  }) {
    super();
    this._persistence = opts.persistence;
    this._cas = opts.cas;
    this._maxEntries = opts.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this._ref = buildStateCacheRef(opts.graphName);
    this._encryptionKey = opts.encryptionKey;
    this._contentEncryption = resolveContentEncryption(opts.contentEncryption, this._encryptionKey);
    this._codec = opts.codec;
    this._retention = new GitCasStateCacheRootSetCoordinator({
      graphName: opts.graphName,
      openRootSet: async (ref) => await this._cas.rootSets.open({ ref }),
      objectProbe: this._persistence,
    });
  }

  private async _readIndexState(): Promise<CacheIndexState> {
    const headOid = await this._persistence.readRef(this._ref);
    if (typeof headOid !== 'string' || headOid.length === 0) {
      return { headOid: null, index: createEmptyGitCasStateCacheIndex() };
    }
    return {
      headOid,
      index: parseGitCasStateCacheIndex(await this._persistence.readBlob(headOid)),
    };
  }

  private async _readIndex(): Promise<GitCasStateCacheIndex> {
    return (await this._readIndexState()).index;
  }

  private async _readRetainedIndex(): Promise<GitCasStateCacheIndex> {
    const index = await this._readIndex();
    await this._adoptLegacyRetention(index);
    return index;
  }

  private async _adoptLegacyRetention(index: GitCasStateCacheIndex): Promise<void> {
    if (this._retentionAdoption === null) {
      this._retentionAdoption = this._retention.adopt(stateCacheIndexRecords(index));
    }
    const adoption = this._retentionAdoption;
    try {
      await adoption;
      this._retentionReady = true;
    } catch (err) {
      if (this._retentionAdoption === adoption) {
        this._retentionAdoption = null;
      }
      throw err;
    }
  }

  private async _writeIndex(
    index: GitCasStateCacheIndex,
    expectedHeadOid: string | null
  ): Promise<void> {
    const oid = await this._persistence.writeBlob(textEncode(JSON.stringify(index)));
    await this._persistence.compareAndSwapRef(this._ref, oid, expectedHeadOid);
  }

  private async _mutateIndex(
    mutate: (index: GitCasStateCacheIndex) => GitCasStateCacheIndex,
    knownTreeOids: readonly string[] = []
  ): Promise<GitCasStateCacheIndex> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt++) {
      const current = await this._readIndexState();
      const currentRoots = stateCacheRetentionRoots(current.index);
      const mutated = mutate(current.index);
      try {
        await this._commitIndexMutation({ current, currentRoots, mutated, knownTreeOids });
        return mutated;
      } catch (err) {
        lastErr = err;
        if (attempt === MAX_CAS_RETRIES - 1) {
          throw cacheUpdateFailure(lastErr);
        }
      }
    }
    /* c8 ignore next - unreachable */
    throw new CacheError('GitCasWarpStateCacheAdapter: index update failed');
  }

  private async _commitIndexMutation(context: IndexMutationContext): Promise<void> {
    const { current, currentRoots, mutated, knownTreeOids } = context;
    if (
      this._retentionReady &&
      stateCacheRetentionRootsEqual(currentRoots, stateCacheRetentionRoots(mutated))
    ) {
      await this._writeIndex(mutated, current.headOid);
      return;
    }
    await this._retention.publishTransition(
      stateCacheIndexRecords(mutated),
      () => this._writeIndex(mutated, current.headOid),
      knownTreeOids
    );
    this._retentionReady = true;
  }

  private async _restoreBuffer(
    cas: CasStore,
    restoreOpts: { manifest: Manifest } & CasRestoreEncryptionArguments
  ): Promise<Uint8Array> {
    const chunks: Uint8Array[] = [];
    for await (const chunk of cas.restoreStream(restoreOpts)) {
      chunks.push(chunk);
    }
    return chunks.length === 1 && chunks[0] !== undefined ? chunks[0] : concatBytes(...chunks);
  }

  private async _loadSnapshotState(
    cas: CasStore,
    record: WarpStateSnapshotRecord
  ): Promise<WarpStateSnapshotRecord> {
    const manifest = await cas.readManifest({ treeOid: record.payloadRef });
    const restoreOpts: { manifest: Manifest } & CasRestoreEncryptionArguments = {
      manifest,
      ...this._contentEncryption.toRestoreOptions(),
    };
    const buffer = await this._restoreBuffer(cas, restoreOpts);
    const state = decodeWarpFullState(buffer, this._codec);
    await this._mutateIndex((idx) => {
      const tracked = idx.snapshots[record.snapshotId];
      if (tracked !== null && tracked !== undefined) {
        tracked.lastAccessedAt = new Date().toISOString();
      }
      return idx;
    });
    return { ...record, state };
  }

  private async _loadTrackedSnapshot(
    cas: CasStore,
    record: WarpStateSnapshotRecord,
    options: { readonly clearCheckpointHead?: boolean } = {},
  ): Promise<WarpStateSnapshotRecord | null> {
    try {
      return await this._loadSnapshotState(cas, record);
    } catch (err) {
      const encryptionError = mapCasContentEncryptionError(err, 'state-cache');
      if (encryptionError !== null) {
        throw encryptionError;
      }
      if (!isEvictableCasPayloadError(err)) {
        throw err;
      }
      await this._mutateIndex((index) =>
        evictConfirmedSnapshotPayload(
          index,
          record,
          options.clearCheckpointHead === true,
        )
      );
      return null;
    }
  }

  override async getExact(
    coordinate: WarpStateCoordinate
  ): Promise<WarpStateSnapshotRecord | null> {
    const cas = this._cas;
    const indexData = await this._readRetainedIndex();
    const snapIndex = buildStateSnapshotIndex(indexData.snapshots);
    const match = snapIndex.findExact(coordinate);
    if (match === null) {
      return null;
    }
    return await this._loadTrackedSnapshot(cas, match);
  }

  override async getBestCompatiblePredecessor(
    coordinate: WarpStateCoordinate
  ): Promise<WarpStateSnapshotRecord | null> {
    const cas = this._cas;
    const indexData = await this._readRetainedIndex();
    const snapIndex = buildStateSnapshotIndex(indexData.snapshots);
    const match = snapIndex.findBestCompatiblePredecessor(coordinate);
    if (match === null) {
      return null;
    }
    return await this._loadTrackedSnapshot(cas, match);
  }

  override async put(snapshot: WarpStateSnapshotRecord): Promise<WarpStateSnapshotRecord> {
    const treeOid = await this._storeSnapshotPayload(snapshot);
    const updatedRecord: WarpStateSnapshotRecord = {
      ...snapshot,
      payloadRef: treeOid,
      createdAt: new Date().toISOString(),
    };
    await this._mutateIndex(
      (index) => {
        index.snapshots[updatedRecord.snapshotId] = snapshotRecordToCacheEntry(updatedRecord);
        return pruneStateCacheIndex(index, this._maxEntries);
      },
      [treeOid]
    );
    return updatedRecord;
  }

  private async _storeSnapshotPayload(snapshot: WarpStateSnapshotRecord): Promise<string> {
    if (snapshot.state === undefined) {
      throw new WarpError('Cannot cache snapshot without WarpState', 'E_CACHE_MISSING_STATE');
    }
    const source = Readable.from([encodeWarpFullState(snapshot.state, this._codec)]);
    const storeOptions: {
      source: Readable;
      slug: string;
      filename: string;
      encryptionKey?: Uint8Array;
      encryption?: CasStoreEncryptionOptions;
    } = {
      source,
      slug: snapshot.snapshotId,
      filename: 'state.cbor',
      ...this._contentEncryption.toStoreOptions(),
    };
    const manifest = await this._cas.store(storeOptions);
    return await this._cas.createTree({ manifest });
  }

  override async pin(snapshotId: string): Promise<WarpStateSnapshotRecord> {
    let pinnedRecord: WarpStateSnapshotRecord | null = null;
    await this._mutateIndex((index) => {
      const entry = index.snapshots[snapshotId];
      if (entry === undefined) {
        throw new CacheError(`Snapshot ${snapshotId} not found in state cache`);
      }
      entry.retention = 'pinned';
      pinnedRecord = cacheEntryToSnapshotRecord(entry);
      return index;
    });
    return pinnedRecord!;
  }

  override async publishCheckpointHead(_graphName: string, snapshotId: string): Promise<void> {
    await this._mutateIndex((index) => {
      index.checkpointHeadId = snapshotId;
      return index;
    });
  }

  override async resolveCheckpointHead(
    _graphName: string
  ): Promise<WarpStateSnapshotRecord | null> {
    const cas = this._cas;
    const indexData = await this._readRetainedIndex();
    if (indexData.checkpointHeadId === undefined) {
      return null;
    }
    const entry = indexData.snapshots[indexData.checkpointHeadId];
    if (entry === undefined) {
      return null;
    }
    const match = cacheEntryToSnapshotRecord(entry);
    return await this._loadTrackedSnapshot(cas, match, { clearCheckpointHead: true });
  }

  override async pruneEvictable(): Promise<void> {
    await this._mutateIndex((index) => pruneStateCacheIndex(index, this._maxEntries));
  }

  async inspectRetention(): Promise<WarpStateCacheRetentionReport> {
    const index = await this._readIndex();
    return await this._retention.inspect(stateCacheIndexRecords(index));
  }

  async repairRetention(): Promise<WarpStateCacheRepairResult> {
    const index = await this._readIndex();
    const result = await this._retention.repair(stateCacheIndexRecords(index));
    this._retentionReady = true;
    return result;
  }
}

function resolveContentEncryption(
  contentEncryption: CasContentEncryptionPolicy | undefined,
  encryptionKey: Uint8Array | undefined
): CasContentEncryptionPolicy {
  if (contentEncryption !== undefined) {
    return contentEncryption;
  }
  if (encryptionKey !== undefined) {
    return CasContentEncryptionPolicy.fromInternalResolvedKey({ encryptionKey });
  }
  return CasContentEncryptionPolicy.disabled();
}
