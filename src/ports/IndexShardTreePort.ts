import type { MetaShard } from '../domain/artifacts/MetaShard.ts';
import type { EdgeShard } from '../domain/artifacts/EdgeShard.ts';
import type { LabelShard } from '../domain/artifacts/LabelShard.ts';
import type { IndexShard } from '../domain/artifacts/IndexShard.ts';
import type { PropValue } from '../domain/types/PropValue.ts';

/** Encoded in-memory index tree, keyed by storage path. Domain code treats it as opaque. */
export type EncodedIndexTree = Readonly<Record<string, Uint8Array>>;

/** Validated property bags of one property shard, keyed by node ID. */
export type IndexedPropertyEntries = ReadonlyMap<string, Readonly<{ [key: string]: PropValue }>>;

/** Edge shard direction: `fwd` keys by source node, `rev` keys by target node. */
export type IndexEdgeDirection = 'fwd' | 'rev';

/**
 * Port for synchronous semantic access to one in-memory encoded index tree.
 *
 * Incremental index updates read the shards that a diff touches and return
 * rewritten semantic shards. The adapter owns storage paths, decoding,
 * validation, and encoding. A read returns `null` when the shard is absent,
 * and throws an `IndexError` when the stored shard is malformed.
 *
 * Obtain an instance from `IndexStorePort.openShardTree()`.
 */
export default abstract class IndexShardTreePort {
  abstract readMeta(_shardKey: string): MetaShard | null;

  abstract readEdges(_direction: IndexEdgeDirection, _shardKey: string): EdgeShard | null;

  abstract readLabels(): LabelShard | null;

  abstract readProperties(_shardKey: string): IndexedPropertyEntries | null;

  /** Returns a new encoded tree: this tree with each given shard encoded over its path. */
  abstract withShards(_shards: readonly IndexShard[]): Record<string, Uint8Array>;
}
