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

import WriterError from '../errors/WriterError.ts';
import { buildWriterRef } from '../utils/RefLayout.js';

/** @type {string} */
const NONE_DISPLAY = '(none)';

/**
 * Extracts the error message and cause from an unknown error value.
 *
 * @param {unknown} err - The caught error
 * @returns {{ errMsg: string, cause: Error|undefined }} Extracted message and cause
 */
function _extractErrorInfo(err) {
  const errMsg = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error ? err : undefined;
  return { errMsg, cause };
}

/**
 * Extracts the CAS error object from an unknown error if applicable.
 *
 * @param {unknown} err - The caught error
 * @returns {{code?: unknown, expectedSha?: unknown, actualSha?: unknown}|null} The CAS error or null
 */
function _extractCasError(err) {
  if (err !== null && err !== undefined && typeof err === 'object') {
    return /** @type {{code?: unknown, expectedSha?: unknown, actualSha?: unknown}} */ (err);
  }
  return null;
}

/**
 * Formats a nullable SHA for display in error messages.
 *
 * @param {string|null} sha - The SHA to format
 * @returns {string} The SHA or "(none)" if null/empty
 */
function _displaySha(sha) {
  return (sha !== null && sha.length > 0) ? sha : NONE_DISPLAY;
}

/**
 * Builds a CAS conflict WriterError with ref details.
 *
 * @param {{code?: unknown, expectedSha?: unknown, actualSha?: unknown}} casError - The CAS error object
 * @param {Error|undefined} cause - The original error cause
 * @param {{ graphName: string, writerId: string, expectedOldHead: string|null }} ctx - Commit context
 * @returns {WriterError} A WRITER_REF_ADVANCED error
 */
function _buildCasConflictError(casError, cause, ctx) {
  const { graphName, writerId, expectedOldHead } = ctx;
  const writerRef = buildWriterRef(graphName, writerId);
  const expectedSha = typeof casError.expectedSha === 'string' ? casError.expectedSha : expectedOldHead;
  const actualSha = typeof casError.actualSha === 'string' ? casError.actualSha : null;
  return new WriterError(
    'WRITER_REF_ADVANCED',
    `Writer ref ${writerRef} has advanced since beginPatch(). ` +
    `Expected ${_displaySha(expectedSha)}, found ${_displaySha(actualSha)}. ` +
    'Call beginPatch() again to retry.',
    cause
  );
}

/**
 * Classifies a commit error into the appropriate WriterError code.
 *
 * @param {unknown} err - The caught error
 * @param {{ graphName: string, writerId: string, expectedOldHead: string|null }} ctx - Commit context
 * @returns {WriterError} A classified WriterError
 */
function _classifyCommitError(err, ctx) {
  const { errMsg, cause } = _extractErrorInfo(err);
  const casError = _extractCasError(err);
  if (casError !== null && casError.code === 'WRITER_CAS_CONFLICT') {
    return _buildCasConflictError(casError, cause, ctx);
  }
  if (errMsg.includes('Concurrent commit detected') || errMsg.includes('has advanced')) {
    return new WriterError('WRITER_REF_ADVANCED', errMsg, cause);
  }
  return new WriterError('PERSIST_WRITE_FAILED', `Failed to persist patch: ${errMsg}`, cause);
}

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
   * @param {{ mime?: string|null, size?: number|null }} [metadata] - Optional content metadata
   * @returns {Promise<this>} This session for chaining
   * @throws {WriterError} SESSION_COMMITTED if already committed
   */
  async attachContent(nodeId, content, metadata = undefined) {
    this._ensureNotCommitted();
    await this._builder.attachContent(nodeId, content, metadata);
    return this;
  }

  /**
   * Clears content from a node.
   *
   * @param {string} nodeId - The node ID to clear content from
   * @returns {this} This session for chaining
   * @throws {WriterError} SESSION_COMMITTED if already committed
   */
  clearContent(nodeId) {
    this._ensureNotCommitted();
    this._builder.clearContent(nodeId);
    return this;
  }

  /**
   * Attaches content to an edge.
   *
   * @param {string} from - Source node ID
   * @param {string} to - Target node ID
   * @param {string} label - Edge label/type
   * @param {Uint8Array|string} content - The content to attach
   * @param {{ mime?: string|null, size?: number|null }} [metadata] - Optional content metadata
   * @returns {Promise<this>} This session for chaining
   * @throws {WriterError} SESSION_COMMITTED if already committed
   */
  async attachEdgeContent(from, to, label, content, metadata = undefined) {
    this._ensureNotCommitted();
    await this._builder.attachEdgeContent(from, to, label, content, metadata);
    return this;
  }

  /**
   * Clears content from an edge.
   *
   * @param {string} from - Source node ID
   * @param {string} to - Target node ID
   * @param {string} label - Edge label/type
   * @returns {this} This session for chaining
   * @throws {WriterError} SESSION_COMMITTED if already committed
   */
  clearEdgeContent(from, to, label) {
    this._ensureNotCommitted();
    this._builder.clearEdgeContent(from, to, label);
    return this;
  }

  /**
   * Builds the PatchV2 object without committing.
   *
   * @returns {import('../types/WarpTypesV2.ts').PatchV2} The constructed patch
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
    this._ensureNotEmpty();

    try {
      const sha = await this._builder.commit();
      this._committed = true;
      return sha;
    } catch (err) {
      throw _classifyCommitError(err, { graphName: this._graphName, writerId: this._writerId, expectedOldHead: this._expectedOldHead });
    }
  }

  /**
   * Ensures the patch has at least one operation.
   * @throws {WriterError} EMPTY_PATCH if no operations were added
   * @private
   */
  _ensureNotEmpty() {
    if (this._builder.ops.length === 0) {
      throw new WriterError('EMPTY_PATCH', 'Cannot commit empty patch: no operations added');
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
