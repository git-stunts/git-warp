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
   * @param {{ message: string, parents?: string[], sign?: boolean }} _options
   * @returns {Promise<string>} The SHA of the created commit
   * @throws {Error} If not implemented by a concrete adapter
   */
  async commitNode(_options) {
    throw new Error('CommitPort.commitNode() not implemented');
  }

  /**
   * Retrieves the raw commit message for a given SHA.
   * @param {string} _sha - The commit SHA to read
   * @returns {Promise<string>} The raw commit message content
   * @throws {Error} If not implemented by a concrete adapter
   */
  async showNode(_sha) {
    throw new Error('CommitPort.showNode() not implemented');
  }

  /**
   * Gets full commit metadata for a node.
   * @param {string} _sha - The commit SHA to retrieve
   * @returns {Promise<{sha: string, message: string, author: string, date: string, parents: string[]}>}
   *   Full commit metadata including SHA, message, author, date, and parent SHAs
   * @throws {Error} If not implemented by a concrete adapter
   */
  async getNodeInfo(_sha) {
    throw new Error('CommitPort.getNodeInfo() not implemented');
  }

  /**
   * Returns raw git log output for a ref.
   * @param {{ ref: string, limit?: number, format?: string }} _options
   * @returns {Promise<string>} The raw log output
   * @throws {Error} If not implemented by a concrete adapter
   */
  async logNodes(_options) {
    throw new Error('CommitPort.logNodes() not implemented');
  }

  /**
   * Streams git log output for a ref.
   * @param {{ ref: string, limit?: number, format?: string }} _options
   * @returns {Promise<import('node:stream').Readable>} A readable stream of log output
   * @throws {Error} If not implemented by a concrete adapter
   */
  async logNodesStream(_options) {
    throw new Error('CommitPort.logNodesStream() not implemented');
  }

  /**
   * Counts nodes reachable from a ref without loading them into memory.
   * @param {string} _ref - Git ref to count from (e.g., 'HEAD', 'main', or a SHA)
   * @returns {Promise<number>} The count of reachable nodes
   * @throws {Error} If not implemented by a concrete adapter
   */
  async countNodes(_ref) {
    throw new Error('CommitPort.countNodes() not implemented');
  }

  /**
   * Creates a commit pointing to a specified tree (not the empty tree).
   * Used by CheckpointService and PatchBuilderV2 for tree-backed commits.
   * @param {{ treeOid: string, parents?: string[], message: string, sign?: boolean }} _options
   * @returns {Promise<string>} The SHA of the created commit
   * @throws {Error} If not implemented by a concrete adapter
   */
  async commitNodeWithTree(_options) {
    throw new Error('CommitPort.commitNodeWithTree() not implemented');
  }

  /**
   * Checks whether a commit exists in the repository.
   * @param {string} _sha - The commit SHA to check
   * @returns {Promise<boolean>} True if the commit exists
   * @throws {Error} If not implemented by a concrete adapter
   */
  async nodeExists(_sha) {
    throw new Error('CommitPort.nodeExists() not implemented');
  }

  /**
   * Retrieves the tree OID for a given commit SHA.
   * @param {string} _sha - The commit SHA to query
   * @returns {Promise<string>} The tree OID pointed to by the commit
   * @throws {Error} If not implemented by a concrete adapter
   */
  async getCommitTree(_sha) {
    throw new Error('CommitPort.getCommitTree() not implemented');
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
