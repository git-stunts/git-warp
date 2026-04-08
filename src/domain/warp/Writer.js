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
 * - Schema:2 only (Patch ops with OR-Set semantics)
 *
 * @module domain/warp/Writer
 * @see WARP Writer Spec v1
 */

import nullLogger from '../utils/nullLogger.ts';
import { validateWriterId, buildWriterRef } from '../utils/RefLayout.ts';
import { PatchSession } from './PatchSession.js';
import { PatchBuilderV2 } from '../services/PatchBuilderV2.js';
import { decodePatchMessage, detectMessageKind } from '../services/codec/WarpMessageCodec.js';
import WriterError from '../errors/WriterError.ts';

// Re-export for backward compatibility — consumers importing from Writer.js
// should migrate to importing from '../errors/WriterError.ts' directly.
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
 * @type {ReadonlyArray<[string, string]>}
 * Maps private Writer fields to PatchBuilderV2 option keys.
 */
const _WRITER_OPTIONAL_KEYS = /** @type {const} */ ([
  ['_patchJournal', 'patchJournal'],
  ['_logger', 'logger'],
  ['_onCommitSuccess', 'onCommitSuccess'],
  ['_blobStorage', 'blobStorage'],
]);

/**
 * Copies optional Writer fields to PatchBuilderV2 options.
 * @param {Record<string, unknown>} writer
 * @param {Record<string, unknown>} opts
 */
function _copyWriterOptionals(writer, opts) {
  for (const [src, dst] of _WRITER_OPTIONAL_KEYS) {
    const val = writer[src];
    if (val !== undefined && val !== null) {
      opts[dst] = val;
    }
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
   * @param {{ persistence: import('../../ports/CommitPort.ts').default & import('../../ports/BlobPort.ts').default & import('../../ports/TreePort.ts').default & import('../../ports/RefPort.ts').default, graphName: string, writerId: string, versionVector: import('../crdt/VersionVector.js').default, getCurrentState: () => import('../services/JoinReducer.js').WarpStateV5 | null, onCommitSuccess?: (result: {patch: import('../types/Patch.ts').default, sha: string}) => void | Promise<void>, onDeleteWithData?: 'reject'|'cascade'|'warn', patchJournal: import('../../ports/PatchJournalPort.ts').default, logger?: import('../../ports/LoggerPort.ts').default, blobStorage?: import('../../ports/BlobStoragePort.ts').default }} options
   */
  constructor({ persistence, graphName, writerId, versionVector, getCurrentState, onCommitSuccess, onDeleteWithData = 'warn', patchJournal, logger, blobStorage }) {
    validateWriterId(writerId);
    if (patchJournal === null || patchJournal === undefined) {
      throw new WriterError(
        'E_MISSING_JOURNAL',
        'patchJournal is required — Writer.beginPatch() produces patches that must be persisted via a PatchJournalPort.',
      );
    }
    this._initFields(/** @type {Parameters<Writer['_initFields']>[0]} */ ({
      persistence, graphName, writerId, versionVector,
      getCurrentState, onCommitSuccess, onDeleteWithData,
      patchJournal, logger, blobStorage,
    }));
  }

  /**
   * Assigns all Writer instance fields from the validated constructor options.
   * @param {{ persistence: import('../../ports/CommitPort.ts').default & import('../../ports/BlobPort.ts').default & import('../../ports/TreePort.ts').default & import('../../ports/RefPort.ts').default, graphName: string, writerId: string, versionVector: import('../crdt/VersionVector.js').default, getCurrentState: () => import('../services/JoinReducer.js').WarpStateV5 | null, onCommitSuccess?: (result: {patch: import('../types/Patch.ts').default, sha: string}) => void | Promise<void>, onDeleteWithData: 'reject'|'cascade'|'warn', patchJournal: import('../../ports/PatchJournalPort.ts').default, logger?: import('../../ports/LoggerPort.ts').default, blobStorage?: import('../../ports/BlobStoragePort.ts').default }} opts
   * @private
   */
  _initFields(opts) {
    /** @type {import('../../ports/CommitPort.ts').default & import('../../ports/BlobPort.ts').default & import('../../ports/TreePort.ts').default & import('../../ports/RefPort.ts').default} */
    this._persistence = opts.persistence;
    /** @type {string} */
    this._graphName = opts.graphName;
    /** @type {string} */
    this._writerId = opts.writerId;
    /** @type {import('../crdt/VersionVector.js').default} */
    this._versionVector = opts.versionVector;
    /** @type {() => import('../services/JoinReducer.js').WarpStateV5 | null} */
    this._getCurrentState = opts.getCurrentState;
    /** @type {((result: {patch: import('../types/Patch.ts').default, sha: string}) => void | Promise<void>)|undefined} */
    this._onCommitSuccess = opts.onCommitSuccess;
    /** @type {'reject'|'cascade'|'warn'} */
    this._onDeleteWithData = opts.onDeleteWithData;
    /** @type {import('../../ports/PatchJournalPort.ts').default} */
    this._patchJournal = opts.patchJournal;
    /** @type {import('../../ports/LoggerPort.ts').default} */
    this._logger = opts.logger ?? nullLogger;
    /** @type {import('../../ports/BlobStoragePort.ts').default|null} */
    this._blobStorage = opts.blobStorage ?? null;
    /** @type {boolean} */
    this._commitInProgress = false;
  }

  /**
   * Gets the writer ID.
   * @returns {string}
   */
  get writerId() {
    return /** @type {string} */ (this._writerId);
  }

  /**
   * Gets the graph name.
   * @returns {string}
   */
  get graphName() {
    return /** @type {string} */ (this._graphName);
  }

  /**
   * Gets the current writer head SHA.
   *
   * @returns {Promise<string|null>} The tip SHA or null if no commits yet
   */
  async head() {
    const writerRef = buildWriterRef(/** @type {string} */ (this._graphName), /** @type {string} */ (this._writerId));
    return await /** @type {import('../../ports/CommitPort.ts').default & import('../../ports/BlobPort.ts').default & import('../../ports/TreePort.ts').default & import('../../ports/RefPort.ts').default} */ (this._persistence).readRef(writerRef);
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
    const persistence = /** @type {import('../../ports/CommitPort.ts').default & import('../../ports/BlobPort.ts').default & import('../../ports/TreePort.ts').default & import('../../ports/RefPort.ts').default} */ (this._persistence);
    const graphName = /** @type {string} */ (this._graphName);
    const writerId = /** @type {string} */ (this._writerId);
    const writerRef = buildWriterRef(graphName, writerId);
    const expectedOldHead = await persistence.readRef(writerRef);
    const lamport = await this._resolveNextLamport(expectedOldHead);

    const builderOpts = this._buildPatchOpts({ persistence, graphName, writerId, lamport, expectedParentSha: expectedOldHead });
    const builder = new PatchBuilderV2(builderOpts);

    return new PatchSession({ builder, persistence, graphName, writerId, expectedOldHead });
  }

  /**
   * Constructs PatchBuilderV2 options from Writer state.
   * @param {{ persistence: import('../../ports/CommitPort.ts').default & import('../../ports/BlobPort.ts').default & import('../../ports/TreePort.ts').default & import('../../ports/RefPort.ts').default, graphName: string, writerId: string, lamport: number, expectedParentSha: string|null }} core
   * @returns {ConstructorParameters<typeof PatchBuilderV2>[0]}
   * @private
   */
  _buildPatchOpts(core) {
    /** @type {ConstructorParameters<typeof PatchBuilderV2>[0]} */
    const opts = {
      ...core,
      versionVector: /** @type {import('../crdt/VersionVector.js').default} */ (this._versionVector).clone(),
      getCurrentState: /** @type {() => import('../services/JoinReducer.js').WarpStateV5 | null} */ (this._getCurrentState),
      onDeleteWithData: /** @type {'reject'|'cascade'|'warn'} */ (this._onDeleteWithData),
    };
    _copyWriterOptionals(/** @type {Record<string, unknown>} */ (/** @type {unknown} */ (this)), opts);
    return opts;
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
    const commitMessage = await /** @type {import('../../ports/CommitPort.ts').default & import('../../ports/BlobPort.ts').default & import('../../ports/TreePort.ts').default & import('../../ports/RefPort.ts').default} */ (this._persistence).showNode(headSha);
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
