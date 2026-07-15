import type WarpStream from '../domain/stream/WarpStream.ts';
import type { IndexShard } from '../domain/artifacts/IndexShard.ts';
import type CodecValue from '../domain/types/codec/CodecValue.ts';
import type AssetHandle from '../domain/storage/AssetHandle.ts';

/**
 * IndexStorePort — domain-facing port for index shard persistence.
 *
 * Speaks `IndexShard` domain objects and `WarpStream`. No bytes
 * cross this boundary. The adapter owns the codec and talks to raw
 * Git ports (BlobPort, TreePort) internally.
 *
 * Two-stage persistence boundary (P5 compliance):
 *   Domain Service → IndexStorePort (domain objects)
 *     → Adapter (codec + raw Git ports) → Git
 *
 * Returns are typed via `CodecValue` (the structured-codec transport
 * union) when the payload is heterogeneous — e.g. `decodeShard` is
 * called for meta, edge, label, property, and receipt shards that
 * share no common class. Callers narrow via per-call generic
 * specialization: `decodeShard<SpecificShape>(oid)`.
 *
 * @see CborIndexStoreAdapter - reference implementation
 *
 * @module ports/IndexStorePort
 */

/** Port for index shard persistence. */
export default abstract class IndexStorePort {
  /**
   * Persists a stream of `IndexShard` records as a Git tree.
   *
   * The adapter internally encodes each shard, writes blobs, and
   * assembles a sorted tree. Returns the tree OID.
   */
  abstract writeShards(_shardStream: WarpStream<IndexShard>): Promise<AssetHandle>;

  /**
   * Scans all shards in an index tree, yielding `IndexShard`
   * records.
   *
   * Unbounded streaming alternative to reading all blobs at once.
   * The adapter reads tree entries, decodes blobs, classifies by
   * path pattern, and constructs the appropriate `IndexShard`
   * subclass.
   */
  abstract scanShards(_indexHandle: AssetHandle): WarpStream<IndexShard>;

  /**
   * Reads the path-to-OID mapping from an index tree.
   *
   * Bounded operation — returns the tree directory listing without
   * reading or decoding any blob contents.
   */
  abstract readShardHandles(
    _indexHandle: AssetHandle,
  ): Promise<Readonly<Record<string, AssetHandle>>>;

  /** Streams one encoded shard without opening unrelated index members. */
  abstract openShard(_shardHandle: AssetHandle): AsyncIterable<Uint8Array>;

  /**
   * Reads and decodes a single shard blob by OID.
   *
   * Bounded operation — reads one blob and returns the decoded
   * structured value. The default return type is the
   * structured-codec transport union `CodecValue`; callers that
   * know which shard class the blob was encoded from specialize
   * the per-call generic parameter, e.g.
   * `decodeShard<PropertyShardPayload>(oid)`.
   */
  abstract decodeShard<TDecoded extends CodecValue = CodecValue>(
    _shardHandle: AssetHandle,
  ): Promise<TDecoded>;
}
