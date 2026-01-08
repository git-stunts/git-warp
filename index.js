/**
 * @fileoverview Empty Graph - A graph database substrate using Git commits pointing to the empty tree.
 */

import GraphService from './src/domain/services/GraphService.js';
import GitGraphAdapter from './src/infrastructure/adapters/GitGraphAdapter.js';
import GraphNode from './src/domain/entities/GraphNode.js';

export {
  GraphService,
  GitGraphAdapter,
  GraphNode
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
  }

  async createNode(options) {
    return this.service.createNode(options);
  }

  async readNode({ sha }) {
    return this.service.readNode(sha);
  }

  async listNodes(options) {
    return this.service.listNodes(options);
  }
}
