/**
 * CAS-backed durable WarpStateCachePort adapter.
 * @module infrastructure/adapters/GitCasWarpStateCacheAdapter
 */
import WarpStateCachePort, { type WarpStateCoordinate, type WarpStateSnapshotRecord, type WarpStateSnapshotRetention, type WarpStateSnapshotProvenancePosture } from '../../ports/WarpStateCachePort.ts';
import WarpStateSnapshotIndex from '../../domain/services/state/WarpStateSnapshotIndex.ts';
import { buildStateCacheRef } from '../../domain/utils/RefLayout.ts';
import { createLazyCas } from './lazyCasInit.ts';
import { createCdcCasStore } from './CasStoreFactory.ts';
import CacheError from '../../domain/errors/CacheError.ts';
import WarpError from '../../domain/errors/WarpError.ts';
import { textEncode, textDecode, concatBytes } from '../../domain/utils/bytes.ts';
import CasContentEncryptionPolicy, { type CasRestoreEncryptionArguments, type CasStoreEncryptionArguments, type CasStoreEncryptionOptions, mapCasContentEncryptionError } from './CasContentEncryptionPolicy.ts';
import type LoggerPort from '../../ports/LoggerPort.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import { Readable } from 'node:stream';
import { decodeWarpFullState, encodeWarpFullState } from '../codecs/WarpStateCborCodec.ts';
import GitCasStateCacheRootSetCoordinator from './GitCasStateCacheRootSetCoordinator.ts';
import type WarpStateCacheRetentionReport from '../../domain/services/state/WarpStateCacheRetentionReport.ts';
import type WarpStateCacheRepairResult from '../../domain/services/state/WarpStateCacheRepairResult.ts';
import type { RootSet } from '@git-stunts/git-cas';
import type WarpStateCacheRetentionPort from '../../ports/WarpStateCacheRetentionPort.ts';

interface CasStore {
  rootSets: { open(opts: { ref: string }): RootSet };
  readManifest(opts: { treeOid: string }): Promise<unknown>;
  restore(opts: { manifest: unknown } & CasRestoreEncryptionArguments): Promise<{ buffer: Uint8Array }>;
  restoreStream?: (opts: { manifest: unknown } & CasRestoreEncryptionArguments) => AsyncIterable<Uint8Array>;
  store(opts: { source: Readable; slug: string; filename: string } & CasStoreEncryptionArguments): Promise<unknown>;
  createTree(opts: { manifest: unknown }): Promise<string>;
}

interface CachePersistence {
  readRef(ref: string): Promise<string | null>;
  readBlob(oid: string): Promise<Uint8Array>;
  writeBlob(data: Uint8Array): Promise<string>;
  compareAndSwapRef(ref: string, newOid: string, expectedOid: string | null): Promise<void>;
  nodeExists(oid: string): Promise<boolean>;
  readObjectType(oid: string): Promise<string>;
}

interface CacheIndexEntry {
  snapshotId: string;
  coordinate: { frontier: Record<string, string>; ceiling: number | null };
  retention: WarpStateSnapshotRetention;
  provenancePosture: WarpStateSnapshotProvenancePosture;
  stateHash: string;
  payloadRef: string;
  createdAt: string;
  lastAccessedAt?: string | undefined;
  indexTreeOid?: string | undefined;
}

interface CacheIndex {
  schemaVersion: number;
  checkpointHeadId?: string | undefined;
  snapshots: Record<string, CacheIndexEntry>;
}

interface CacheIndexState {
  headOid: string | null;
  index: CacheIndex;
}

interface RetentionRootIdentity {
  payloadRef: string;
  retention: WarpStateSnapshotRetention;
}

interface IndexMutationContext {
  current: CacheIndexState;
  currentRoots: Map<string, RetentionRootIdentity>;
  mutated: CacheIndex;
  knownTreeOids: readonly string[];
}

const DEFAULT_MAX_ENTRIES = 200;
const INDEX_SCHEMA_VERSION = 1;
const MAX_CAS_RETRIES = 3;

function _emptyIndex(): CacheIndex { return { schemaVersion: INDEX_SCHEMA_VERSION, snapshots: {} }; }

function _validateParsedIndex(parsed: unknown): CacheIndex {
  if (typeof parsed !== 'object' || parsed === null) { return _emptyIndex(); }
  const candidate = parsed as { schemaVersion?: unknown; checkpointHeadId?: string; snapshots?: unknown };
  if (candidate.schemaVersion !== INDEX_SCHEMA_VERSION) { return _emptyIndex(); }
  return { schemaVersion: INDEX_SCHEMA_VERSION, checkpointHeadId: candidate.checkpointHeadId, snapshots: (candidate.snapshots ?? {}) as Record<string, CacheIndexEntry> };
}

function _parseIndexBlob(buf: Uint8Array): CacheIndex {
  try { return _validateParsedIndex(JSON.parse(textDecode(buf))); } catch { return _emptyIndex(); }
}

function recordToEntry(record: WarpStateSnapshotRecord): CacheIndexEntry {
  const frontierObj: Record<string, string> = {};
  for (const [k, v] of record.coordinate.frontier) { frontierObj[k] = v; }
  return { snapshotId: record.snapshotId, coordinate: { frontier: frontierObj, ceiling: record.coordinate.ceiling }, retention: record.retention, provenancePosture: record.provenancePosture, stateHash: record.stateHash, payloadRef: record.payloadRef, createdAt: record.createdAt, lastAccessedAt: record.lastAccessedAt, indexTreeOid: record.indexTreeOid };
}

function entryToRecord(entry: CacheIndexEntry): WarpStateSnapshotRecord {
  const frontier = new Map<string, string>();
  for (const [k, v] of Object.entries(entry.coordinate.frontier)) { frontier.set(k, v); }
  return { snapshotId: entry.snapshotId, coordinate: { frontier, ceiling: entry.coordinate.ceiling }, retention: entry.retention, provenancePosture: entry.provenancePosture, stateHash: entry.stateHash, payloadRef: entry.payloadRef, createdAt: entry.createdAt, lastAccessedAt: entry.lastAccessedAt, indexTreeOid: entry.indexTreeOid };
}

function isCeilingCompatible(cand: number | null, tgt: number | null): boolean {
  return cand === null || tgt === null ? true : cand <= tgt;
}

function isFrontierCompatible(cand: Map<string, string>, tgt: Map<string, string>): boolean {
  for (const [writerId, targetTip] of tgt) {
    const candidateTip = cand.get(writerId);
    if (candidateTip !== undefined && candidateTip !== targetTip) { return false; }
  }
  return true;
}

function isCoordinateCompatible(cand: WarpStateCoordinate, tgt: WarpStateCoordinate): boolean {
  return isCeilingCompatible(cand.ceiling, tgt.ceiling) && isFrontierCompatible(cand.frontier, tgt.frontier);
}

function _buildPrunedSnapshotIndex(snapshots: Record<string, CacheIndexEntry>, maxEntries: number): WarpStateSnapshotIndex {
  const snapIndex = new WarpStateSnapshotIndex({ isCoordinateCompatible });
  for (const key of Object.keys(snapshots)) {
    snapIndex.upsert(entryToRecord(snapshots[key]!));
  }
  snapIndex.pruneEvictable({ maxEntries });
  return snapIndex;
}

function _filterSnapshotsByIndex(snapshots: Record<string, CacheIndexEntry>, snapIndex: WarpStateSnapshotIndex): Record<string, CacheIndexEntry> {
  const pruned: Record<string, CacheIndexEntry> = {};
  for (const key of Object.keys(snapshots)) {
    if (snapIndex.findById(key) !== null) {
      pruned[key] = snapshots[key]!;
    }
  }
  return pruned;
}

function _pruneSnapshotsIndex(index: CacheIndex, maxEntries: number): CacheIndex {
  const snapIndex = _buildPrunedSnapshotIndex(index.snapshots, maxEntries);
  index.snapshots = _filterSnapshotsByIndex(index.snapshots, snapIndex);
  return index;
}

function indexRecords(index: CacheIndex): WarpStateSnapshotRecord[] {
  return Object.values(index.snapshots).map(entryToRecord);
}

function retentionRoots(index: CacheIndex): Map<string, RetentionRootIdentity> {
  return new Map(Object.values(index.snapshots).map((entry) => [
    entry.snapshotId,
    { payloadRef: entry.payloadRef, retention: entry.retention },
  ]));
}

function retentionRootsEqual(
  left: Map<string, RetentionRootIdentity>,
  right: Map<string, RetentionRootIdentity>,
): boolean {
  if (left.size !== right.size) { return false; }
  for (const [snapshotId, target] of left) {
    if (!retentionRootIdentityEqual(target, right.get(snapshotId))) { return false; }
  }
  return true;
}

function retentionRootIdentityEqual(
  left: RetentionRootIdentity,
  right: RetentionRootIdentity | undefined,
): boolean {
  return right !== undefined
    && right.payloadRef === left.payloadRef
    && right.retention === left.retention;
}

function cacheUpdateFailure(lastErr: unknown): CacheError {
  const message = lastErr instanceof Error ? lastErr.message : String(lastErr);
  return new CacheError(`GitCasWarpStateCacheAdapter: index update failed after retries: ${message}`);
}

export class GitCasWarpStateCacheAdapter extends WarpStateCachePort implements WarpStateCacheRetentionPort {
  private readonly _persistence: CachePersistence;
  private readonly _plumbing: unknown;
  private readonly _maxEntries: number;
  private readonly _ref: string;
  private readonly _encryptionKey: Uint8Array | undefined;
  private readonly _contentEncryption: CasContentEncryptionPolicy;
  private readonly _logger: LoggerPort | undefined;
  private readonly _codec: CodecPort;
  private readonly _getCas: () => Promise<CasStore>;
  private readonly _retention: GitCasStateCacheRootSetCoordinator;
  private _retentionAdoption: Promise<void> | null = null;
  private _retentionReady = false;

  constructor(opts: { persistence: CachePersistence; plumbing: unknown; graphName: string; maxEntries?: number; encryptionKey?: Uint8Array; contentEncryption?: CasContentEncryptionPolicy; logger?: LoggerPort; codec: CodecPort }) {
    super();
    this._persistence = opts.persistence;
    this._plumbing = opts.plumbing;
    this._maxEntries = opts.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this._ref = buildStateCacheRef(opts.graphName);
    this._encryptionKey = opts.encryptionKey;
    this._contentEncryption = resolveContentEncryption(opts.contentEncryption, this._encryptionKey);
    this._logger = opts.logger;
    this._codec = opts.codec;
    this._getCas = createLazyCas(() => createCdcCasStore<CasStore>({ plumbing: this._plumbing, logger: this._logger }));
    this._retention = new GitCasStateCacheRootSetCoordinator({
      graphName: opts.graphName,
      openRootSet: async (ref) => (await this._getCas()).rootSets.open({ ref }),
      objectProbe: this._persistence,
    });
  }

  private async _readIndexState(): Promise<CacheIndexState> {
    const headOid = await this._persistence.readRef(this._ref);
    if (typeof headOid !== 'string' || headOid.length === 0) {
      return { headOid: null, index: _emptyIndex() };
    }
    try {
      return {
        headOid,
        index: _parseIndexBlob(await this._persistence.readBlob(headOid)),
      };
    } catch {
      return { headOid, index: _emptyIndex() };
    }
  }

  private async _readIndex(): Promise<CacheIndex> {
    return (await this._readIndexState()).index;
  }

  private async _readRetainedIndex(): Promise<CacheIndex> {
    const index = await this._readIndex();
    await this._adoptLegacyRetention(index);
    return index;
  }

  private async _adoptLegacyRetention(index: CacheIndex): Promise<void> {
    if (this._retentionAdoption === null) {
      this._retentionAdoption = this._retention.adopt(indexRecords(index));
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

  private async _writeIndex(index: CacheIndex, expectedHeadOid: string | null): Promise<void> {
    const oid = await this._persistence.writeBlob(textEncode(JSON.stringify(index)));
    await this._persistence.compareAndSwapRef(this._ref, oid, expectedHeadOid);
  }

  private async _mutateIndex(
    mutate: (index: CacheIndex) => CacheIndex,
    knownTreeOids: readonly string[] = [],
  ): Promise<CacheIndex> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt++) {
      const current = await this._readIndexState();
      const currentRoots = retentionRoots(current.index);
      const mutated = mutate(current.index);
      try {
        await this._commitIndexMutation({ current, currentRoots, mutated, knownTreeOids });
        return mutated;
      } catch (err) {
        lastErr = err;
        if (attempt === MAX_CAS_RETRIES - 1) { throw cacheUpdateFailure(lastErr); }
      }
    }
    /* c8 ignore next - unreachable */
    throw new CacheError('GitCasWarpStateCacheAdapter: index update failed');
  }

  private async _commitIndexMutation(context: IndexMutationContext): Promise<void> {
    const { current, currentRoots, mutated, knownTreeOids } = context;
    if (this._retentionReady
      && retentionRootsEqual(currentRoots, retentionRoots(mutated))) {
      await this._writeIndex(mutated, current.headOid);
      return;
    }
    await this._retention.publishTransition(
      indexRecords(mutated),
      () => this._writeIndex(mutated, current.headOid),
      knownTreeOids,
    );
    this._retentionReady = true;
  }

  private async _restoreBuffer(cas: CasStore, restoreOpts: { manifest: unknown } & CasRestoreEncryptionArguments): Promise<Uint8Array> {
    if (typeof cas.restoreStream === 'function') {
      const stream = cas.restoreStream(restoreOpts);
      const chunks: Uint8Array[] = [];
      for await (const chunk of stream) { chunks.push(chunk); }
      return chunks.length === 1 && chunks[0] !== undefined ? chunks[0] : concatBytes(...chunks);
    }
    const { buffer } = await cas.restore(restoreOpts);
    return buffer;
  }

  private async _loadSnapshotState(cas: CasStore, record: WarpStateSnapshotRecord): Promise<WarpStateSnapshotRecord> {
    const manifest = await cas.readManifest({ treeOid: record.payloadRef });
    const restoreOpts: { manifest: unknown } & CasRestoreEncryptionArguments = { manifest, ...this._contentEncryption.toRestoreOptions() };
    const buffer = await this._restoreBuffer(cas, restoreOpts);
    const state = decodeWarpFullState(buffer, this._codec);
    await this._mutateIndex((idx) => {
      const tracked = idx.snapshots[record.snapshotId];
      if (tracked !== null && tracked !== undefined) { tracked.lastAccessedAt = new Date().toISOString(); }
      return idx;
    });
    return { ...record, state };
  }

  override async getExact(coordinate: WarpStateCoordinate): Promise<WarpStateSnapshotRecord | null> {
    const cas = await this._getCas();
    const indexData = await this._readRetainedIndex();
    const snapIndex = new WarpStateSnapshotIndex({ isCoordinateCompatible });
    for (const entry of Object.values(indexData.snapshots)) { snapIndex.upsert(entryToRecord(entry)); }
    const match = snapIndex.findExact(coordinate);
    if (match === null) { return null; }
    try { return await this._loadSnapshotState(cas, match); } catch (err) {
      const encryptionError = mapCasContentEncryptionError(err, 'state-cache');
      if (encryptionError !== null) { throw encryptionError; }
      await this._mutateIndex((idx) => { delete idx.snapshots[match.snapshotId]; return idx; });
      return null;
    }
  }

  override async getBestCompatiblePredecessor(coordinate: WarpStateCoordinate): Promise<WarpStateSnapshotRecord | null> {
    const cas = await this._getCas();
    const indexData = await this._readRetainedIndex();
    const snapIndex = new WarpStateSnapshotIndex({ isCoordinateCompatible });
    for (const entry of Object.values(indexData.snapshots)) { snapIndex.upsert(entryToRecord(entry)); }
    const match = snapIndex.findBestCompatiblePredecessor(coordinate);
    if (match === null) { return null; }
    try { return await this._loadSnapshotState(cas, match); } catch (err) {
      const encryptionError = mapCasContentEncryptionError(err, 'state-cache');
      if (encryptionError !== null) { throw encryptionError; }
      await this._mutateIndex((idx) => { delete idx.snapshots[match.snapshotId]; return idx; });
      return null;
    }
  }

  override async put(snapshot: WarpStateSnapshotRecord): Promise<WarpStateSnapshotRecord> {
    const cas = await this._getCas();
    if (snapshot.state === undefined) { throw new WarpError('Cannot cache snapshot without WarpState', 'E_CACHE_MISSING_STATE'); }
    const buffer = encodeWarpFullState(snapshot.state, this._codec);
    const source = Readable.from([buffer]);
    const storeOpts: { source: Readable; slug: string; filename: string; encryptionKey?: Uint8Array; encryption?: CasStoreEncryptionOptions } = { source, slug: snapshot.snapshotId, filename: 'state.cbor', ...this._contentEncryption.toStoreOptions() };
    const manifest = await cas.store(storeOpts);
    const treeOid = await cas.createTree({ manifest });
    const updatedRecord: WarpStateSnapshotRecord = { ...snapshot, payloadRef: treeOid, createdAt: new Date().toISOString() };
    await this._mutateIndex((index) => {
      index.snapshots[updatedRecord.snapshotId] = recordToEntry(updatedRecord);
      return _pruneSnapshotsIndex(index, this._maxEntries);
    }, [treeOid]);
    return updatedRecord;
  }

  override async pin(snapshotId: string): Promise<WarpStateSnapshotRecord> {
    let pinnedRecord: WarpStateSnapshotRecord | null = null;
    await this._mutateIndex((index) => {
      const entry = index.snapshots[snapshotId];
      if (entry === undefined) { throw new CacheError(`Snapshot ${snapshotId} not found in state cache`); }
      entry.retention = 'pinned';
      pinnedRecord = entryToRecord(entry);
      return index;
    });
    return pinnedRecord!;
  }

  override async publishCheckpointHead(_graphName: string, snapshotId: string): Promise<void> {
    await this._mutateIndex((index) => { index.checkpointHeadId = snapshotId; return index; });
  }

  override async resolveCheckpointHead(_graphName: string): Promise<WarpStateSnapshotRecord | null> {
    const cas = await this._getCas();
    const indexData = await this._readRetainedIndex();
    if (indexData.checkpointHeadId === undefined) { return null; }
    const entry = indexData.snapshots[indexData.checkpointHeadId];
    if (entry === undefined) { return null; }
    const match = entryToRecord(entry);
    try { return await this._loadSnapshotState(cas, match); } catch (err) {
      const encryptionError = mapCasContentEncryptionError(err, 'state-cache');
      if (encryptionError !== null) { throw encryptionError; }
      await this._mutateIndex((idx) => { delete idx.snapshots[match.snapshotId]; delete idx.checkpointHeadId; return idx; });
      return null;
    }
  }

  override async pruneEvictable(): Promise<void> {
    await this._mutateIndex((index) => _pruneSnapshotsIndex(index, this._maxEntries));
  }

  async inspectRetention(): Promise<WarpStateCacheRetentionReport> {
    const index = await this._readIndex();
    return await this._retention.inspect(indexRecords(index));
  }

  async repairRetention(): Promise<WarpStateCacheRepairResult> {
    const index = await this._readIndex();
    const result = await this._retention.repair(indexRecords(index));
    this._retentionReady = true;
    return result;
  }
}

function resolveContentEncryption(contentEncryption: CasContentEncryptionPolicy | undefined, encryptionKey: Uint8Array | undefined): CasContentEncryptionPolicy {
  if (contentEncryption !== undefined) { return contentEncryption; }
  if (encryptionKey !== undefined) { return CasContentEncryptionPolicy.fromInternalResolvedKey({ encryptionKey }); }
  return CasContentEncryptionPolicy.disabled();
}
