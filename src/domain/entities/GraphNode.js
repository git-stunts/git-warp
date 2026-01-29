/**
 * Immutable domain entity representing a node in the graph.
 *
 * Each GraphNode corresponds to a Git commit pointing to the Empty Tree.
 * Instances are frozen after construction to ensure immutability.
 *
 * @example
 * // Create a node from parsed git log data
 * const node = new GraphNode({
 *   sha: 'abc123def456...',
 *   message: '{"type":"UserCreated","payload":{...}}',
 *   author: 'Alice',
 *   date: '2026-01-29',
 *   parents: ['def456...']
 * });
 *
 * @example
 * // Access properties (all readonly)
 * console.log(node.sha);      // 'abc123def456...'
 * console.log(node.message);  // '{"type":"UserCreated",...}'
 * console.log(node.parents);  // ['def456...'] (frozen array)
 *
 * @example
 * // Attempting to modify throws in strict mode
 * node.sha = 'new-sha';       // TypeError: Cannot assign to read only property
 * node.parents.push('xyz');   // TypeError: Cannot add property
 */
export default class GraphNode {
  /**
   * Creates a new immutable GraphNode.
   *
   * @param {Object} data - Node data
   * @param {string} data.sha - The commit SHA (40 hex characters). Required.
   * @param {string} data.message - The commit message/payload. Required.
   * @param {string} [data.author] - The commit author name. Optional.
   * @param {string} [data.date] - The commit date string. Optional.
   * @param {string[]} [data.parents=[]] - Array of parent commit SHAs. Defaults to empty array.
   * @throws {Error} If sha is missing or not a string
   * @throws {Error} If message is missing or not a string
   * @throws {Error} If parents is not an array
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
