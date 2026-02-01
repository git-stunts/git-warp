/**
 * PatchSession - Fluent patch builder with CAS-safe commit.
 *
 * A PatchSession is created by Writer.beginPatch() and provides a fluent API
 * for building graph mutations. The commit uses compare-and-swap semantics
 * to prevent concurrent forks of the writer chain.
 *
 * @module domain/warp/PatchSession
 * @see WARP Writer Spec v1
 */

import { buildWriterRef } from '../utils/RefLayout.js';
import { WriterError } from './Writer.js';

/**
 * Fluent patch session for building and committing graph mutations.
 */
export class PatchSession {
  /**
   * Creates a new PatchSession.
   *
   * @param {Object} options
   * @param {import('../services/PatchBuilderV2.js').PatchBuilderV2} options.builder - Internal builder
   * @param {import('../../ports/GraphPersistencePort.js').default} options.persistence - Git adapter
   * @param {string} options.graphName - Graph namespace
   * @param {string} options.writerId - Writer ID
   * @param {string|null} options.expectedOldHead - Expected parent SHA for CAS
   */
  constructor({ builder, persistence, graphName, writerId, expectedOldHead }) {
    /** @type {import('../services/PatchBuilderV2.js').PatchBuilderV2} */
    this._builder = builder;

    /** @type {import('../../ports/GraphPersistencePort.js').default} */
    this._persistence = persistence;

    /** @type {string} */
    this._graphName = graphName;

    /** @type {string} */
    this._writerId = writerId;

    /** @type {string|null} */
    this._expectedOldHead = expectedOldHead;

    /** @type {boolean} */
    this._committed = false;
  }

  /**
   * Gets the expected old head SHA (for testing).
   * @returns {string|null}
   * @internal
   */
  get _expectedOldHeadForTest() {
    return this._expectedOldHead;
  }

  /**
   * Adds a node to the graph.
   *
   * @param {string} nodeId - The node ID to add
   * @returns {this} This session for chaining
   *
   * @example
   * patch.addNode('user:alice');
   */
  addNode(nodeId) {
    this._ensureNotCommitted();
    this._builder.addNode(nodeId);
    return this;
  }

  /**
   * Removes a node from the graph.
   *
   * Uses observed dots from materialized state for OR-Set removal.
   *
   * @param {string} nodeId - The node ID to remove
   * @returns {this} This session for chaining
   *
   * @example
   * patch.removeNode('user:alice');
   */
  removeNode(nodeId) {
    this._ensureNotCommitted();
    this._builder.removeNode(nodeId);
    return this;
  }

  /**
   * Adds an edge between two nodes.
   *
   * @param {string} from - Source node ID
   * @param {string} to - Target node ID
   * @param {string} label - Edge label/type
   * @returns {this} This session for chaining
   *
   * @example
   * patch.addEdge('user:alice', 'user:bob', 'follows');
   */
  addEdge(from, to, label) {
    this._ensureNotCommitted();
    this._builder.addEdge(from, to, label);
    return this;
  }

  /**
   * Removes an edge between two nodes.
   *
   * Uses observed dots from materialized state for OR-Set removal.
   *
   * @param {string} from - Source node ID
   * @param {string} to - Target node ID
   * @param {string} label - Edge label/type
   * @returns {this} This session for chaining
   *
   * @example
   * patch.removeEdge('user:alice', 'user:bob', 'follows');
   */
  removeEdge(from, to, label) {
    this._ensureNotCommitted();
    this._builder.removeEdge(from, to, label);
    return this;
  }

  /**
   * Sets a property on a node.
   *
   * @param {string} nodeId - The node ID
   * @param {string} key - Property key
   * @param {*} value - Property value (must be JSON-serializable)
   * @returns {this} This session for chaining
   *
   * @example
   * patch.setProperty('user:alice', 'name', 'Alice');
   * patch.setProperty('user:alice', 'age', 30);
   */
  setProperty(nodeId, key, value) {
    this._ensureNotCommitted();
    this._builder.setProperty(nodeId, key, value);
    return this;
  }

  /**
   * Builds the PatchV2 object without committing.
   *
   * @returns {import('../types/WarpTypesV2.js').PatchV2} The constructed patch
   */
  build() {
    return this._builder.build();
  }

  /**
   * Commits the patch to the graph with CAS protection.
   *
   * @returns {Promise<string>} The commit SHA of the new patch
   * @throws {WriterError} EMPTY_PATCH if no operations were added
   * @throws {WriterError} WRITER_REF_ADVANCED if CAS fails (ref moved since beginPatch)
   * @throws {WriterError} PERSIST_WRITE_FAILED if git operations fail
   *
   * @example
   * const sha = await patch.commit();
   */
  async commit() {
    this._ensureNotCommitted();

    // Validate not empty
    if (this._builder.ops.length === 0) {
      throw new WriterError('EMPTY_PATCH', 'Cannot commit empty patch: no operations added');
    }

    const writerRef = buildWriterRef(this._graphName, this._writerId);

    // Pre-commit CAS check: verify ref hasn't moved
    const currentHead = await this._persistence.readRef(writerRef);
    if (currentHead !== this._expectedOldHead) {
      throw new WriterError(
        'WRITER_REF_ADVANCED',
        `Writer ref ${writerRef} has advanced since beginPatch(). ` +
        `Expected ${this._expectedOldHead || '(none)'}, found ${currentHead || '(none)'}. ` +
        `Call beginPatch() again to retry.`
      );
    }

    try {
      // Delegate to PatchBuilderV2.commit() which handles the git operations
      const sha = await this._builder.commit();
      this._committed = true;
      return sha;
    } catch (err) {
      // Check if it's a concurrent commit error from PatchBuilderV2
      if (err.message?.includes('Concurrent commit detected') ||
          err.message?.includes('has advanced')) {
        throw new WriterError(
          'WRITER_REF_ADVANCED',
          err.message,
          err
        );
      }

      // Wrap other errors
      throw new WriterError(
        'PERSIST_WRITE_FAILED',
        `Failed to persist patch: ${err.message}`,
        err
      );
    }
  }

  /**
   * Gets the number of operations in this patch.
   * @returns {number}
   */
  get opCount() {
    return this._builder.ops.length;
  }

  /**
   * Ensures the session hasn't been committed yet.
   * @throws {Error} If already committed
   * @private
   */
  _ensureNotCommitted() {
    if (this._committed) {
      throw new Error('PatchSession already committed. Call beginPatch() to create a new session.');
    }
  }
}
