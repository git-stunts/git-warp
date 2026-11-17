/**
 * Orchestrates building and updating a MaterializedView composed of a
 * LogicalIndex + PropertyIndexReader over one in-memory index tree.
 *
 * Three entry points:
 * - `build(state)` — from a WarpState (in-memory)
 * - `applyDiff({ existingTree, diff, state })` — incremental update from a PatchDiff
 * - `verifyIndex({ state, logicalIndex, options })` — cross-provider verification
 *
 * The index tree is an opaque encoded value. `IndexStorePort.openShardTree()`
 * owns its paths, encoding, decoding and validation, so this service builds
 * and reads the tree only through typed shards.
 *
 * @module domain/services/MaterializedViewService
 */

import LogicalIndexBuildService from './index/LogicalIndexBuildService.ts';
import LogicalIndexReader from './index/LogicalIndexReader.ts';
import PropertyIndexReader from './index/PropertyIndexReader.ts';
import IncrementalIndexUpdater from './index/IncrementalIndexUpdater.ts';
import { verifyIndex, type VerifyResult, type VerifyIndexParams } from './MaterializedViewVerifier.ts';
import type IndexStorePort from '../../ports/IndexStorePort.ts';
import type { default as IndexShardTreePort, EncodedIndexTree } from '../../ports/IndexShardTreePort.ts';
import WarpError from '../errors/WarpError.ts';
import type WarpState from './state/WarpState.ts';
import type { PatchDiff } from '../types/PatchDiff.ts';
import type { ReceiptShard } from '../artifacts/ReceiptShard.ts';
import type { LogicalIndex } from './index/logicalIndexHelpers.ts';

export type { VerifyResult, VerifyError } from './MaterializedViewVerifier.ts';

// ── Public types ──────────────────────────────────────────────────────────────

export interface BuildResult {
  tree: Record<string, Uint8Array>;
  logicalIndex: LogicalIndex;
  propertyReader: PropertyIndexReader;
  /** The receipt of a full build; `null` after an incremental update, which writes no receipt. */
  receipt: ReceiptShard | null;
}

// ── Service ───────────────────────────────────────────────────────────────────

export interface MaterializedViewServiceOptions {
  /** Encodes, decodes and checks the in-memory index tree; `build()` and `applyDiff()` require it. */
  indexStore?: IndexStorePort;
}

const EMPTY_INDEX_TREE: EncodedIndexTree = Object.freeze({});

export default class MaterializedViewService {
  private readonly _indexStore: IndexStorePort | null;

  constructor(options?: MaterializedViewServiceOptions) {
    this._indexStore = options?.indexStore ?? null;
  }

  /**
   * Builds a complete MaterializedView from WarpState.
   */
  build(state: WarpState): BuildResult {
    const indexStore = this._requireIndexStore('build');
    const { shards, receipt } = new LogicalIndexBuildService().buildShards(state);
    const tree = indexStore.openShardTree(EMPTY_INDEX_TREE).withShards(shards);
    return {
      tree,
      // The built shards are already typed, so the index needs no decode.
      logicalIndex: new LogicalIndexReader().loadFromShards(shards).toLogicalIndex(),
      propertyReader: propertyReaderOver(indexStore.openShardTree(tree)),
      receipt,
    };
  }

  /**
   * Applies a PatchDiff incrementally to an existing index tree.
   *
   * The updated tree keeps the receipt shard of the last full build, which no
   * longer describes it, so the result carries no receipt.
   */
  applyDiff(params: {
    existingTree: Record<string, Uint8Array>;
    diff: PatchDiff;
    state: WarpState;
  }): BuildResult {
    const indexStore = this._requireIndexStore('applyDiff');
    const { existingTree, diff, state } = params;
    const shards = indexStore.openShardTree(existingTree);
    const dirtyShards = new IncrementalIndexUpdater().computeDirtyShards({ diff, state, shards });
    const tree = shards.withShards(dirtyShards);
    const updated = indexStore.openShardTree(tree);
    return {
      tree,
      logicalIndex: new LogicalIndexReader().loadFromShards(updated.readIndexShards()).toLogicalIndex(),
      propertyReader: propertyReaderOver(updated),
      receipt: null,
    };
  }

  /**
   * Verifies index integrity by sampling alive nodes and comparing
   * bitmap neighbor queries against adjacency-based ground truth.
   */
  verifyIndex(params: VerifyIndexParams): VerifyResult {
    return verifyIndex(params);
  }

  private _requireIndexStore(method: 'build' | 'applyDiff'): IndexStorePort {
    if (this._indexStore === null) {
      throw new WarpError(
        `MaterializedViewService.${method} requires an indexStore`,
        'E_INVALID_DEPENDENCY',
      );
    }
    return this._indexStore;
  }
}

/** Opens a property reader that reads property shards through one tree view. */
function propertyReaderOver(shards: IndexShardTreePort): PropertyIndexReader {
  const reader = new PropertyIndexReader();
  reader.setupShardTree(shards);
  return reader;
}
