/**
 * Immutable value object representing a single graph node backed by a
 * Git commit pointing to the empty tree.
 *
 * @module
 */

/**
 * Immutable entity representing a graph node.
 */
export default class GraphNode {
  /** Commit SHA */
  readonly sha: string;
  /** Author name */
  readonly author: string | undefined;
  /** Commit date */
  readonly date: string | undefined;
  /** Node message/data */
  readonly message: string;
  /** Array of parent SHAs */
  readonly parents: readonly string[];

  constructor(data: {
    sha: string;
    message: string;
    author?: string;
    date?: string;
    parents?: string[];
  });
}
