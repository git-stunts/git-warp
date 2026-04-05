import WarpError from '../domain/errors/WarpError.js';

/**
 * Port for index shard persistence.
 *
 * Domain-facing port that speaks IndexShard domain objects and
 * WarpStream. No bytes cross this boundary. The adapter owns the
 * codec and talks to raw Git ports (BlobPort, TreePort) internally.
 *
 * Two-stage persistence boundary (P5 compliance):
 *   Domain Service → IndexStorePort (domain objects)
 *     → Adapter (codec + raw Git ports) → Git
 *
 * @abstract
 * @see CborIndexStoreAdapter - Reference implementation
 */
export default class IndexStorePort {
  /**
   * Persists a stream of IndexShard records as a Git tree.
   *
   * The adapter internally encodes each shard, writes blobs,
   * and assembles a sorted tree. Returns the tree OID.
   *
   * @param {import('../domain/stream/WarpStream.js').default<import('../domain/artifacts/IndexShard.js').IndexShard>} _shardStream
   * @returns {Promise<string>} The Git tree OID
   * @throws {Error} If not implemented by a concrete adapter
   */
  async writeShards(_shardStream) {
    throw new WarpError('IndexStorePort.writeShards() not implemented', 'E_NOT_IMPLEMENTED');
  }

  /**
   * Scans all shards in an index tree, yielding IndexShard records.
   *
   * Unbounded streaming alternative to reading all blobs at once.
   * The adapter reads tree entries, decodes blobs, classifies by
   * path pattern, and constructs the appropriate IndexShard subclass.
   *
   * @param {string} _treeOid - The index tree OID
   * @returns {import('../domain/stream/WarpStream.js').default<import('../domain/artifacts/IndexShard.js').IndexShard>}
   * @throws {Error} If not implemented by a concrete adapter
   */
  scanShards(_treeOid) {
    throw new WarpError('IndexStorePort.scanShards() not implemented', 'E_NOT_IMPLEMENTED');
  }

  /**
   * Reads the path→OID mapping from an index tree.
   *
   * Bounded operation — returns the tree directory listing
   * without reading or decoding any blob contents.
   *
   * @param {string} _treeOid - The index tree OID
   * @returns {Promise<Record<string, string>>} Map of path → blob OID
   * @throws {Error} If not implemented by a concrete adapter
   */
  async readShardOids(_treeOid) {
    throw new WarpError('IndexStorePort.readShardOids() not implemented', 'E_NOT_IMPLEMENTED');
  }

  /**
   * Reads and decodes a single shard blob by OID.
   *
   * Bounded operation — reads one blob and returns the decoded
   * JavaScript object. The caller interprets the shape.
   *
   * @param {string} _blobOid - The blob OID to read
   * @returns {Promise<unknown>} The decoded shard data
   * @throws {Error} If not implemented by a concrete adapter
   */
  async decodeShard(_blobOid) {
    throw new WarpError('IndexStorePort.decodeShard() not implemented', 'E_NOT_IMPLEMENTED');
  }
}
