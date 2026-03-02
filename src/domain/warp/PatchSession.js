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

import WriterError from '../errors/WriterError.js';
import { buildWriterRef } from '../utils/RefLayout.js';

/**
 * Fluent patch session for building and committing graph mutations.
 */
export class PatchSession {
  /**
   * Creates a new PatchSession.
   *
   * @param {{ builder: import('../services/PatchBuilderV2.js').PatchBuilderV2, persistence: import('../../ports/RefPort.js').default, graphName: string, writerId: string, expectedOldHead: string|null }} options
   */
  constructor({ builder, persistence, graphName, writerId, expectedOldHead }) {
    /** @type {import('../services/PatchBuilderV2.js').PatchBuilderV2} */
    this._builder = builder;

    /** @type {import('../../ports/RefPort.js').default} */
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
   * @throws {WriterError} SESSION_COMMITTED if already committed
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
   * @throws {WriterError} SESSION_COMMITTED if already committed
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
   * @throws {WriterError} SESSION_COMMITTED if already committed
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
   * @throws {WriterError} SESSION_COMMITTED if already committed
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
   * @param {unknown} value - Property value (must be JSON-serializable)
   * @returns {this} This session for chaining
   * @throws {WriterError} SESSION_COMMITTED if already committed
   */
  setProperty(nodeId, key, value) {
    this._ensureNotCommitted();
    this._builder.setProperty(nodeId, key, value);
    return this;
  }

  /**
   * Sets a property on an edge.
   *
   * @param {string} from - Source node ID
   * @param {string} to - Target node ID
   * @param {string} label - Edge label/type
   * @param {string} key - Property key
   * @param {unknown} value - Property value (must be JSON-serializable)
   * @returns {this} This session for chaining
   * @throws {WriterError} SESSION_COMMITTED if already committed
   */
  // eslint-disable-next-line max-params -- direct delegate matching PatchBuilderV2 signature
  setEdgeProperty(from, to, label, key, value) {
    this._ensureNotCommitted();
    this._builder.setEdgeProperty(from, to, label, key, value);
    return this;
  }

  /**
   * Attaches content to a node.
   *
   * @param {string} nodeId - The node ID to attach content to
   * @param {Uint8Array|string} content - The content to attach
   * @returns {Promise<this>} This session for chaining
   * @throws {WriterError} SESSION_COMMITTED if already committed
   */
  async attachContent(nodeId, content) {
    this._ensureNotCommitted();
    await this._builder.attachContent(nodeId, content);
    return this;
  }

  /**
   * Attaches content to an edge.
   *
   * @param {string} from - Source node ID
   * @param {string} to - Target node ID
   * @param {string} label - Edge label/type
   * @param {Uint8Array|string} content - The content to attach
   * @returns {Promise<this>} This session for chaining
   * @throws {WriterError} SESSION_COMMITTED if already committed
   */
  // eslint-disable-next-line max-params -- direct delegate matching PatchBuilderV2 signature
  async attachEdgeContent(from, to, label, content) {
    this._ensureNotCommitted();
    await this._builder.attachEdgeContent(from, to, label, content);
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
  // eslint-disable-next-line complexity -- maps multiple commit-failure modes into stable WriterError codes
  async commit() {
    this._ensureNotCommitted();

    // Validate not empty
    if (this._builder.ops.length === 0) {
      throw new WriterError('EMPTY_PATCH', 'Cannot commit empty patch: no operations added');
    }

    try {
      // Delegate to PatchBuilderV2.commit() which handles the git operations
      const sha = await this._builder.commit();
      this._committed = true;
      return sha;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const cause = err instanceof Error ? err : undefined;
      const casError = /** @type {{code?: unknown, expectedSha?: unknown, actualSha?: unknown}|null} */ (
        (err && typeof err === 'object') ? err : null
      );
      if (casError?.code === 'WRITER_CAS_CONFLICT') {
        const writerRef = buildWriterRef(this._graphName, this._writerId);
        const expectedSha = typeof casError.expectedSha === 'string' ? casError.expectedSha : this._expectedOldHead;
        const actualSha = typeof casError.actualSha === 'string' ? casError.actualSha : null;
        throw new WriterError(
          'WRITER_REF_ADVANCED',
          `Writer ref ${writerRef} has advanced since beginPatch(). ` +
          `Expected ${expectedSha || '(none)'}, found ${actualSha || '(none)'}. ` +
          'Call beginPatch() again to retry.',
          cause
        );
      }
      if (errMsg.includes('Concurrent commit detected') ||
          errMsg.includes('has advanced')) {
        throw new WriterError('WRITER_REF_ADVANCED', errMsg, cause);
      }
      throw new WriterError('PERSIST_WRITE_FAILED', `Failed to persist patch: ${errMsg}`, cause);
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
   * @throws {WriterError} SESSION_COMMITTED if already committed
   * @private
   */
  _ensureNotCommitted() {
    if (this._committed) {
      throw new WriterError(
        'SESSION_COMMITTED',
        'PatchSession already committed. Call beginPatch() to create a new session.',
      );
    }
  }
}
