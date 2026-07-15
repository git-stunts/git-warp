import type WarpStream from '../domain/stream/WarpStream.ts';
import type { IndexShard } from '../domain/artifacts/IndexShard.ts';
import type CodecValue from '../domain/types/codec/CodecValue.ts';
import type AssetHandle from '../domain/storage/AssetHandle.ts';
import type BundleHandle from '../domain/storage/BundleHandle.ts';

/**
 * IndexStorePort — domain-facing port for index shard persistence.
 *
 * Speaks `IndexShard` domain objects, opaque storage handles, and
 * `WarpStream`. The adapter owns encoding and delegates immutable
 * asset and bundle lifecycles to configured storage.
 *
 * Two-stage persistence boundary (P5 compliance):
 *   Domain Service → IndexStorePort (domain objects)
 *     → Adapter (codec + asset/bundle capabilities) → storage
 *
 * Returns are typed via `CodecValue` (the structured-codec transport
 * union) when the payload is heterogeneous — e.g. `decodeShard` is
 * called for meta, edge, label, property, and receipt shards that
 * share no common class. Callers narrow via per-call generic
 * specialization: `decodeShard<SpecificShape>(handle)`.
 *
 * @see CborIndexStoreAdapter - reference implementation
 *
 * @module ports/IndexStorePort
 */

/** Port for index shard persistence. */
export default abstract class IndexStorePort {
  /**
   * Stages a stream of `IndexShard` records as an ordered bundle.
   *
   * The adapter internally encodes and stages each shard as an asset,
   * then assembles the opaque handles into a deterministic bundle.
   */
  abstract writeShards(_shardStream: WarpStream<IndexShard>): Promise<BundleHandle>;

  /**
   * Scans all shards in an index bundle, yielding `IndexShard`
   * records.
   *
   * Unbounded streaming alternative to reading all blobs at once.
   * The adapter reads bundle members, decodes assets, classifies by
   * path pattern, and constructs the appropriate `IndexShard`
   * subclass.
   */
  abstract scanShards(_indexHandle: BundleHandle): WarpStream<IndexShard>;

  /**
   * Reads the path-to-handle mapping from an index bundle.
   *
   * Bounded operation — returns member descriptors without reading or
   * decoding any shard contents.
   */
  abstract readShardHandles(
    _indexHandle: BundleHandle,
  ): Promise<Readonly<Record<string, AssetHandle>>>;

  /** Streams one encoded shard without opening unrelated index members. */
  abstract openShard(_shardHandle: AssetHandle): AsyncIterable<Uint8Array>;

  /**
   * Reads and decodes a single shard asset by opaque handle.
   *
   * Bounded operation — reads one blob and returns the decoded
   * structured value. The default return type is the
   * structured-codec transport union `CodecValue`; callers that
   * know which shard class the blob was encoded from specialize
   * the per-call generic parameter, e.g.
   * `decodeShard<PropertyShardPayload>(handle)`.
   */
  abstract decodeShard<TDecoded extends CodecValue = CodecValue>(
    _shardHandle: AssetHandle,
  ): Promise<TDecoded>;
}
