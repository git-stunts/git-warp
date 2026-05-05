/**
 * @module
 *
 * Immutable value object representing a single graph node backed by a
 * Git commit pointing to the empty tree.
 */

import WarpError from '../errors/WarpError.ts';

const E_INVALID_SHA = 'E_INVALID_SHA';
const E_INVALID_MESSAGE = 'E_INVALID_MESSAGE';
const E_INVALID_PARENTS = 'E_INVALID_PARENTS';

/** Validates that sha is a non-empty string. */
function _validateSha(sha: unknown): asserts sha is string { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  if (typeof sha !== 'string' || sha.length === 0) {
    throw new WarpError('GraphNode requires a valid sha string', E_INVALID_SHA);
  }
}

/** Validates that message is a non-empty string. */
function _validateMessage(message: unknown): asserts message is string { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  if (typeof message !== 'string' || message.length === 0) {
    throw new WarpError('GraphNode requires a valid message string', E_INVALID_MESSAGE);
  }
}

/** Validates that parents is an array. */
function _validateParents(parents: unknown): asserts parents is string[] { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  if (!Array.isArray(parents)) {
    throw new WarpError('GraphNode parents must be an array', E_INVALID_PARENTS);
  }
}

/** Input data for constructing a GraphNode. */
interface GraphNodeData {
  sha: string;
  message: string;
  author?: string;
  date?: string;
  parents?: string[];
}

/**
 * Immutable domain entity representing a node in the graph.
 *
 * Each GraphNode corresponds to a Git commit pointing to the Empty Tree.
 * Instances are frozen after construction to ensure immutability.
 */
export default class GraphNode {
  /** Commit SHA */
  readonly sha: string;
  /** Node message/data */
  readonly message: string;
  /** Author name */
  readonly author: string | undefined;
  /** Commit date */
  readonly date: string | undefined;
  /** Array of parent SHAs */
  readonly parents: readonly string[];

  /**
   * Creates a new immutable GraphNode.
   */
  constructor({ sha, message, author, date, parents = [] }: GraphNodeData) {
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
