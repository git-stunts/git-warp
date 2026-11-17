import type { MetaShard } from '../domain/artifacts/MetaShard.ts';
import type { EdgeShard } from '../domain/artifacts/EdgeShard.ts';
import type { LabelShard } from '../domain/artifacts/LabelShard.ts';
import type { IndexShard } from '../domain/artifacts/IndexShard.ts';
import type { PropValue } from '../domain/types/PropValue.ts';

/**
 * Encoded in-memory index tree, keyed by storage path.
 *
 * Domain code holds it as an opaque value. Only the adapter behind
 * `IndexShardTreePort` reads or writes its paths and bytes.
 */
export type EncodedIndexTree = Readonly<Record<string, Uint8Array>>;

/** Validated property bags of one property shard, keyed by node ID. */
export type IndexedPropertyEntries = ReadonlyMap<string, Readonly<{ [key: string]: PropValue }>>;

/** Edge shard direction: `fwd` keys by source node, `rev` keys by target node. */
export type IndexEdgeDirection = 'fwd' | 'rev';

/**
 * Port for synchronous semantic access to one in-memory encoded index tree.
 *
 * `IncrementalIndexUpdater` reads the shards that a diff touches and returns
 * rewritten semantic shards. `MaterializedViewService` encodes a full build
 * with `withShards()`, and rebuilds its readers from `readIndexShards()` and
 * `readProperties()`. So the domain does not encode or decode this tree: the
 * adapter owns storage paths, decoding, validation, and encoding. A read
 * returns `null` when the shard is absent, and throws an `IndexError` when the
 * shard is malformed.
 *
 * Obtain an instance from `IndexStorePort.openShardTree()`.
 */
export default abstract class IndexShardTreePort {
  abstract readMeta(_shardKey: string): MetaShard | null;

  abstract readEdges(_direction: IndexEdgeDirection, _shardKey: string): EdgeShard | null;

  abstract readLabels(): LabelShard | null;

  abstract readProperties(_shardKey: string): IndexedPropertyEntries | null;

  /**
   * Reads every meta, edge, and label shard of the tree, in path order.
   *
   * Property and receipt shards are not index shards, so this read skips
   * them. It throws an `IndexError` when a shard is malformed, or when the
   * path of an index shard names a shard key outside the key layout that the
   * index builders write.
   */
  abstract readIndexShards(): ReadonlyArray<MetaShard | EdgeShard | LabelShard>;

  /** Returns a new encoded tree: this tree with each given shard encoded over its path. */
  abstract withShards(_shards: readonly IndexShard[]): Record<string, Uint8Array>;
}
