/**
 * Orchestrates building, persisting, and loading a MaterializedView
 * composed of a LogicalIndex + PropertyIndexReader.
 *
 * Three entry points:
 * - `build(state)` — from a WarpState (in-memory)
 * - `applyDiff(existingTree, diff, state)` — incremental update from PatchDiff,
 *   reading and writing typed shards through `IndexStorePort.openShardTree()`
 * - `verifyIndex({ state, logicalIndex, options })` — cross-provider verification
 *
 * @module domain/services/MaterializedViewService
 */

import LogicalIndexBuildService from './index/LogicalIndexBuildService.ts';
import LogicalIndexReader from './index/LogicalIndexReader.ts';
import type PropertyIndexReader from './index/PropertyIndexReader.ts';
import IncrementalIndexUpdater from './index/IncrementalIndexUpdater.ts';
import { requireCodec } from './codec/CodecRequirement.ts';
import { buildInMemoryPropertyReader, shardToEntry } from './MaterializedViewHelpers.ts';
import { verifyIndex, type VerifyResult, type VerifyIndexParams } from './MaterializedViewVerifier.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import type IndexStorePort from '../../ports/IndexStorePort.ts';
import WarpError from '../errors/WarpError.ts';
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

// ── Service ───────────────────────────────────────────────────────────────────

export interface MaterializedViewServiceOptions {
  codec?: CodecPort;
  /** Opens the in-memory index tree for `applyDiff()`; required only by that method. */
  indexStore?: IndexStorePort;
}

export default class MaterializedViewService {
  private readonly _codec: CodecPort;
  private readonly _indexStore: IndexStorePort | null;

  constructor(options?: MaterializedViewServiceOptions) {
    const { codec, indexStore } = options ?? {};
    this._codec = requireCodec(codec, 'MaterializedViewService');
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
    const logicalIndex = new LogicalIndexReader({ codec: this._codec })
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
   * Applies a PatchDiff incrementally to an existing index tree.
   */
  applyDiff(params: {
    existingTree: Record<string, Uint8Array>;
    diff: PatchDiff;
    state: WarpState;
  }): BuildResult {
    const { existingTree, diff, state } = params;
    const shards = this._requireIndexStore().openShardTree(existingTree);
    const dirtyShards = new IncrementalIndexUpdater().computeDirtyShards({ diff, state, shards });
    const tree = shards.withShards(dirtyShards);

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

  private _requireIndexStore(): IndexStorePort {
    if (this._indexStore === null) {
      throw new WarpError(
        'MaterializedViewService.applyDiff requires an indexStore',
        'E_INVALID_DEPENDENCY',
      );
    }
    return this._indexStore;
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
