/**
 * Port for Git commit operations.
 *
 * Defines the contract for creating, reading, and querying Git commits.
 * This is one of five focused ports extracted from GraphPersistencePort.
 *
 * @abstract
 * @see GraphPersistencePort - Composite port implementing all five focused ports
 */
export default class CommitPort {
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
    throw new Error('CommitPort.commitNode() not implemented');
  }

  /**
   * Retrieves the raw commit message for a given SHA.
   * @param {string} sha - The commit SHA to read
   * @returns {Promise<string>} The raw commit message content
   * @throws {Error} If not implemented by a concrete adapter
   */
  async showNode(_sha) {
    throw new Error('CommitPort.showNode() not implemented');
  }

  /**
   * Gets full commit metadata for a node.
   * @param {string} sha - The commit SHA to retrieve
   * @returns {Promise<{sha: string, message: string, author: string, date: string, parents: string[]}>}
   *   Full commit metadata including SHA, message, author, date, and parent SHAs
   * @throws {Error} If not implemented by a concrete adapter
   */
  async getNodeInfo(_sha) {
    throw new Error('CommitPort.getNodeInfo() not implemented');
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
    throw new Error('CommitPort.logNodes() not implemented');
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
    throw new Error('CommitPort.logNodesStream() not implemented');
  }

  /**
   * Counts nodes reachable from a ref without loading them into memory.
   * @param {string} ref - Git ref to count from (e.g., 'HEAD', 'main', or a SHA)
   * @returns {Promise<number>} The count of reachable nodes
   * @throws {Error} If not implemented by a concrete adapter
   */
  async countNodes(_ref) {
    throw new Error('CommitPort.countNodes() not implemented');
  }

  /**
   * Pings the repository to verify accessibility.
   * @returns {Promise<{ok: boolean, latencyMs: number}>} Health check result with latency
   * @throws {Error} If not implemented by a concrete adapter
   */
  async ping() {
    throw new Error('CommitPort.ping() not implemented');
  }
}
