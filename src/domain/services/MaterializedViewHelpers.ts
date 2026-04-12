/**
 * Low-level helpers for MaterializedViewService.
 *
 * Provides in-memory property reader construction, shard OID partitioning,
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
import PropertyIndexReader from './index/PropertyIndexReader.js';
import type CodecPort from '../../ports/CodecPort.ts';
import type IndexStoragePort from '../../ports/IndexStoragePort.ts';
import type { IndexShard } from '../artifacts/IndexShard.ts';

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
  const propShardOids: Record<string, string> = {};
  for (const path of Object.keys(tree)) {
    if (path.startsWith(PROPS_PREFIX)) {
      propShardOids[path] = path;
    }
  }

  // PropertyIndexReader is a .js file with JSDoc types; only `readBlob` is
  // called at runtime. The narrower in-memory object satisfies the runtime
  // contract of IndexStoragePort, so this seam cast is safe.
  const storage = {
    /** Reads a shard blob from the in-memory tree map. */
    readBlob: (oid: string): Promise<Uint8Array> => Promise.resolve(tree[oid] as Uint8Array),
  } as unknown as IndexStoragePort;

  const reader = new PropertyIndexReader({ storage, codec });
  reader.setup(propShardOids);
  return reader;
}

// ── Shard OID partitioning ────────────────────────────────────────────────────

/**
 * Partitions shard OID entries into index vs property buckets.
 */
export function partitionShardOids(shardOids: Record<string, string>): {
  indexOids: Record<string, string>;
  propOids: Record<string, string>;
} {
  const indexOids: Record<string, string> = {};
  const propOids: Record<string, string> = {};

  for (const [path, oid] of Object.entries(shardOids)) {
    if (path.startsWith(PROPS_PREFIX)) {
      propOids[path] = oid;
    } else {
      indexOids[path] = oid;
    }
  }
  return { indexOids, propOids };
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
export function shardToEntry(shard: IndexShard): { path: string; payload: unknown } {
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
    `MaterializedViewService: unknown IndexShard type (shardKey=${shard.shardKey})`,
    { code: 'E_MATERIALIZED_VIEW_UNKNOWN_SHARD', context: { shardKey: shard.shardKey } },
  );
}
