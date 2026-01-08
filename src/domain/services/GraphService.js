import GraphNode from '../entities/GraphNode.js';

/**
 * Domain service for graph database operations.
 */
export default class GraphService {
  /**
   * @param {Object} options
   * @param {import('../../ports/GraphPersistencePort.js').default} options.persistence
   */
  constructor({ persistence }) {
    this.persistence = persistence;
  }

  /**
   * Creates a new node in the graph.
   */
  async createNode({ message, parents = [], sign = false }) {
    return await this.persistence.commitNode({ message, parents, sign });
  }

  /**
   * Reads a node's data.
   */
  async readNode(sha) {
    return await this.persistence.showNode(sha);
  }

  /**
   * Lists nodes in history.
   */
  async listNodes({ ref, limit = 50 }) {
    const separator = '--NODE-END--';
    const format = ['%H', '%an', '%ad', '%B', separator].join('%n');
    
    let out = '';
    try {
      out = await this.persistence.logNodes({ ref, limit, format });
    } catch {
      return [];
    }

    return out
      .split(`${separator}\n`)
      .filter(Boolean)
      .map((block) => {
        const [sha, author, date, ...msgLines] = block.split('\n');
        const message = msgLines.join('\n').replace(new RegExp(`\n?${separator}\\s*$`), '').trim();
        return new GraphNode({ sha, author, date, message });
      });
  }
}
