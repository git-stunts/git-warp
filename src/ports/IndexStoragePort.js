/**
 * Port interface for bitmap index storage operations.
 *
 * This port defines the contract for persisting and retrieving
 * the sharded bitmap index data. Adapters implement this interface
 * to store indexes in different backends (Git, filesystem, etc.).
 *
 * @abstract
 */
export default class IndexStoragePort {
  /**
   * Writes a blob and returns its OID.
   * @param {Buffer|string} content - The blob content
   * @returns {Promise<string>} The OID of the written blob
   * @abstract
   */
  async writeBlob(_content) {
    throw new Error('Not implemented');
  }

  /**
   * Writes a tree from entries and returns its OID.
   * @param {string[]} entries - Tree entries in git mktree format
   * @returns {Promise<string>} The OID of the written tree
   * @abstract
   */
  async writeTree(_entries) {
    throw new Error('Not implemented');
  }

  /**
   * Reads a blob by OID.
   * @param {string} oid - The blob OID
   * @returns {Promise<Buffer>} The blob content
   * @abstract
   */
  async readBlob(_oid) {
    throw new Error('Not implemented');
  }

  /**
   * Reads a tree and returns a map of path → blob OID.
   * Used for lazy-loading index shards.
   * @param {string} treeOid - The tree OID
   * @returns {Promise<Record<string, string>>} Map of path to blob OID
   * @abstract
   */
  async readTreeOids(_treeOid) {
    throw new Error('Not implemented');
  }

  /**
   * Updates a ref to point to an OID.
   * @param {string} ref - The ref name (e.g., 'refs/empty-graph/index')
   * @param {string} oid - The OID to point to
   * @returns {Promise<void>}
   * @abstract
   */
  async updateRef(_ref, _oid) {
    throw new Error('Not implemented');
  }

  /**
   * Reads the OID a ref points to.
   * @param {string} ref - The ref name
   * @returns {Promise<string|null>} The OID or null if ref doesn't exist
   * @abstract
   */
  async readRef(_ref) {
    throw new Error('Not implemented');
  }
}
