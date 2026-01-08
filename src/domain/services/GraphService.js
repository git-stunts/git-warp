import GraphNode from '../entities/GraphNode.js';

/**
 * Domain service for graph database operations.
 */
export default class GraphService {
  constructor({ persistence }) {
    this.persistence = persistence;
  }

  async createNode({ message, parents = [], sign = false }) {
    return await this.persistence.commitNode({ message, parents, sign });
  }

  async readNode(sha) {
    return await this.persistence.showNode(sha);
  }

  /**
   * Lists nodes in history.
   * Returns a promise that resolves to an array (for small lists).
   */
  async listNodes({ ref, limit = 50 }) {
    const nodes = [];
    for await (const node of this.iterateNodes({ ref, limit })) {
      nodes.push(node);
    }
    return nodes;
  }

  /**
   * Async generator for streaming nodes.
   * Essential for processing millions of nodes without OOM.
   */
  async *iterateNodes({ ref, limit = 1000000 }) {
    // Use Record Separator character
    const separator = '\x1E';
    const format = ['%H', '%an', '%ad', '%P', `%B${separator}`].join('%n');
    
    const stream = await this.persistence.logNodesStream({ ref, limit, format });
    
    let buffer = '';
    const decoder = new TextDecoder();

    for await (const chunk of stream) {
      buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk);
      
      let splitIndex;
      while ((splitIndex = buffer.indexOf(`${separator}\n`)) !== -1) {
        const block = buffer.slice(0, splitIndex);
        buffer = buffer.slice(splitIndex + separator.length + 1);
        
        const node = this._parseNode(block);
        if (node) yield node;
      }
    }

    // Last block
    if (buffer.trim()) {
      const node = this._parseNode(buffer);
      if (node) yield node;
    }
  }

  _parseNode(block) {
    const lines = block.trim().split('\n');
    if (lines.length < 4) return null;
    
    const sha = lines[0];
    const author = lines[1];
    const date = lines[2];
    const parents = lines[3] ? lines[3].split(' ') : [];
    const message = lines.slice(4).join('\n').trim();
    
    return new GraphNode({ sha, author, date, message, parents });
  }
}