/**
 * Port for graph persistence operations.
 */
export default class GraphPersistencePort {
  /**
   * @param {Object} options
   * @param {string} options.message
   * @param {string[]} [options.parents]
   * @param {boolean} [options.sign]
   * @returns {Promise<string>} The SHA of the new node.
   */
  async commitNode(_options) {
    throw new Error('Not implemented');
  }

  /**
   * @param {string} sha
   * @returns {Promise<string>} The raw message content.
   */
  async showNode(_sha) {
    throw new Error('Not implemented');
  }

  /**
   * @param {Object} options
   * @param {string} options.ref
   * @param {number} [options.limit]
   * @returns {Promise<any>} A stream of log output.
   */
  async logNodesStream(_options) {
    throw new Error('Not implemented');
  }

  /**
   * @param {Object} options
   * @param {string} options.ref
   * @param {number} [options.limit]
   * @returns {Promise<string>} The raw log output.
   */
  async logNodes(_options) {
    throw new Error('Not implemented');
  }

  /**
   * @returns {string}
   */
  get emptyTree() {
    throw new Error('Not implemented');
  }

  /**
   * @param {Buffer|string} content
   * @returns {Promise<string>} The Git OID.
   */
  async writeBlob(_content) {
    throw new Error('Not implemented');
  }

  /**
   * @param {string[]} entries - Lines for git mktree.
   * @returns {Promise<string>} The Git OID of the created tree.
   */
  async writeTree(_entries) {
    throw new Error('Not implemented');
  }

  /**
   * Reads a tree and returns a map of path -> content.
   * @param {string} treeOid
   * @returns {Promise<Record<string, Buffer>>}
   */
  async readTree(_treeOid) {
    throw new Error('Not implemented');
  }

  /**
   * Reads a tree and returns a map of path -> blob OID.
   * Useful for lazy-loading shards without reading all blob contents.
   * @param {string} treeOid
   * @returns {Promise<Record<string, string>>}
   */
  async readTreeOids(_treeOid) {
    throw new Error('Not implemented');
  }

  /**
   * @param {string} oid
   * @returns {Promise<Buffer>}
   */
  async readBlob(_oid) {
    throw new Error('Not implemented');
  }

  /**
   * Updates a ref to point to an OID.
   * @param {string} ref - The ref name
   * @param {string} oid - The OID to point to
   * @returns {Promise<void>}
   */
  async updateRef(_ref, _oid) {
    throw new Error('Not implemented');
  }

  /**
   * Reads the OID a ref points to.
   * @param {string} ref - The ref name
   * @returns {Promise<string|null>} The OID or null if ref doesn't exist
   */
  async readRef(_ref) {
    throw new Error('Not implemented');
  }

  /**
   * Deletes a ref.
   * @param {string} ref - The ref name to delete
   * @returns {Promise<void>}
   */
  async deleteRef(_ref) {
    throw new Error('Not implemented');
  }

  /**
   * Pings the repository to verify accessibility.
   * @returns {Promise<{ok: boolean, latencyMs: number}>} Health check result with latency
   */
  async ping() {
    throw new Error('Not implemented');
  }
}
