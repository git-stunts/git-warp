/**
 * Abstract port for graph persistence operations.
 *
 * Defines the contract for reading and writing graph data to a Git-backed
 * storage layer. Concrete adapters (e.g., GitGraphAdapter) implement this
 * interface to provide actual Git operations.
 *
 * This is a **composite port** that implements the union of five focused ports:
 *
 * - {@link CommitPort} — commit creation, reading, logging, counting, ping
 * - {@link BlobPort} — blob read/write
 * - {@link TreePort} — tree read/write, emptyTree getter
 * - {@link RefPort} — ref update/read/delete
 * - {@link ConfigPort} — git config get/set
 *
 * Domain services should document which focused port(s) they actually depend on
 * via JSDoc, even though they accept the full GraphPersistencePort at runtime.
 * This enables future narrowing without breaking backward compatibility.
 *
 * All methods throw by default and must be overridden by implementations.
 *
 * @abstract
 * @implements {CommitPort}
 * @implements {BlobPort}
 * @implements {TreePort}
 * @implements {RefPort}
 * @implements {ConfigPort}
 */
export default class GraphPersistencePort {
  /**
   * Creates a commit pointing to the empty tree.
   * @param {Object} options
   * @param {string} options.message - The commit message (typically CBOR-encoded patch data)
   * @param {string[]} [options.parents=[]] - Parent commit SHAs for the commit graph
   * @param {boolean} [options.sign=false] - Whether to GPG-sign the commit
   * @returns {Promise<string>} The SHA of the created commit
   * @throws {Error} If not implemented by a concrete adapter
   */
  async commitNode(_options) {
    throw new Error('Not implemented');
  }

  /**
   * Retrieves the raw commit message for a given SHA.
   * @param {string} sha - The commit SHA to read
   * @returns {Promise<string>} The raw commit message content
   * @throws {Error} If not implemented by a concrete adapter
   */
  async showNode(_sha) {
    throw new Error('Not implemented');
  }

  /**
   * Gets full commit metadata for a node.
   * @param {string} sha - The commit SHA to retrieve
   * @returns {Promise<{sha: string, message: string, author: string, date: string, parents: string[]}>}
   *   Full commit metadata including SHA, message, author, date, and parent SHAs
   * @throws {Error} If not implemented by a concrete adapter
   */
  async getNodeInfo(_sha) {
    throw new Error('Not implemented');
  }

  /**
   * Streams git log output for a ref.
   * @param {Object} options
   * @param {string} options.ref - The Git ref to log from
   * @param {number} [options.limit=1000000] - Maximum number of commits to return
   * @param {string} [options.format] - Custom format string for git log
   * @returns {Promise<import('node:stream').Readable>} A readable stream of log output
   * @throws {Error} If not implemented by a concrete adapter
   */
  async logNodesStream(_options) {
    throw new Error('Not implemented');
  }

  /**
   * Returns raw git log output for a ref.
   * @param {Object} options
   * @param {string} options.ref - The Git ref to log from
   * @param {number} [options.limit=50] - Maximum number of commits to return
   * @param {string} [options.format] - Custom format string for git log
   * @returns {Promise<string>} The raw log output
   * @throws {Error} If not implemented by a concrete adapter
   */
  async logNodes(_options) {
    throw new Error('Not implemented');
  }

  /**
   * The well-known SHA for Git's empty tree object.
   * All WARP graph commits point to this tree so that no files appear in the working directory.
   * @type {string}
   * @readonly
   */
  get emptyTree() {
    throw new Error('Not implemented');
  }

  /**
   * Writes content as a Git blob and returns its OID.
   * @param {Buffer|string} content - The blob content to write
   * @returns {Promise<string>} The Git OID of the created blob
   * @throws {Error} If not implemented by a concrete adapter
   */
  async writeBlob(_content) {
    throw new Error('Not implemented');
  }

  /**
   * Creates a Git tree from mktree-formatted entries.
   * @param {string[]} entries - Lines in git mktree format (e.g., "100644 blob <oid>\t<path>")
   * @returns {Promise<string>} The Git OID of the created tree
   * @throws {Error} If not implemented by a concrete adapter
   */
  async writeTree(_entries) {
    throw new Error('Not implemented');
  }

  /**
   * Reads a tree and returns a map of path to content.
   * @param {string} treeOid - The tree OID to read
   * @returns {Promise<Record<string, Buffer>>} Map of file path to blob content
   * @throws {Error} If not implemented by a concrete adapter
   */
  async readTree(_treeOid) {
    throw new Error('Not implemented');
  }

  /**
   * Reads a tree and returns a map of path to blob OID.
   * Useful for lazy-loading shards without reading all blob contents.
   * @param {string} treeOid - The tree OID to read
   * @returns {Promise<Record<string, string>>} Map of file path to blob OID
   * @throws {Error} If not implemented by a concrete adapter
   */
  async readTreeOids(_treeOid) {
    throw new Error('Not implemented');
  }

  /**
   * Reads the content of a Git blob.
   * @param {string} oid - The blob OID to read
   * @returns {Promise<Buffer>} The blob content
   * @throws {Error} If not implemented by a concrete adapter
   */
  async readBlob(_oid) {
    throw new Error('Not implemented');
  }

  /**
   * Updates a ref to point to an OID.
   * @param {string} ref - The ref name (e.g., 'refs/warp/events/writers/alice')
   * @param {string} oid - The OID to point to
   * @returns {Promise<void>}
   * @throws {Error} If not implemented by a concrete adapter
   */
  async updateRef(_ref, _oid) {
    throw new Error('Not implemented');
  }

  /**
   * Reads the OID a ref points to.
   * @param {string} ref - The ref name
   * @returns {Promise<string|null>} The OID, or null if the ref does not exist
   * @throws {Error} If not implemented by a concrete adapter
   */
  async readRef(_ref) {
    throw new Error('Not implemented');
  }

  /**
   * Deletes a ref.
   * @param {string} ref - The ref name to delete
   * @returns {Promise<void>}
   * @throws {Error} If not implemented by a concrete adapter
   */
  async deleteRef(_ref) {
    throw new Error('Not implemented');
  }

  /**
   * Pings the repository to verify accessibility.
   * @returns {Promise<{ok: boolean, latencyMs: number}>} Health check result with latency
   * @throws {Error} If not implemented by a concrete adapter
   */
  async ping() {
    throw new Error('Not implemented');
  }

  /**
   * Counts nodes reachable from a ref without loading them into memory.
   * @param {string} ref - Git ref to count from (e.g., 'HEAD', 'main', or a SHA)
   * @returns {Promise<number>} The count of reachable nodes
   * @throws {Error} If not implemented by a concrete adapter
   */
  async countNodes(_ref) {
    throw new Error('Not implemented');
  }

  /**
   * Reads a git config value.
   * @param {string} key - The config key to read (e.g., 'warp.writerId.events')
   * @returns {Promise<string|null>} The config value, or null if not set
   * @throws {Error} If not implemented by a concrete adapter
   */
  async configGet(_key) {
    throw new Error('Not implemented');
  }

  /**
   * Sets a git config value.
   * @param {string} key - The config key to set (e.g., 'warp.writerId.events')
   * @param {string} value - The value to set
   * @returns {Promise<void>}
   * @throws {Error} If not implemented by a concrete adapter
   */
  async configSet(_key, _value) {
    throw new Error('Not implemented');
  }
}
