/**
 * Writer - WARP writer abstraction for safe graph mutations.
 *
 * A Writer is the only way to mutate a WarpRuntime state. It owns a writerId
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
 * Asserts that a Lamport timestamp is a valid positive finite integer.
 * @param {unknown} lamport - The value to validate
 * @param {string} commitSha - SHA for error reporting
 * @throws {WriterError} E_LAMPORT_CORRUPT if invalid
 */
function _assertValidLamport(lamport, commitSha) {
  if (typeof lamport !== 'number' || !Number.isFinite(lamport) || lamport < 1) {
    throw new WriterError(
      'E_LAMPORT_CORRUPT',
      `Malformed Lamport timestamp in commit ${commitSha}: ${JSON.stringify(lamport)}`,
    );
  }
}

/**
 * Writer class for creating and committing patches to a WARP graph.
 *
 * @class Writer
 */
export class Writer {
  /**
   * Creates a new Writer instance.
   *
   * @param {{ persistence: import('../../ports/CommitPort.js').default & import('../../ports/BlobPort.js').default & import('../../ports/TreePort.js').default & import('../../ports/RefPort.js').default, graphName: string, writerId: string, versionVector: import('../crdt/VersionVector.js').VersionVector, getCurrentState: () => import('../services/JoinReducer.js').WarpStateV5 | null, onCommitSuccess?: (result: {patch: import('../types/WarpTypesV2.js').PatchV2, sha: string}) => void | Promise<void>, onDeleteWithData?: 'reject'|'cascade'|'warn', codec?: import('../../ports/CodecPort.js').default, logger?: import('../../ports/LoggerPort.js').default, blobStorage?: import('../../ports/BlobStoragePort.js').default, patchBlobStorage?: import('../../ports/BlobStoragePort.js').default }} options
   */
  constructor({ persistence, graphName, writerId, versionVector, getCurrentState, onCommitSuccess, onDeleteWithData = 'warn', codec, logger, blobStorage, patchBlobStorage }) {
    validateWriterId(writerId);
    this._initFields({
      persistence, graphName, writerId, versionVector,
      getCurrentState, onCommitSuccess, onDeleteWithData,
      codec, logger, blobStorage, patchBlobStorage,
    });
  }

  /**
   * Assigns all Writer instance fields from the validated constructor options.
   * @param {{ persistence: import('../../ports/CommitPort.js').default & import('../../ports/BlobPort.js').default & import('../../ports/TreePort.js').default & import('../../ports/RefPort.js').default, graphName: string, writerId: string, versionVector: import('../crdt/VersionVector.js').VersionVector, getCurrentState: () => import('../services/JoinReducer.js').WarpStateV5 | null, onCommitSuccess?: (result: {patch: import('../types/WarpTypesV2.js').PatchV2, sha: string}) => void | Promise<void>, onDeleteWithData: 'reject'|'cascade'|'warn', codec?: import('../../ports/CodecPort.js').default, logger?: import('../../ports/LoggerPort.js').default, blobStorage?: import('../../ports/BlobStoragePort.js').default, patchBlobStorage?: import('../../ports/BlobStoragePort.js').default }} opts
   * @private
   */
  _initFields(opts) {
    /** @type {import('../../ports/CommitPort.js').default & import('../../ports/BlobPort.js').default & import('../../ports/TreePort.js').default & import('../../ports/RefPort.js').default} */
    this._persistence = opts.persistence;
    /** @type {string} */
    this._graphName = opts.graphName;
    /** @type {string} */
    this._writerId = opts.writerId;
    /** @type {import('../crdt/VersionVector.js').VersionVector} */
    this._versionVector = opts.versionVector;
    /** @type {() => import('../services/JoinReducer.js').WarpStateV5 | null} */
    this._getCurrentState = opts.getCurrentState;
    /** @type {((result: {patch: import('../types/WarpTypesV2.js').PatchV2, sha: string}) => void | Promise<void>)|undefined} */
    this._onCommitSuccess = opts.onCommitSuccess;
    /** @type {'reject'|'cascade'|'warn'} */
    this._onDeleteWithData = opts.onDeleteWithData;
    /** @type {import('../../ports/CodecPort.js').default|undefined} */
    this._codec = opts.codec ?? defaultCodec;
    /** @type {import('../../ports/LoggerPort.js').default} */
    this._logger = opts.logger ?? nullLogger;
    /** @type {import('../../ports/BlobStoragePort.js').default|null} */
    this._blobStorage = opts.blobStorage ?? null;
    /** @type {import('../../ports/BlobStoragePort.js').default|null} */
    this._patchBlobStorage = opts.patchBlobStorage ?? null;
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
    const writerRef = buildWriterRef(this._graphName, this._writerId);
    const expectedOldHead = await this._persistence.readRef(writerRef);
    const lamport = await this._resolveNextLamport(expectedOldHead);

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
      blobStorage: this._blobStorage ?? undefined,
      patchBlobStorage: this._patchBlobStorage ?? undefined,
    });

    return new PatchSession({
      builder,
      persistence: this._persistence,
      graphName: this._graphName,
      writerId: this._writerId,
      expectedOldHead,
    });
  }

  /**
   * Reads the previous commit's Lamport timestamp and returns the next value.
   * @param {string|null} headSha - Current writer tip SHA, or null if no commits yet
   * @returns {Promise<number>} The next Lamport timestamp (1-based)
   * @private
   */
  async _resolveNextLamport(headSha) {
    if (headSha === null || headSha === undefined) {
      return 1;
    }
    const commitMessage = await this._persistence.showNode(headSha);
    if (detectMessageKind(commitMessage) !== 'patch') {
      return 1;
    }
    const { lamport } = decodePatchMessage(commitMessage);
    _assertValidLamport(lamport, headSha);
    return lamport + 1;
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
    if (this._commitInProgress === true) {
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
