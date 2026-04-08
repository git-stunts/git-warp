import type WarpStream from '../domain/stream/WarpStream.js';
import type { IndexShard } from '../domain/artifacts/IndexShard.js';

/**
 * Port for index shard persistence.
 *
 * Domain-facing port that speaks IndexShard domain objects and
 * WarpStream. No bytes cross this boundary. The adapter owns the
 * codec and talks to raw Git ports (BlobPort, TreePort) internally.
 *
 * Two-stage persistence boundary (P5 compliance):
 *   Domain Service -> IndexStorePort (domain objects)
 *     -> Adapter (codec + raw Git ports) -> Git
 *
 * @see CborIndexStoreAdapter - Reference implementation
 */

/** Port for index shard persistence. */
export default abstract class IndexStorePort {
  /**
   * Persists a stream of IndexShard records as a Git tree.
   *
   * The adapter internally encodes each shard, writes blobs,
   * and assembles a sorted tree. Returns the tree OID.
   */
  abstract writeShards(_shardStream: WarpStream<IndexShard>): Promise<string>;

  /**
   * Scans all shards in an index tree, yielding IndexShard records.
   *
   * Unbounded streaming alternative to reading all blobs at once.
   * The adapter reads tree entries, decodes blobs, classifies by
   * path pattern, and constructs the appropriate IndexShard subclass.
   */
  abstract scanShards(_treeOid: string): WarpStream<IndexShard>;

  /**
   * Reads the path-to-OID mapping from an index tree.
   *
   * Bounded operation -- returns the tree directory listing
   * without reading or decoding any blob contents.
   */
  abstract readShardOids(_treeOid: string): Promise<Record<string, string>>;

  /**
   * Reads and decodes a single shard blob by OID.
   *
   * Bounded operation -- reads one blob and returns the decoded
   * JavaScript object. The caller interprets the shape.
   */
  abstract decodeShard(_blobOid: string): Promise<unknown>;
}
