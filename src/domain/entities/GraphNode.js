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
   */
  constructor({ sha, message, author, date, parents = [] }) {
    this.sha = sha;
    this.message = message;
    this.author = author;
    this.date = date;
    this.parents = parents;
    Object.freeze(this);
  }
}
