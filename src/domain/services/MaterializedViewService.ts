/**
 * Orchestrates building, persisting, and loading a MaterializedView
 * composed of a LogicalIndex + PropertyIndexReader.
 *
 * Five entry points:
 * - `build(state)` — from a WarpState (in-memory)
 * - `persistIndexTree(tree, persistence)` — write shards to Git storage
 * - `loadFromOids(shardOids, storage)` — hydrate from blob OIDs
 * - `applyDiff(existingTree, diff, state)` — incremental update from PatchDiff
 * - `verifyIndex({ state, logicalIndex, options })` — cross-provider verification
 *
 * @module domain/services/MaterializedViewService
 */

import defaultCodec from '../utils/defaultCodec.ts';
import LogicalIndexBuildService from './index/LogicalIndexBuildService.ts';
import LogicalIndexReader from './index/LogicalIndexReader.ts';
import PropertyIndexReader from './index/PropertyIndexReader.ts';
import IncrementalIndexUpdater from './index/IncrementalIndexUpdater.ts';
import WarpError from '../errors/WarpError.ts';
import { buildInMemoryPropertyReader, partitionShardOids, shardToEntry } from './MaterializedViewHelpers.ts';
import { verifyIndex, type VerifyResult, type VerifyIndexParams } from './MaterializedViewVerifier.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import type LoggerPort from '../../ports/LoggerPort.ts';
import type IndexStorePort from '../../ports/IndexStorePort.ts';
import type IndexStoragePort from '../../ports/IndexStoragePort.ts';
import type WarpState from './state/WarpState.ts';
import type { PatchDiff } from '../types/PatchDiff.ts';
import type { IndexShard } from '../artifacts/IndexShard.ts';
import type { LogicalIndex } from './index/logicalIndexHelpers.ts';

export type { VerifyResult, VerifyError } from './MaterializedViewVerifier.ts';

// ── Public types ──────────────────────────────────────────────────────────────

export interface BuildResult {
  tree: Record<string, Uint8Array>;
  logicalIndex: LogicalIndex;
  propertyReader: PropertyIndexReader;
  receipt: Record<string, unknown>; // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
}

export interface LoadResult {
  logicalIndex: LogicalIndex;
  propertyReader: PropertyIndexReader;
}

// ── Service ───────────────────────────────────────────────────────────────────

export interface MaterializedViewServiceOptions {
  codec?: CodecPort;
  logger?: LoggerPort;
  indexStore?: IndexStorePort;
}

export default class MaterializedViewService {
  private readonly _codec: CodecPort;
  private readonly _indexStore: IndexStorePort | null;

  constructor(options?: MaterializedViewServiceOptions) {
    const { codec, indexStore } = options ?? {};
    this._codec = codec ?? defaultCodec;
    this._indexStore = indexStore ?? null;
  }

  /**
   * Builds a complete MaterializedView from WarpState.
   */
  build(state: WarpState): BuildResult {
    const svc = new LogicalIndexBuildService();
    const { shards, receipt } = svc.buildShards(state);

    // P5-LEGACY: encode shards for callers that persist via persistIndexTree().
    const tree = this._encodeShardsToTree(shards);

    // Hydrate index directly from domain objects (no encode→decode roundtrip)
    const logicalIndex = new LogicalIndexReader()
      .loadFromShards(shards)
      .toLogicalIndex();

    // P5-LEGACY: property reader uses codec roundtrip (proto-pollution safety).
    const propertyReader = buildInMemoryPropertyReader(tree, this._codec);

    return {
      tree,
      logicalIndex,
      propertyReader,
      receipt: {
        version: receipt.version,
        nodeCount: receipt.nodeCount,
        labelCount: receipt.labelCount,
        shardCount: receipt.shardCount,
      },
    };
  }

  /**
   * Writes each shard as a blob and creates a Git tree object.
   *
   * @returns tree OID
   */
  async persistIndexTree(
    tree: Record<string, Uint8Array>,
    persistence: {
      writeBlob(buf: Uint8Array): Promise<string>;
      writeTree(entries: string[]): Promise<string>;
    },
  ): Promise<string> {
    const paths = Object.keys(tree).sort();
    const oids = await Promise.all(
      paths.map((p) => {
        const blob = tree[p];
        if (!blob) {
          throw new WarpError(
            `Missing blob for path: ${p}`,
            'E_MATERIALIZED_VIEW_MISSING_BLOB',
            { context: { path: p } },
          );
        }
        return persistence.writeBlob(blob);
      }),
    );

    const entries = paths.map((path, i) => {
      const oid = oids[i];
      if (oid === undefined) {
        throw new WarpError(
          `Missing blob OID for path: ${path}`,
          'E_MATERIALIZED_VIEW_MISSING_BLOB_OID',
          { context: { path } },
        );
      }
      return `100644 blob ${oid}\t${path}`;
    });
    return await persistence.writeTree(entries);
  }

  /**
   * Hydrates a LogicalIndex + PropertyIndexReader from blob OIDs.
   *
   * @param shardOids - path to blob OID
   * @param storage - blob storage backend
   */
  async loadFromOids(
    shardOids: Record<string, string>,
    storage: { readBlob(oid: string): Promise<Uint8Array> },
  ): Promise<LoadResult> {
    const { indexOids, propOids } = partitionShardOids(shardOids);

    const reader = new LogicalIndexReader({
      codec: this._codec,
      ...(this._indexStore ? { indexStore: this._indexStore } : {}),
    });
    await reader.loadFromOids(indexOids, storage);
    const logicalIndex = reader.toLogicalIndex();

    // PropertyIndexReader is a .js file that only calls `readBlob` at runtime.
    // The caller's narrower type satisfies the runtime contract.
    const propertyReader = new PropertyIndexReader({
      storage: storage as unknown as IndexStoragePort, // nosemgrep: ts-no-double-cast -- 0025A; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
      codec: this._codec,
      ...(this._indexStore ? { indexStore: this._indexStore } : {}),
    });
    propertyReader.setup(propOids);

    return { logicalIndex, propertyReader };
  }

  /**
   * Applies a PatchDiff incrementally to an existing index tree.
   */
  applyDiff(params: {
    existingTree: Record<string, Uint8Array>;
    diff: PatchDiff;
    state: WarpState;
  }): BuildResult {
    const { existingTree, diff, state } = params;
    const updater = new IncrementalIndexUpdater({ codec: this._codec });
    const loadShard = (path: string): Uint8Array | undefined => existingTree[path];
    const dirtyShards = updater.computeDirtyShards({ diff, state, loadShard });
    const tree = { ...existingTree, ...dirtyShards };

    const logicalIndex = new LogicalIndexReader({ codec: this._codec })
      .loadFromTree(tree)
      .toLogicalIndex();
    const propertyReader = buildInMemoryPropertyReader(tree, this._codec);

    // Note: receipt.cbor is written only by the full build (LogicalIndexBuildService).
    // IncrementalIndexUpdater never writes a receipt, so the receipt returned here
    // reflects the state at the time of the original full build, not the current
    // incremental update. Consumers should not rely on it for incremental accuracy.
    const receiptBytes = tree['receipt.cbor'];
    const receipt = receiptBytes ? this._codec.decode<Record<string, unknown>>(receiptBytes) : {}; // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B

    return { tree, logicalIndex, propertyReader, receipt };
  }

  /**
   * Verifies index integrity by sampling alive nodes and comparing
   * bitmap neighbor queries against adjacency-based ground truth.
   */
  verifyIndex(params: VerifyIndexParams): VerifyResult {
    return verifyIndex(params);
  }

  /**
   * Encodes IndexShard instances to a tree of CBOR bytes.
   *
   * P5-LEGACY: This exists to support callers that persist via
   * persistIndexTree(tree, persistence). Will be removed when callers
   * migrate to IndexStorePort.writeShards().
   */
  private _encodeShardsToTree(shards: IndexShard[]): Record<string, Uint8Array> {
    const tree = new Map<string, Uint8Array>();
    for (const shard of shards) {
      const { path, payload } = shardToEntry(shard);
      tree.set(path, this._codec.encode(payload));
    }
    return Object.fromEntries(tree);
  }
}
