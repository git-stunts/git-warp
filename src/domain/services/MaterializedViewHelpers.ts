/**
 * Low-level helpers for MaterializedViewService.
 *
 * Provides in-memory property reader construction, shard-handle partitioning,
 * and the legacy shard-to-tree-entry mapper.
 *
 * P5-LEGACY: _shardToEntry and buildInMemoryPropertyReader exist to support
 * callers that persist via persistIndexTree(). Will be removed when callers
 * migrate to IndexStorePort.writeShards().
 *
 * @module domain/services/MaterializedViewHelpers
 */

import { MetaShard } from '../artifacts/MetaShard.ts';
import { EdgeShard } from '../artifacts/EdgeShard.ts';
import { LabelShard } from '../artifacts/LabelShard.ts';
import { PropertyShard } from '../artifacts/PropertyShard.ts';
import { ReceiptShard } from '../artifacts/ReceiptShard.ts';
import IndexError from '../errors/IndexError.ts';
import PropertyIndexReader from './index/PropertyIndexReader.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import type { IndexShard } from '../artifacts/IndexShard.ts';
import type AssetHandle from '../storage/AssetHandle.ts';

/** Prefix for property shard paths in the index tree. */
export const PROPS_PREFIX = 'props_';

// ── In-memory property reader ─────────────────────────────────────────────────

/**
 * Creates a PropertyIndexReader backed by an in-memory tree map.
 */
export function buildInMemoryPropertyReader(
  tree: Record<string, Uint8Array>,
  codec: CodecPort,
): PropertyIndexReader {
  const reader = new PropertyIndexReader({ codec });
  reader.setupTree(tree);
  return reader;
}

// ── Shard handle partitioning ─────────────────────────────────────────────────

/**
 * Partitions shard handles into index vs property buckets.
 */
export function partitionShardHandles(
  shardHandles: Readonly<Record<string, AssetHandle>>,
): {
  indexHandles: Readonly<Record<string, AssetHandle>>;
  propHandles: Readonly<Record<string, AssetHandle>>;
} {
  const indexHandles = new Map<string, AssetHandle>();
  const propHandles = new Map<string, AssetHandle>();

  for (const [path, handle] of Object.entries(shardHandles)) {
    if (path.startsWith(PROPS_PREFIX)) {
      propHandles.set(path, handle);
    } else {
      indexHandles.set(path, handle);
    }
  }
  return {
    indexHandles: Object.freeze(Object.fromEntries(indexHandles)),
    propHandles: Object.freeze(Object.fromEntries(propHandles)),
  };
}

// ── Shard → tree entry ────────────────────────────────────────────────────────

/**
 * Maps an IndexShard to its tree path and serializable payload.
 *
 * P5-LEGACY: Duplicates IndexShardEncodeTransform._encode() in
 * infrastructure. Exists only to support _encodeShardsToTree() for
 * the applyDiff() legacy path. Dies when IncrementalIndexUpdater
 * is migrated to IndexStorePort.
 */
export function shardToEntry(shard: IndexShard): { path: string; payload: unknown } { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  if (shard instanceof MetaShard) {
    return {
      path: `meta_${shard.shardKey}.cbor`,
      payload: { nodeToGlobal: shard.nodeToGlobal, nextLocalId: shard.nextLocalId, alive: shard.alive },
    };
  }
  if (shard instanceof EdgeShard) {
    return { path: `${shard.direction}_${shard.shardKey}.cbor`, payload: shard.buckets };
  }
  if (shard instanceof LabelShard) {
    return { path: 'labels.cbor', payload: shard.labels };
  }
  if (shard instanceof PropertyShard) {
    return { path: `props_${shard.shardKey}.cbor`, payload: shard.entries };
  }
  if (shard instanceof ReceiptShard) {
    return {
      path: 'receipt.cbor',
      payload: {
        version: shard.version,
        nodeCount: shard.nodeCount,
        labelCount: shard.labelCount,
        shardCount: shard.shardCount,
      },
    };
  }
  throw new IndexError(
    `MaterializedViewService: unknown IndexShard type (shardKey=${shard.shardKey})`, // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
    { code: 'E_MATERIALIZED_VIEW_UNKNOWN_SHARD', context: { shardKey: shard.shardKey } },
  );
}
