/**
 * Domain entity representing a node in the graph.
 */
export default class GraphNode {
  /**
   * @param {Object} data
   * @param {string} data.sha
   * @param {string} data.message
   * @param {string} [data.author]
   * @param {string} [data.date]
   * @param {string[]} [data.parents=[]]
   * @throws {Error} If sha or message are invalid
   */
  constructor({ sha, message, author, date, parents = [] }) {
    if (!sha || typeof sha !== 'string') {
      throw new Error('GraphNode requires a valid sha string');
    }
    if (!message || typeof message !== 'string') {
      throw new Error('GraphNode requires a valid message string');
    }
    if (!Array.isArray(parents)) {
      throw new Error('GraphNode parents must be an array');
    }

    this.sha = sha;
    this.message = message;
    this.author = author;
    this.date = date;
    this.parents = Object.freeze([...parents]);
    Object.freeze(this);
  }
}
