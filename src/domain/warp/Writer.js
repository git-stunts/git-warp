/**
 * Writer - WARP writer abstraction for safe graph mutations.
 *
 * A Writer is the only way to mutate a WarpGraph state. It owns a writerId
 * and maintains a single-writer chain under refs/warp/<graph>/writers/<writerId>.
 *
 * Key guarantees:
 * - Single-writer chain per writerId
 * - Ref-safe identity
 * - CAS-based updates to prevent concurrent forks
 * - Schema:2 only (PatchV2 ops with OR-Set semantics)
 *
 * @module domain/warp/Writer
 * @see WARP Writer Spec v1
 */

import defaultCodec from '../utils/defaultCodec.js';
import nullLogger from '../utils/nullLogger.js';
import { validateWriterId, buildWriterRef } from '../utils/RefLayout.js';
import { PatchSession } from './PatchSession.js';
import { PatchBuilderV2 } from '../services/PatchBuilderV2.js';
import { decodePatchMessage, detectMessageKind } from '../services/WarpMessageCodec.js';
import { vvClone } from '../crdt/VersionVector.js';
import WriterError from '../errors/WriterError.js';

// Re-export for backward compatibility — consumers importing from Writer.js
// should migrate to importing from '../errors/WriterError.js' directly.
export { WriterError };

/**
 * Writer class for creating and committing patches to a WARP graph.
 *
 * @class Writer
 */
export class Writer {
  /**
   * Creates a new Writer instance.
   *
   * @param {{ persistence: import('../../ports/CommitPort.js').default & import('../../ports/RefPort.js').default, graphName: string, writerId: string, versionVector: import('../crdt/VersionVector.js').VersionVector, getCurrentState: () => import('../services/JoinReducer.js').WarpStateV5 | null, onCommitSuccess?: (result: {patch: import('../types/WarpTypesV2.js').PatchV2, sha: string}) => void | Promise<void>, onDeleteWithData?: 'reject'|'cascade'|'warn', codec?: import('../../ports/CodecPort.js').default, logger?: import('../../ports/LoggerPort.js').default }} options
   */
  constructor({ persistence, graphName, writerId, versionVector, getCurrentState, onCommitSuccess, onDeleteWithData = 'warn', codec, logger }) {
    validateWriterId(writerId);

    /** @type {import('../../ports/CommitPort.js').default & import('../../ports/RefPort.js').default} */
    this._persistence = persistence;

    /** @type {string} */
    this._graphName = graphName;

    /** @type {string} */
    this._writerId = writerId;

    /** @type {import('../crdt/VersionVector.js').VersionVector} */
    this._versionVector = versionVector;

    /** @type {() => import('../services/JoinReducer.js').WarpStateV5 | null} */
    this._getCurrentState = getCurrentState;

    /** @type {((result: {patch: import('../types/WarpTypesV2.js').PatchV2, sha: string}) => void | Promise<void>)|undefined} */
    this._onCommitSuccess = onCommitSuccess;

    /** @type {'reject'|'cascade'|'warn'} */
    this._onDeleteWithData = onDeleteWithData;

    /** @type {import('../../ports/CodecPort.js').default|undefined} */
    this._codec = codec || defaultCodec;

    /** @type {import('../../ports/LoggerPort.js').default} */
    this._logger = logger || nullLogger;

    /** @type {boolean} */
    this._commitInProgress = false;
  }

  /**
   * Gets the writer ID.
   * @returns {string}
   */
  get writerId() {
    return this._writerId;
  }

  /**
   * Gets the graph name.
   * @returns {string}
   */
  get graphName() {
    return this._graphName;
  }

  /**
   * Gets the current writer head SHA.
   *
   * @returns {Promise<string|null>} The tip SHA or null if no commits yet
   */
  async head() {
    const writerRef = buildWriterRef(this._graphName, this._writerId);
    return await this._persistence.readRef(writerRef);
  }

  /**
   * Begins a new patch session.
   *
   * Reads the current writer head and captures it as the expected parent
   * for CAS-based commit.
   *
   * @returns {Promise<PatchSession>} A fluent patch session
   *
   * @example
   * const writer = await graph.writer();
   * const patch = await writer.beginPatch();
   * patch.addNode('user:alice');
   * patch.setProperty('user:alice', 'name', 'Alice');
   * await patch.commit();
   */
  async beginPatch() {
    // Read current writer head and capture for CAS
    const writerRef = buildWriterRef(this._graphName, this._writerId);
    const expectedOldHead = await this._persistence.readRef(writerRef);

    // Calculate next lamport
    let lamport = 1;
    if (expectedOldHead) {
      const commitMessage = await this._persistence.showNode(expectedOldHead);
      const kind = detectMessageKind(commitMessage);
      if (kind === 'patch') {
        const patchInfo = decodePatchMessage(commitMessage);
        if (typeof patchInfo.lamport !== 'number' || !Number.isFinite(patchInfo.lamport) || patchInfo.lamport < 1) {
          throw new WriterError(
            'E_LAMPORT_CORRUPT',
            `Malformed Lamport timestamp in commit ${expectedOldHead}: ${JSON.stringify(patchInfo.lamport)}`,
          );
        }
        lamport = patchInfo.lamport + 1;
      }
    }

    // Create internal PatchBuilderV2
    const builder = new PatchBuilderV2({
      persistence: this._persistence,
      graphName: this._graphName,
      writerId: this._writerId,
      lamport,
      versionVector: vvClone(this._versionVector),
      getCurrentState: this._getCurrentState,
      expectedParentSha: expectedOldHead,
      onCommitSuccess: this._onCommitSuccess,
      onDeleteWithData: this._onDeleteWithData,
      codec: this._codec,
      logger: this._logger,
    });

    // Return PatchSession wrapping the builder
    return new PatchSession({
      builder,
      persistence: this._persistence,
      graphName: this._graphName,
      writerId: this._writerId,
      expectedOldHead,
    });
  }

  /**
   * Convenience method to build and commit a patch in one call.
   *
   * @param {(p: PatchSession) => void | Promise<void>} build - Function to build the patch
   * @returns {Promise<string>} The commit SHA of the new patch
   * @throws {WriterError} COMMIT_IN_PROGRESS if called while another commitPatch() is in progress (not reentrant)
   * @throws {WriterError} EMPTY_PATCH if no operations were added
   * @throws {WriterError} WRITER_REF_ADVANCED if CAS fails (ref moved since beginPatch)
   * @throws {WriterError} PERSIST_WRITE_FAILED if git operations fail
   *
   * @example
   * const sha = await writer.commitPatch(p => {
   *   p.addNode('user:alice');
   *   p.setProperty('user:alice', 'name', 'Alice');
   * });
   */
  async commitPatch(build) {
    if (this._commitInProgress) {
      throw new WriterError(
        'COMMIT_IN_PROGRESS',
        'commitPatch() is not reentrant. Use beginPatch() for nested or concurrent patches.',
      );
    }
    // The `_commitInProgress` flag prevents concurrent commits from the same
    // Writer instance. The finally block unconditionally resets it to ensure
    // the writer remains usable after a failed commit. Error classification
    // (CAS failure vs corruption vs I/O) is handled by the caller via the
    // thrown error type.
    this._commitInProgress = true;
    try {
      const patch = await this.beginPatch();
      await build(patch);
      return await patch.commit();
    } finally {
      this._commitInProgress = false;
    }
  }
}
