import StrandError from '../../errors/StrandError.ts';
import { PatchBuilder } from '../PatchBuilder.ts';
import {
  maxPatchLamport,
  normalizeStringArray,
} from './strandShared.ts';
import type Patch from '../../types/Patch.ts';
import type { TickReceipt } from '../../types/TickReceipt.ts';
import type { WarpState } from '../JoinReducer.ts';
import type { HashablePayload } from '../../types/conflict/HashablePayload.ts';
import type { StrandDescriptor, StrandIntentQueue, StrandQueuedIntent } from './strandTypes.ts';
import type PatchJournalPort from '../../../ports/PatchJournalPort.ts';
import type LoggerPort from '../../../ports/LoggerPort.ts';
import type BlobStoragePort from '../../../ports/BlobStoragePort.ts';
import type GraphPersistencePort from '../../../ports/GraphPersistencePort.ts';
import type VersionVector from '../../crdt/VersionVector.ts';
import {
  isGitCasPatchStorage,
  LEGACY_EXTERNAL_PATCH_STORAGE,
  LEGACY_GIT_BLOB_PATCH_STORAGE,
  type PatchStorageRoute,
  type default as CommitMessageCodecPort,
} from '../../../ports/CommitMessageCodecPort.ts';

export type CommittedPatchResult = { patch: Patch; sha: string };
export type PatchCommitSuccessHandler = (result: CommittedPatchResult) => Promise<void>;

function readBuilderContentBlobs(builder: PatchBuilder): readonly string[] {
  return builder.contentBlobs;
}

/**
 * The exact shape consumed by `new PatchBuilder(...)`. Keeping a
 * named alias here avoids depending on `ConstructorParameters<>`
 * which hides the field set.
 */
type PatchBuilderCtorOptions = ConstructorParameters<typeof PatchBuilder>[0];
type MutablePatchBuilderCtorOptions = { -readonly [K in keyof PatchBuilderCtorOptions]: PatchBuilderCtorOptions[K] };

type PatchBuilderOptionsParams = {
  descriptor: StrandDescriptor;
  lamport: number;
  versionVector: VersionVector;
  getCurrentState: () => WarpState | null;
  expectedParentSha: string | null;
  targetRefPath?: string;
  onCommitSuccess?: PatchCommitSuccessHandler;
};

type WarpRuntime = {
  _graphName: string;
  _persistence: GraphPersistencePort;
  _patchInProgress: boolean;
  _maxObservedLamport: number;
  _stateDirty: boolean;
  _cachedViewHash: string | null;
  _cachedCeiling: number | null;
  _cachedFrontier: Map<string, string> | null;
  _cachedState: WarpState | null;
  _patchJournal: PatchJournalPort | null | undefined;
  _patchBlobStorage: BlobStoragePort | null | undefined;
  _blobStorage: BlobStoragePort | null | undefined;
  _commitMessageCodec: CommitMessageCodecPort;
  _logger: LoggerPort | null | undefined;
  _codec: { encode(v: HashablePayload): Uint8Array };
  _onDeleteWithData: 'reject' | 'cascade' | 'warn';
};

type ServiceOptions = {
  graph: WarpRuntime;
  loadStrandOrThrow: (strandId: string) => Promise<StrandDescriptor>;
  materializeDescriptor: (
    descriptor: StrandDescriptor,
    options: { collectReceipts: boolean; ceiling: number | null },
  ) => Promise<{
    state: WarpState;
    receipts?: TickReceipt[];
    allPatches: Array<{ patch: Patch; sha: string }>;
  }>;
  writeDescriptor: (descriptor: StrandDescriptor) => Promise<void>;
  buildOverlayRef: (strandId: string) => string;
  buildIntentId: (strandId: string, sequence: number) => string;
};

export default class StrandPatchService {
  private readonly _graph: WarpRuntime;
  private readonly _loadStrandOrThrow: (strandId: string) => Promise<StrandDescriptor>;
  private readonly _materializeDescriptor: ServiceOptions['materializeDescriptor'];
  private readonly _writeDescriptor: (descriptor: StrandDescriptor) => Promise<void>;
  private readonly _buildOverlayRef: (strandId: string) => string;
  private readonly _buildIntentId: (strandId: string, sequence: number) => string;

  /**
   * Create a patch/commit boundary over strand overlay writes and queued intent construction.
   */
  constructor({
    graph,
    loadStrandOrThrow,
    materializeDescriptor,
    writeDescriptor,
    buildOverlayRef,
    buildIntentId,
  }: ServiceOptions) {
    this._graph = graph;
    this._loadStrandOrThrow = loadStrandOrThrow;
    this._materializeDescriptor = materializeDescriptor;
    this._writeDescriptor = writeDescriptor;
    this._buildOverlayRef = buildOverlayRef;
    this._buildIntentId = buildIntentId;
  }

  /**
   * Create a fluent patch builder wired to the strand's overlay ref.
   */
  async createPatchBuilder(strandId: string): Promise<PatchBuilder> {
    const descriptor = await this._loadStrandOrThrow(strandId);
    return await this._createPatchBuilderForDescriptor(descriptor);
  }

  /**
   * Build and commit a patch within a reentrancy guard.
   */
  async patch(strandId: string, build: (p: PatchBuilder) => void | Promise<void>): Promise<string> {
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
   */
  async buildQueuedIntent(
    descriptor: StrandDescriptor,
    build: (p: PatchBuilder) => void | Promise<void>,
  ): Promise<StrandQueuedIntent> {
    this._assertWritableDescriptor(descriptor);
    // descriptor.intentQueue is already typed by the hydration path.
    const { intentQueue } = descriptor;
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
   */
  async syncOverlayDescriptor(descriptor: StrandDescriptor, { patch, sha }: CommittedPatchResult): Promise<void> {
    const now = String(this._graph._maxObservedLamport);
    const nextDescriptor: StrandDescriptor = {
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
   */
  async commitQueuedPatch({
    strandId,
    overlayId,
    parentSha,
    patch,
    contentBlobOids,
    lamport,
  }: {
    strandId: string;
    overlayId: string;
    parentSha: string | null;
    patch: Patch;
    contentBlobOids: string[];
    lamport: number;
  }): Promise<{ sha: string; patch: Patch }> {
    const committedPatch: Patch = {
      ...patch,
      writer: overlayId,
      lamport,
    };
    const patchBlobOid = await this._writeCommittedPatchBlob(committedPatch, overlayId);
    const patchStorage = this._resolveCommittedPatchStorage();
    const treeEntries = this._buildPatchTreeEntries(patchBlobOid, contentBlobOids, patchStorage);
    const treeOid = await this._graph._persistence.writeTree(treeEntries);
    const sha = await this._commitPatchTree({
      treeOid,
      overlayId,
      lamport,
      patchBlobOid,
      patchStorage,
      schema: committedPatch.schema,
      parentSha,
    });
    await this._graph._persistence.updateRef(this._buildOverlayRef(strandId), sha);
    return {
      sha,
      patch: committedPatch,
    };
  }

  private async _createPatchBuilderForDescriptor(descriptor: StrandDescriptor): Promise<PatchBuilder> {
    this._assertWritableDescriptor(descriptor);
    const { state, allPatches } = await this._materializeDescriptor(descriptor, {
      collectReceipts: false,
      ceiling: null,
    });
    return new PatchBuilder(this._buildOverlayPatchBuilderOptions(descriptor, state, allPatches));
  }

  private _buildPatchBuilderOptions({
    descriptor,
    lamport,
    versionVector,
    getCurrentState,
    expectedParentSha,
    targetRefPath,
    onCommitSuccess,
  }: PatchBuilderOptionsParams): PatchBuilderCtorOptions {
    const pbOpts: MutablePatchBuilderCtorOptions = {
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
      pbOpts.targetRefPath = targetRefPath;
    }
    if (onCommitSuccess !== undefined) {
      pbOpts.onCommitSuccess = onCommitSuccess;
    }
    this._attachOptionalPatchBuilderDeps(pbOpts);
    return pbOpts;
  }

  private _assertWritableDescriptor(descriptor: StrandDescriptor): void {
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

  private _buildQueuedIntentBuilder(
    descriptor: StrandDescriptor,
    state: WarpState,
    allPatches: Array<{ patch: Patch; sha: string }>,
  ): PatchBuilder {
    return new PatchBuilder(this._buildPatchBuilderOptions({
      descriptor,
      lamport: maxPatchLamport(allPatches) + 1,
      versionVector: state.observedFrontier,
      getCurrentState: () => state,
      expectedParentSha: descriptor.overlay.headPatchSha ?? null,
    }));
  }

  private _freezeQueuedIntent(
    descriptor: StrandDescriptor,
    intentQueue: StrandIntentQueue,
    builder: PatchBuilder,
  ): StrandQueuedIntent {
    const patch = builder.build();
    if (!Array.isArray(patch.ops) || patch.ops.length === 0) {
      throw new StrandError('Cannot queue empty strand intent: no operations added', {
        code: 'E_STRAND_EMPTY_INTENT',
      });
    }
    return Object.freeze({
      intentId: this._buildIntentId(descriptor.strandId, intentQueue.nextIntentSeq),
      enqueuedAt: String(this._graph._maxObservedLamport),
      patch,
      reads: normalizeStringArray(patch.reads, 'reads[]'),
      writes: normalizeStringArray(patch.writes, 'writes[]'),
      contentBlobOids: normalizeStringArray(readBuilderContentBlobs(builder), 'contentBlobOids[]'),
    });
  }

  private async _writeCommittedPatchBlob(committedPatch: Patch, overlayId: string): Promise<string> {
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

  private _resolveCommittedPatchStorage(): PatchStorageRoute {
    const journal = this._graph._patchJournal;
    if (journal !== undefined && journal !== null) {
      return journal.writeStorage ?? LEGACY_GIT_BLOB_PATCH_STORAGE;
    }
    return this._graph._patchBlobStorage
      ? LEGACY_EXTERNAL_PATCH_STORAGE
      : LEGACY_GIT_BLOB_PATCH_STORAGE;
  }

  private _buildPatchTreeEntries(
    patchBlobOid: string,
    contentBlobOids: string[],
    patchStorage: PatchStorageRoute,
  ): string[] {
    const treeEntries = [isGitCasPatchStorage(patchStorage)
      ? `040000 tree ${patchBlobOid}\tpatch`
      : `100644 blob ${patchBlobOid}\tpatch.cbor`];
    const uniqueBlobOids = [...new Set(contentBlobOids)];
    for (const blobOid of uniqueBlobOids) {
      treeEntries.push(`040000 tree ${blobOid}\t_content_${blobOid}`);
    }
    return treeEntries;
  }

  private async _commitPatchTree({
    treeOid,
    overlayId,
    lamport,
    patchBlobOid,
    patchStorage,
    schema,
    parentSha,
  }: {
    treeOid: string;
    overlayId: string;
    lamport: number;
    patchBlobOid: string;
    patchStorage: PatchStorageRoute;
    schema: number;
    parentSha: string | null;
  }): Promise<string> {
    const commitMessage = this._graph._commitMessageCodec.encodePatch({
      kind: 'patch',
      graph: this._graph._graphName,
      writer: overlayId,
      lamport,
      patchOid: patchBlobOid,
      schema,
      storage: patchStorage,
    });
    const parents = parentSha !== null ? [parentSha] : [];
    return await this._graph._persistence.commitNodeWithTree({
      treeOid,
      parents,
      message: commitMessage,
    });
  }

  private _attachOptionalPatchBuilderDeps(pbOpts: MutablePatchBuilderCtorOptions): void {
    this._attachOptionalPatchJournal(pbOpts);
    this._attachOptionalCommitMessageCodec(pbOpts);
    this._attachOptionalLogger(pbOpts);
    this._attachOptionalBlobStorage(pbOpts);
  }

  private _buildOverlayPatchBuilderOptions(
    descriptor: StrandDescriptor,
    state: WarpState,
    allPatches: Array<{ patch: Patch; sha: string }>,
  ): PatchBuilderCtorOptions {
    const overlayRef = this._buildOverlayRef(descriptor.strandId);
    // Use the strand-materialized state (not the live _cachedState) so that
    // PatchBuilder can see strand-local nodes/edges when validating operations.
    const strandState = state;
    return this._buildPatchBuilderOptions({
      descriptor,
      lamport: maxPatchLamport(allPatches) + 1,
      versionVector: state.observedFrontier,
      getCurrentState: () => strandState,
      expectedParentSha: descriptor.overlay.headPatchSha ?? null,
      targetRefPath: overlayRef,
      onCommitSuccess: async (result: CommittedPatchResult) => {
        await this.syncOverlayDescriptor(descriptor, result);
      },
    });
  }

  private _attachOptionalPatchJournal(pbOpts: MutablePatchBuilderCtorOptions): void {
    if (this._graph._patchJournal !== null && this._graph._patchJournal !== undefined) {
      pbOpts.patchJournal = this._graph._patchJournal;
    }
  }

  private _attachOptionalCommitMessageCodec(pbOpts: MutablePatchBuilderCtorOptions): void {
    pbOpts.commitMessageCodec = this._graph._commitMessageCodec;
  }

  private _attachOptionalLogger(pbOpts: MutablePatchBuilderCtorOptions): void {
    if (this._graph._logger !== null && this._graph._logger !== undefined) {
      pbOpts.logger = this._graph._logger;
    }
  }

  private _attachOptionalBlobStorage(pbOpts: MutablePatchBuilderCtorOptions): void {
    if (this._graph._blobStorage !== null && this._graph._blobStorage !== undefined) {
      pbOpts.blobStorage = this._graph._blobStorage;
    }
  }
}
