/**
 * @fileoverview Empty Graph - A graph database substrate using Git commits pointing to the empty tree.
 */

import GraphService from './src/domain/services/GraphService.js';
import GitGraphAdapter from './src/infrastructure/adapters/GitGraphAdapter.js';
import GraphNode from './src/domain/entities/GraphNode.js';
import BitmapIndexService from './src/domain/services/BitmapIndexService.js';
import CacheRebuildService from './src/domain/services/CacheRebuildService.js';

export {
  GraphService,
  GitGraphAdapter,
  GraphNode,
  BitmapIndexService,
  CacheRebuildService
};

/**
 * Facade class for the EmptyGraph library.
 */
export default class EmptyGraph {
  /**
   * @param {Object} options
   * @param {import('../plumbing/index.js').default} options.plumbing
   */
  constructor({ plumbing }) {
    const persistence = new GitGraphAdapter({ plumbing });
    this.service = new GraphService({ persistence });
    this.rebuildService = new CacheRebuildService({ persistence, graphService: this.service });
    /** @type {BitmapIndexService|null} */
    this._index = null;
  }

  /**
   * Creates a new graph node.
   * @param {Object} options
   * @param {string} options.message - The node's data/message
   * @param {string[]} [options.parents=[]] - Parent commit SHAs
   * @param {boolean} [options.sign=false] - Whether to GPG-sign
   * @returns {Promise<string>} SHA of the created commit
   * @example
   * const sha = await graph.createNode({
   *   message: 'My node data',
   *   parents: ['abc123...']
   * });
   */
  async createNode(options) {
    return this.service.createNode(options);
  }

  /**
   * Reads a node's message.
   * @param {string} sha - Commit SHA to read
   * @returns {Promise<string>} The node's message
   * @example
   * const message = await graph.readNode(childSha);
   */
  async readNode(sha) {
    return this.service.readNode(sha);
  }

  /**
   * Lists nodes in history (for small graphs).
   * @param {Object} options
   * @param {string} options.ref - Git ref to start from
   * @param {number} [options.limit=50] - Maximum nodes to return
   * @returns {Promise<GraphNode[]>}
   * @example
   * const nodes = await graph.listNodes({ ref: 'HEAD', limit: 100 });
   */
  async listNodes(options) {
    return this.service.listNodes(options);
  }

  /**
   * Async generator for streaming large graphs.
   * @param {Object} options
   * @param {string} options.ref - Git ref to start from
   * @param {number} [options.limit=1000000] - Maximum nodes to yield
   * @yields {GraphNode}
   * @example
   * for await (const node of graph.iterateNodes({ ref: 'HEAD' })) {
   *   console.log(node.message);
   * }
   */
  async *iterateNodes(options) {
    yield* this.service.iterateNodes(options);
  }

  /**
   * Rebuilds the bitmap index for the graph.
   * @param {string} ref - Git ref to rebuild from
   * @returns {Promise<string>} OID of the created index tree
   * @example
   * const treeOid = await graph.rebuildIndex('HEAD');
   */
  async rebuildIndex(ref) {
    return this.rebuildService.rebuild(ref);
  }

  /**
   * Loads a pre-built bitmap index for O(1) queries.
   * @param {string} treeOid - OID of the index tree (from rebuildIndex)
   * @returns {Promise<void>}
   * @example
   * const treeOid = await graph.rebuildIndex('HEAD');
   * await graph.loadIndex(treeOid);
   * const parents = await graph.getParents(someSha);
   */
  async loadIndex(treeOid) {
    this._index = await this.rebuildService.load(treeOid);
  }

  /**
   * Gets parent SHAs for a node using the bitmap index.
   * Requires loadIndex() to be called first.
   * @param {string} sha - The node's SHA
   * @returns {Promise<string[]>} Array of parent SHAs
   * @throws {Error} If index is not loaded
   * @example
   * await graph.loadIndex(indexOid);
   * const parents = await graph.getParents(childSha);
   */
  async getParents(sha) {
    if (!this._index) {
      throw new Error('Index not loaded. Call loadIndex(treeOid) first.');
    }
    return this._index.getParents(sha);
  }

  /**
   * Gets child SHAs for a node using the bitmap index.
   * Requires loadIndex() to be called first.
   * @param {string} sha - The node's SHA
   * @returns {Promise<string[]>} Array of child SHAs
   * @throws {Error} If index is not loaded
   * @example
   * await graph.loadIndex(indexOid);
   * const children = await graph.getChildren(parentSha);
   */
  async getChildren(sha) {
    if (!this._index) {
      throw new Error('Index not loaded. Call loadIndex(treeOid) first.');
    }
    return this._index.getChildren(sha);
  }

  /**
   * Checks if an index is currently loaded.
   * @returns {boolean}
   */
  get hasIndex() {
    return this._index !== null;
  }
}