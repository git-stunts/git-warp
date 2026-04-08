import StrandError from '../../errors/StrandError.ts';
import { PatchBuilderV2 } from '../PatchBuilderV2.js';
import { encodePatchMessage } from '../codec/WarpMessageCodec.js';
import {
  maxPatchLamport,
  normalizeStringArray,
} from './strandShared.js';

/** @import { default as WarpRuntime } from '../../WarpRuntime.js' */
/** @import VersionVector from '../../crdt/VersionVector.js' */
/** @import { PatchV2 } from '../../types/WarpTypesV2.ts' */
/** @import { TickReceipt } from '../../types/TickReceipt.ts' */
/** @typedef {import('./strandTypes.js').StrandDescriptor} StrandDescriptor */
/**
 * @typedef {{ patch: PatchV2, sha: string }} CommittedPatchResult
 */
/**
 * @typedef {(result: CommittedPatchResult) => Promise<void>} PatchCommitSuccessHandler
 */
/**
 * @typedef {{
 *   descriptor: StrandDescriptor,
 *   lamport: number,
 *   versionVector: VersionVector,
 *   getCurrentState: () => import('../JoinReducer.js').WarpStateV5|null,
 *   expectedParentSha: string|null,
 *   targetRefPath?: string,
 *   onCommitSuccess?: PatchCommitSuccessHandler,
 * }} PatchBuilderOptionsParams
 */

export default class StrandPatchService {
  /**
   * Create a patch/commit boundary over strand overlay writes and queued intent construction.
   *
   * @param {{
   *   graph: WarpRuntime,
   *   loadStrandOrThrow: (strandId: string) => Promise<StrandDescriptor>,
   *   materializeDescriptor: (
   *     descriptor: StrandDescriptor,
   *     options: { collectReceipts: boolean, ceiling: number|null }
   *   ) => Promise<{
   *     state: import('../JoinReducer.js').WarpStateV5,
   *     receipts?: TickReceipt[],
   *     allPatches: Array<{ patch: PatchV2, sha: string }>
   *   }>,
   *   writeDescriptor: (descriptor: StrandDescriptor) => Promise<void>,
   *   buildOverlayRef: (strandId: string) => string,
   *   normalizeIntentQueue: (value: unknown) => StrandDescriptor['intentQueue'],
   *   buildIntentId: (strandId: string, sequence: number) => string,
   * }} options
   */
  constructor({
    graph,
    loadStrandOrThrow,
    materializeDescriptor,
    writeDescriptor,
    buildOverlayRef,
    normalizeIntentQueue,
    buildIntentId,
  }) {
    this._graph = graph;
    this._loadStrandOrThrow = loadStrandOrThrow;
    this._materializeDescriptor = materializeDescriptor;
    this._writeDescriptor = writeDescriptor;
    this._buildOverlayRef = buildOverlayRef;
    this._normalizeIntentQueue = normalizeIntentQueue;
    this._buildIntentId = buildIntentId;
  }

  /**
   * Create a fluent patch builder wired to the strand's overlay ref.
   *
   * @param {string} strandId
   * @returns {Promise<PatchBuilderV2>}
   */
  async createPatchBuilder(strandId) {
    const descriptor = await this._loadStrandOrThrow(strandId);
    return await this._createPatchBuilderForDescriptor(descriptor);
  }

  /**
   * Build and commit a patch within a reentrancy guard.
   *
   * @param {string} strandId
   * @param {(p: PatchBuilderV2) => void | Promise<void>} build
   * @returns {Promise<string>}
   */
  async patch(strandId, build) {
    if (this._graph._patchInProgress) {
      throw new StrandError(
        'graph.patchStrand() is not reentrant. Use createStrandPatch() for nested or concurrent patches.',
        { code: 'E_STRAND_REENTRANT' },
      );
    }
    this._graph._patchInProgress = true;
    try {
      const builder = await this.createPatchBuilder(strandId);
      await build(builder);
      return await builder.commit();
    } finally {
      this._graph._patchInProgress = false;
    }
  }

  /**
   * Build a queued intent from a descriptor and user-supplied build callback.
   *
   * @param {StrandDescriptor} descriptor
   * @param {(p: PatchBuilderV2) => void | Promise<void>} build
   * @returns {Promise<{
   *   intentId: string,
   *   enqueuedAt: string,
   *   patch: PatchV2,
   *   reads: string[],
   *   writes: string[],
   *   contentBlobOids: string[]
   * }>}
   */
  async buildQueuedIntent(descriptor, build) {
    this._assertWritableDescriptor(descriptor);
    const intentQueue = this._normalizeIntentQueue(descriptor.intentQueue);
    const { state, allPatches } = await this._materializeDescriptor(descriptor, {
      collectReceipts: false,
      ceiling: null,
    });
    const builder = this._buildQueuedIntentBuilder(descriptor, state, allPatches);
    await build(builder);
    return this._freezeQueuedIntent(descriptor, intentQueue, builder);
  }

  /**
   * Update the strand descriptor and graph caches after a successful overlay commit.
   *
   * @param {StrandDescriptor} descriptor
   * @param {{ patch: PatchV2, sha: string }} result
   * @returns {Promise<void>}
   */
  async syncOverlayDescriptor(descriptor, { patch, sha }) {
    const now = this._graph._clock.timestamp();
    const nextDescriptor = {
      ...descriptor,
      updatedAt: now,
      overlay: {
        ...descriptor.overlay,
        headPatchSha: sha,
        patchCount: descriptor.overlay.patchCount + 1,
      },
    };

    await this._writeDescriptor(nextDescriptor);

    if (patch.lamport > this._graph._maxObservedLamport) {
      this._graph._maxObservedLamport = patch.lamport;
    }
    this._graph._stateDirty = true;
    this._graph._cachedViewHash = null;
    this._graph._cachedCeiling = null;
    this._graph._cachedFrontier = null;
  }

  /**
   * Encode, persist, and commit a single queued patch to the overlay chain.
   *
   * @param {{
   *   strandId: string,
   *   overlayId: string,
   *   parentSha: string|null,
   *   patch: PatchV2,
   *   contentBlobOids: string[],
   *   lamport: number
   * }} params
   * @returns {Promise<{ sha: string, patch: PatchV2 }>}
   */
  async commitQueuedPatch({ strandId, overlayId, parentSha, patch, contentBlobOids, lamport }) {
    const committedPatch = {
      ...patch,
      writer: overlayId,
      lamport,
    };
    const patchBlobOid = await this._writeCommittedPatchBlob(committedPatch, overlayId);
    const treeEntries = this._buildPatchTreeEntries(patchBlobOid, contentBlobOids);
    const treeOid = await this._graph._persistence.writeTree(treeEntries);
    const sha = await this._commitPatchTree({
      treeOid,
      overlayId,
      lamport,
      patchBlobOid,
      schema: committedPatch.schema,
      parentSha,
    });
    await this._graph._persistence.updateRef(this._buildOverlayRef(strandId), sha);
    return {
      sha,
      patch: committedPatch,
    };
  }

  /**
   * Create a builder for one specific writable strand descriptor.
   *
   * @private
   * @param {StrandDescriptor} descriptor
   * @returns {Promise<PatchBuilderV2>}
   */
  async _createPatchBuilderForDescriptor(descriptor) {
    this._assertWritableDescriptor(descriptor);
    const { state, allPatches } = await this._materializeDescriptor(descriptor, {
      collectReceipts: false,
      ceiling: null,
    });
    return new PatchBuilderV2(this._buildOverlayPatchBuilderOptions(descriptor, state, allPatches));
  }

  /**
   * Assemble one PatchBuilderV2 options object for overlay commit or intent construction.
   *
   * @private
   * @param {PatchBuilderOptionsParams} params
   * @returns {ConstructorParameters<typeof PatchBuilderV2>[0]}
   */
  _buildPatchBuilderOptions({
    descriptor,
    lamport,
    versionVector,
    getCurrentState,
    expectedParentSha,
    targetRefPath,
    onCommitSuccess,
  }) {
    /** @type {Record<string, unknown>} */
    const pbOpts = {
      persistence: this._graph._persistence,
      graphName: this._graph._graphName,
      writerId: descriptor.overlay.overlayId,
      lamport,
      versionVector,
      getCurrentState,
      expectedParentSha,
      onDeleteWithData: this._graph._onDeleteWithData,
    };
    if (targetRefPath !== undefined) {
      pbOpts['targetRefPath'] = targetRefPath;
    }
    if (onCommitSuccess !== undefined) {
      pbOpts['onCommitSuccess'] = onCommitSuccess;
    }
    this._attachOptionalPatchBuilderDeps(pbOpts);
    return /** @type {ConstructorParameters<typeof PatchBuilderV2>[0]} */ (pbOpts);
  }

  /**
   * Throw when the descriptor does not currently expose a writable overlay.
   *
   * @private
   * @param {StrandDescriptor} descriptor
   * @returns {void}
   */
  _assertWritableDescriptor(descriptor) {
    if (!descriptor.overlay.writable) {
      throw new StrandError(
        `Strand '${descriptor.strandId}' has no active writable overlay in its current braid configuration`,
        {
          code: 'E_STRAND_INVALID_ARGS',
          context: { strandId: descriptor.strandId, writable: false },
        },
      );
    }
  }

  /**
   * Create one queued-intent patch builder against a materialized strand snapshot.
   *
   * @private
   * @param {StrandDescriptor} descriptor
   * @param {import('../JoinReducer.js').WarpStateV5} state
   * @param {Array<{ patch: PatchV2, sha: string }>} allPatches
   * @returns {PatchBuilderV2}
   */
  _buildQueuedIntentBuilder(descriptor, state, allPatches) {
    return new PatchBuilderV2(this._buildPatchBuilderOptions({
      descriptor,
      lamport: maxPatchLamport(allPatches) + 1,
      versionVector: state.observedFrontier,
      /**
       * Return the immutable snapshot state used while assembling one queued intent.
       *
       * @returns {import('../JoinReducer.js').WarpStateV5}
       */
      getCurrentState: () => state,
      expectedParentSha: descriptor.overlay.headPatchSha ?? null,
    }));
  }

  /**
   * Finalize and freeze one queued intent record from a populated patch builder.
   *
   * @private
   * @param {StrandDescriptor} descriptor
   * @param {StrandDescriptor['intentQueue']} intentQueue
   * @param {PatchBuilderV2} builder
   * @returns {{
   *   intentId: string,
   *   enqueuedAt: string,
   *   patch: PatchV2,
   *   reads: string[],
   *   writes: string[],
   *   contentBlobOids: string[]
   * }}
   */
  _freezeQueuedIntent(descriptor, intentQueue, builder) {
    const patch = builder.build();
    if (!Array.isArray(patch.ops) || patch.ops.length === 0) {
      throw new StrandError('Cannot queue empty strand intent: no operations added', {
        code: 'E_STRAND_EMPTY_INTENT',
      });
    }
    return Object.freeze({
      intentId: this._buildIntentId(descriptor.strandId, intentQueue.nextIntentSeq),
      enqueuedAt: this._graph._clock.timestamp(),
      patch,
      reads: normalizeStringArray(patch.reads, 'reads[]'),
      writes: normalizeStringArray(patch.writes, 'writes[]'),
      contentBlobOids: normalizeStringArray(builder._contentBlobs, 'contentBlobOids[]'),
    });
  }

  /**
   * Persist one committed patch payload using the patch journal or legacy blob fallback.
   *
   * @private
   * @param {PatchV2} committedPatch
   * @param {string} overlayId
   * @returns {Promise<string>}
   */
  async _writeCommittedPatchBlob(committedPatch, overlayId) {
    /** @type {import('../../../ports/PatchJournalPort.js').default | null | undefined} */
    const journal = this._graph._patchJournal;
    if (journal !== undefined && journal !== null) {
      return await journal.writePatch(committedPatch);
    }
    const patchCbor = this._graph._codec.encode(committedPatch);
    return this._graph._patchBlobStorage
      ? await this._graph._patchBlobStorage.store(patchCbor, {
        slug: `${this._graph._graphName}/${overlayId}/patch`,
      })
      : await this._graph._persistence.writeBlob(patchCbor);
  }

  /**
   * Build the commit tree entries for one overlay patch plus its referenced content blobs.
   *
   * @private
   * @param {string} patchBlobOid
   * @param {string[]} contentBlobOids
   * @returns {string[]}
   */
  _buildPatchTreeEntries(patchBlobOid, contentBlobOids) {
    const treeEntries = [`100644 blob ${patchBlobOid}\tpatch.cbor`];
    const uniqueBlobOids = [...new Set(contentBlobOids)];
    for (const blobOid of uniqueBlobOids) {
      treeEntries.push(`100644 blob ${blobOid}\t_content_${blobOid}`);
    }
    return treeEntries;
  }

  /**
   * Commit one patch tree and return the new overlay head SHA.
   *
   * @private
   * @param {{
   *   treeOid: string,
   *   overlayId: string,
   *   lamport: number,
   *   patchBlobOid: string,
   *   schema: number,
   *   parentSha: string|null,
   * }} params
   * @returns {Promise<string>}
   */
  async _commitPatchTree({ treeOid, overlayId, lamport, patchBlobOid, schema, parentSha }) {
    const commitMessage = encodePatchMessage({
      graph: this._graph._graphName,
      writer: overlayId,
      lamport,
      patchOid: patchBlobOid,
      schema,
      encrypted: !!this._graph._patchBlobStorage,
    });
    const parents = parentSha !== null ? [parentSha] : [];
    return await this._graph._persistence.commitNodeWithTree({
      treeOid,
      parents,
      message: commitMessage,
    });
  }

  /**
   * Attach optional graph-owned PatchBuilderV2 collaborators when available.
   *
   * @private
   * @param {Record<string, unknown>} pbOpts
   * @returns {void}
   */
  _attachOptionalPatchBuilderDeps(pbOpts) {
    this._attachOptionalPatchJournal(pbOpts);
    this._attachOptionalLogger(pbOpts);
    this._attachOptionalBlobStorage(pbOpts);
  }

  /**
   * Build the overlay commit patch-builder options for a writable strand descriptor.
   *
   * @private
   * @param {StrandDescriptor} descriptor
   * @param {import('../JoinReducer.js').WarpStateV5} state
   * @param {Array<{ patch: PatchV2, sha: string }>} allPatches
   * @returns {ConstructorParameters<typeof PatchBuilderV2>[0]}
   */
  _buildOverlayPatchBuilderOptions(descriptor, state, allPatches) {
    const overlayRef = this._buildOverlayRef(descriptor.strandId);
    return this._buildPatchBuilderOptions({
      descriptor,
      lamport: maxPatchLamport(allPatches) + 1,
      versionVector: state.observedFrontier,
      /**
       * Return the runtime's latest cached materialized state for overlay patch builders.
       *
       * @returns {import('../JoinReducer.js').WarpStateV5|null}
       */
      getCurrentState: () => this._graph._cachedState,
      expectedParentSha: descriptor.overlay.headPatchSha ?? null,
      targetRefPath: overlayRef,
      /**
       * Synchronize descriptor metadata after a successful overlay commit.
       *
       * @param {CommittedPatchResult} result
       * @returns {Promise<void>}
       */
      onCommitSuccess: async (result) => {
        await this.syncOverlayDescriptor(descriptor, result);
      },
    });
  }

  /**
   * Attach the optional patch journal to one PatchBuilderV2 options bag when present.
   *
   * @private
   * @param {Record<string, unknown>} pbOpts
   * @returns {void}
   */
  _attachOptionalPatchJournal(pbOpts) {
    if (this._graph._patchJournal !== null && this._graph._patchJournal !== undefined) {
      pbOpts['patchJournal'] = this._graph._patchJournal;
    }
  }

  /**
   * Attach the optional logger to one PatchBuilderV2 options bag when present.
   *
   * @private
   * @param {Record<string, unknown>} pbOpts
   * @returns {void}
   */
  _attachOptionalLogger(pbOpts) {
    if (this._graph._logger !== null && this._graph._logger !== undefined) {
      pbOpts['logger'] = this._graph._logger;
    }
  }

  /**
   * Attach the optional blob storage to one PatchBuilderV2 options bag when present.
   *
   * @private
   * @param {Record<string, unknown>} pbOpts
   * @returns {void}
   */
  _attachOptionalBlobStorage(pbOpts) {
    if (this._graph._blobStorage !== null && this._graph._blobStorage !== undefined) {
      pbOpts['blobStorage'] = this._graph._blobStorage;
    }
  }
}
