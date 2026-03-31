/* @ts-self-types="./GraphNode.d.ts" */

/**
 * @module
 *
 * Immutable value object representing a single graph node backed by a
 * Git commit pointing to the empty tree.
 */

import WarpError from '../errors/WarpError.js';

/** @type {string} */
const E_INVALID_SHA = 'E_INVALID_SHA';
/** @type {string} */
const E_INVALID_MESSAGE = 'E_INVALID_MESSAGE';
/** @type {string} */
const E_INVALID_PARENTS = 'E_INVALID_PARENTS';

/**
 * Validates that sha is a non-empty string.
 * @param {unknown} sha - The sha to validate
 * @throws {WarpError} If sha is missing or not a string
 */
function _validateSha(sha) {
  if (typeof sha !== 'string' || sha.length === 0) {
    throw new WarpError('GraphNode requires a valid sha string', E_INVALID_SHA);
  }
}

/**
 * Validates that message is a non-empty string.
 * @param {unknown} message - The message to validate
 * @throws {WarpError} If message is missing or not a string
 */
function _validateMessage(message) {
  if (typeof message !== 'string' || message.length === 0) {
    throw new WarpError('GraphNode requires a valid message string', E_INVALID_MESSAGE);
  }
}

/**
 * Validates that parents is an array.
 * @param {unknown} parents - The parents to validate
 * @throws {WarpError} If parents is not an array
 */
function _validateParents(parents) {
  if (!Array.isArray(parents)) {
    throw new WarpError('GraphNode parents must be an array', E_INVALID_PARENTS);
  }
}

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
   * @param {{ sha: string, message: string, author?: string, date?: string, parents?: string[] }} data - Node data
   * @throws {Error} If sha is missing or not a string
   * @throws {Error} If message is missing or not a string
   * @throws {Error} If parents is not an array
   */
  constructor({ sha, message, author, date, parents = [] }) {
    _validateSha(sha);
    _validateMessage(message);
    _validateParents(parents);

    this.sha = sha;
    this.message = message;
    this.author = author;
    this.date = date;
    this.parents = Object.freeze([...parents]);
    Object.freeze(this);
  }
}
