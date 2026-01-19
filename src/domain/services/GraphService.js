import GraphNode from '../entities/GraphNode.js';

/**
 * ASCII Record Separator (0x1E) - Used as delimiter in git log parsing.
 * This control character cannot appear in normal text, preventing injection.
 * @see https://en.wikipedia.org/wiki/C0_and_C1_control_codes#Field_separators
 * @const {string}
 */
const RECORD_SEPARATOR = '\x1E';

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
   * @param {Object} options
   * @param {string} options.ref - Git ref to start from
   * @param {number} [options.limit=1000000] - Maximum nodes to yield (1 to 10,000,000)
   * @throws {Error} If limit is invalid
   */
  async *iterateNodes({ ref, limit = 1000000 }) {
    // Validate limit to prevent DoS attacks
    if (typeof limit !== 'number' || limit < 1 || limit > 10000000) {
      throw new Error(`Invalid limit: ${limit}. Must be between 1 and 10,000,000`);
    }

    const format = ['%H', '%an', '%ad', '%P', `%B${RECORD_SEPARATOR}`].join('%n');

    const stream = await this.persistence.logNodesStream({ ref, limit, format });

    yield* this._parseNodeStream(stream);
  }

  /**
   * Parses a node stream and yields GraphNode instances.
   * @param {AsyncIterable} stream - The stream to parse
   * @yields {GraphNode}
   * @private
   */
  async *_parseNodeStream(stream) {
    let buffer = '';
    const decoder = new TextDecoder('utf-8', { fatal: false });

    for await (const chunk of stream) {
      // Use stream: true to handle UTF-8 sequences split across chunks
      buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });

      let splitIndex;
      while ((splitIndex = buffer.indexOf(`${RECORD_SEPARATOR}\n`)) !== -1) {
        const block = buffer.slice(0, splitIndex);
        buffer = buffer.slice(splitIndex + RECORD_SEPARATOR.length + 1);

        const node = this._parseNode(block);
        if (node) {
          yield node;
        }
      }
    }

    // Flush any remaining bytes in the decoder
    buffer += decoder.decode();

    // Last block
    if (buffer.trim()) {
      const node = this._parseNode(buffer);
      if (node) {
        yield node;
      }
    }
  }

  _parseNode(block) {
    const lines = block.trim().split('\n');
    if (lines.length < 4) {
      return null;
    }

    const sha = lines[0];
    const author = lines[1];
    const date = lines[2];
    const parents = lines[3] ? lines[3].split(' ').filter(Boolean) : [];
    const message = lines.slice(4).join('\n').trim();

    return new GraphNode({ sha, author, date, message, parents });
  }
}
