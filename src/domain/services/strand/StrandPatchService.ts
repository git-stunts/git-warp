import StrandError from '../../errors/StrandError.ts';
import PersistenceError from '../../errors/PersistenceError.ts';
import AssetHandle from '../../storage/AssetHandle.ts';
import { PatchBuilder } from '../PatchBuilder.ts';
import SharedDotRemovalGuard from '../SharedDotRemovalGuard.ts';
import type DotRepairStorePort from '../../../ports/DotRepairStorePort.ts';
import { dotMintAfterPatches } from '../openDotMint.ts';
import captureObservedWriteBasis from '../captureObservedWriteBasis.ts';
import MintId from '../../crdt/MintId.ts';
import StrandConeTips from './StrandConeTips.ts';
import type StrandDescriptorStore from './StrandDescriptorStore.ts';
import {
  maxPatchLamport,
  normalizeStringArray,
} from './strandShared.ts';
import type Patch from '../../types/Patch.ts';
import type { TickReceipt } from '../../types/TickReceipt.ts';
import type { WarpState } from '../JoinReducer.ts';
import type { StrandDescriptor, StrandIntentQueue, StrandQueuedIntent } from './strandTypes.ts';
import type PatchJournalPort from '../../../ports/PatchJournalPort.ts';
import type LoggerPort from '../../../ports/LoggerPort.ts';
import type AssetStoragePort from '../../../ports/AssetStoragePort.ts';
import type GraphPersistencePort from '../../../ports/GraphPersistencePort.ts';
import VersionVector from '../../crdt/VersionVector.ts';
import type CommitMessageCodecPort from '../../../ports/CommitMessageCodecPort.ts';
import type { PatchCommitResult } from '../../types/PatchCommitResult.ts';
import { strandFrontierCoordinateRef, strandPatchCoordinateRef } from '../admission/GraphCoordinateRef.ts';

export type CommittedPatchResult = { patch: Patch; sha: string };
export type PatchCommitSuccessHandler = (result: CommittedPatchResult) => Promise<void>;

function requireJournal(journal: PatchJournalPort | null | undefined): PatchJournalPort {
  if (journal === null || journal === undefined) {
    throw new PersistenceError('patchJournal is required for strand writes', 'E_MISSING_JOURNAL');
  }
  return journal;
}

function readBuilderContentHandles(builder: PatchBuilder): readonly string[] {
  return builder.contentAssets.map((handle) => handle.toString());
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
  patches: Iterable<{ readonly patch: Patch }>;
  getCurrentState: () => WarpState | null;
  evaluationCoordinateRef?: string;
  expectedParentSha: string | null;
  targetRefPath?: string;
  onCommitSuccess?: PatchCommitSuccessHandler;
  removalGuard: SharedDotRemovalGuard;
};

type WarpRuntime = {
  _graphName: string;
  _writerId: string;
  _persistence: GraphPersistencePort;
  _patchInProgress: boolean;
  _maxObservedLamport: number;
  _stateDirty: boolean;
  _cachedViewHash: string | null;
  _cachedCeiling: number | null;
  _cachedFrontier: Map<string, string> | null;
  _cachedState: WarpState | null;
  _patchJournal: PatchJournalPort | null | undefined;
  _dotRepairs: DotRepairStorePort | null;
  _assetStorage: AssetStoragePort | null | undefined;
  _commitMessageCodec: CommitMessageCodecPort;
  _logger: LoggerPort | null | undefined;
  _onDeleteWithData: 'reject' | 'cascade' | 'warn';
};

type ServiceOptions = {
  graph: WarpRuntime;
  descriptors: StrandDescriptorStore;
  loadStrandOrThrow: (strandId: string) => Promise<StrandDescriptor>;
  materializeDescriptor: (
    descriptor: StrandDescriptor,
    options: { collectReceipts: boolean; ceiling: number | null },
  ) => Promise<{
    state: WarpState;
    receipts?: TickReceipt[];
    allPatches: Array<{ patch: Patch; sha: string }>;
  }>;
  buildOverlayRef: (strandId: string) => string;
  buildIntentId: (strandId: string, sequence: number) => string;
};

export default class StrandPatchService {
  private readonly _graph: WarpRuntime;
  private readonly _descriptors: StrandDescriptorStore;
  private readonly _loadStrandOrThrow: (strandId: string) => Promise<StrandDescriptor>;
  private readonly _materializeDescriptor: ServiceOptions['materializeDescriptor'];
  private readonly _buildOverlayRef: (strandId: string) => string;
  private readonly _buildIntentId: (strandId: string, sequence: number) => string;

  /**
   * Create a patch/commit boundary over strand overlay writes and queued intent construction.
   */
  constructor({
    graph,
    descriptors,
    loadStrandOrThrow,
    materializeDescriptor,
    buildOverlayRef,
    buildIntentId,
  }: ServiceOptions) {
    this._graph = graph;
    this._descriptors = descriptors;
    this._loadStrandOrThrow = loadStrandOrThrow;
    this._materializeDescriptor = materializeDescriptor;
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
   * Builds and commits one public strand Lane write (#1039) within the
   * reentrancy guard. The builder's clock and context come from one head
   * patch per strand tip; nothing is materialized and no chain is walked.
   * Removals and content checks observe the strand's cone records, which the
   * build callback prepares with `prepareConeWriteBasis`.
   */
  async patchOnConeWithEvidence(
    strandId: string,
    build: (p: PatchBuilder) => void | Promise<void>,
  ): Promise<PatchCommitResult> {
    return await this._guarded(async () => {
      const builder = await this._createConePatchBuilder(strandId);
      await build(builder);
      return await builder.commitWithEvidence();
    });
  }

  /**
   * Build and commit a patch within a reentrancy guard.
   */
  async patch(strandId: string, build: (p: PatchBuilder) => void | Promise<void>): Promise<string> {
    return (await this.patchWithEvidence(strandId, build)).sha;
  }

  async patchWithEvidence(
    strandId: string,
    build: (p: PatchBuilder) => void | Promise<void>,
  ): Promise<PatchCommitResult> {
    return await this._guarded(async () => {
      const builder = await this.createPatchBuilder(strandId);
      await build(builder);
      return await builder.commitWithEvidence();
    });
  }

  private async _guarded<T>(operation: () => Promise<T>): Promise<T> {
    if (this._graph._patchInProgress) {
      throw new StrandError(
        'graph.patchStrand() is not reentrant. Use createStrandPatch() for nested or concurrent patches.',
        { code: 'E_STRAND_REENTRANT' },
      );
    }
    this._graph._patchInProgress = true;
    try {
      return await operation();
    } finally {
      this._graph._patchInProgress = false;
    }
  }

  private async _createConePatchBuilder(strandId: string): Promise<PatchBuilder> {
    const descriptor = await this._descriptors.readUnhydratedDescriptor(strandId);
    if (descriptor === null) {
      throw new StrandError(`Strand '${strandId}' not found`, { code: 'E_STRAND_NOT_FOUND', context: { strandId } });
    }
    this._assertWritableDescriptor(descriptor);
    const overlayId = MintId.strand(this._graph._writerId, strandId).encode();
    const overlayRef = this._buildOverlayRef(strandId);
    const headSha = await this._graph._persistence.readRef(overlayRef) ?? null;
    const tips = await new StrandConeTips(this._descriptors, strandId).tips();
    const observed = await captureObservedWriteBasis({
      refs: this._graph._persistence, journal: requireJournal(this._graph._patchJournal), graphName: this._graph._graphName,
      writerId: overlayId, expectedParentSha: headSha, ownCandidate: 1, context: VersionVector.empty(), selectedFrontier: tips,
    });
    return new PatchBuilder(this._coneOptions({ descriptor, overlayId, overlayRef, headSha, tips, observed: {
      lamport: observed.lamport, context: observed.context(),
    }, removalGuard: await this._removalGuard(descriptor) }));
  }

  private _coneOptions(write: {
    readonly descriptor: StrandDescriptor;
    readonly overlayId: string;
    readonly overlayRef: string;
    readonly headSha: string | null;
    readonly tips: ReadonlyMap<string, string>;
    readonly observed: { readonly lamport: number; readonly context: VersionVector };
    readonly removalGuard: SharedDotRemovalGuard;
  }): PatchBuilderCtorOptions {
    const options: MutablePatchBuilderCtorOptions = {
      persistence: this._graph._persistence,
      graphName: this._graph._graphName,
      writerId: write.overlayId,
      admissionParticipantId: this._graph._writerId,
      lamport: write.observed.lamport,
      versionVector: write.observed.context,
      // The head's context carries every dot the chain issued; queued intents hold minted dots too.
      dotMint: dotMintAfterPatches(write.overlayId, write.descriptor.intentQueue.intents),
      getCurrentState: () => null,
      evaluationCoordinateRef: strandFrontierCoordinateRef(this._graph._graphName, write.descriptor.strandId, write.tips),
      expectedParentSha: write.headSha,
      targetRefPath: write.overlayRef,
      onDeleteWithData: this._graph._onDeleteWithData,
      commitMessageCodec: this._graph._commitMessageCodec,
      removalGuard: write.removalGuard,
      onCommitSuccess: async (result: CommittedPatchResult) => { await this.syncOverlayDescriptor(write.descriptor, result); },
    };
    this._attachOptionalPatchBuilderDeps(options);
    return options;
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
    const builder = this._buildQueuedIntentBuilder(descriptor, state, allPatches, await this._removalGuard(descriptor));
    await build(builder);
    return this._freezeQueuedIntent(descriptor, intentQueue, builder);
  }

  /**
   * Update the strand descriptor and graph caches after a successful overlay commit.
   */
  /**
   * Records a committed strand patch in the runtime's caches. The strand's
   * shared descriptor is not rewritten: chain heads are read from each
   * writer's own ref (#1014), so writers never contend on the descriptor.
   */
  syncOverlayDescriptor(_descriptor: StrandDescriptor, { patch }: CommittedPatchResult): Promise<void> {
    if (patch.lamport > this._graph._maxObservedLamport) {
      this._graph._maxObservedLamport = patch.lamport;
    }
    this._graph._stateDirty = true;
    this._graph._cachedViewHash = null;
    this._graph._cachedCeiling = null;
    this._graph._cachedFrontier = null;
    return Promise.resolve();
  }

  async commitQueuedPatch({
    strandId,
    overlayId,
    parentSha,
    patch,
    contentAssetHandles,
    lamport,
  }: {
    strandId: string;
    overlayId: string;
    parentSha: string | null;
    patch: Patch;
    contentAssetHandles: string[];
    lamport: number;
  }): Promise<PatchCommitResult> {
    const committedPatch: Patch = {
      ...patch,
      writer: overlayId,
      lamport,
    };
    const journal = this._graph._patchJournal;
    if (journal === null || journal === undefined) {
      throw new PersistenceError(
        'patchJournal is required for committing queued strand patches',
        'E_MISSING_JOURNAL',
      );
    }
    const published = await journal.appendPatch({
      patch: committedPatch,
      graph: this._graph._graphName,
      writer: overlayId,
      targetRef: this._buildOverlayRef(strandId),
      expectedHead: parentSha,
      parent: parentSha,
      attachments: contentAssetHandles.map((handle) => new AssetHandle(handle)),
    });
    return Object.freeze({ patch: committedPatch, ...published });
  }

  private async _createPatchBuilderForDescriptor(descriptor: StrandDescriptor): Promise<PatchBuilder> {
    this._assertWritableDescriptor(descriptor);
    const { state, allPatches } = await this._materializeDescriptor(descriptor, {
      collectReceipts: false,
      ceiling: null,
    });
    return new PatchBuilder(this._buildOverlayPatchBuilderOptions(descriptor, state, allPatches, await this._removalGuard(descriptor)));
  }

  private _buildPatchBuilderOptions({
    descriptor,
    lamport,
    versionVector,
    patches,
    getCurrentState,
    evaluationCoordinateRef,
    expectedParentSha,
    targetRefPath,
    onCommitSuccess,
    removalGuard,
  }: PatchBuilderOptionsParams): PatchBuilderCtorOptions {
    const pbOpts: MutablePatchBuilderCtorOptions = {
      persistence: this._graph._persistence,
      graphName: this._graph._graphName,
      writerId: descriptor.overlay.overlayId,
      admissionParticipantId: this._graph._writerId,
      lamport,
      versionVector,
      // Queued intents already hold minted dots and commit unchanged at tick.
      dotMint: dotMintAfterPatches(descriptor.overlay.overlayId, [
        ...patches,
        ...(descriptor.intentQueue?.intents ?? []),
      ]),
      getCurrentState,
      expectedParentSha,
      onDeleteWithData: this._graph._onDeleteWithData,
      commitMessageCodec: this._graph._commitMessageCodec,
      removalGuard,
    };
    if (evaluationCoordinateRef !== undefined) {
      pbOpts.evaluationCoordinateRef = evaluationCoordinateRef;
    }
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
    removalGuard: SharedDotRemovalGuard,
  ): PatchBuilder {
    return new PatchBuilder(this._buildPatchBuilderOptions({
      descriptor,
      lamport: maxPatchLamport(allPatches) + 1,
      versionVector: state.observedFrontier,
      patches: allPatches,
      getCurrentState: () => state,
      expectedParentSha: descriptor.overlay.headPatchSha ?? null,
      removalGuard,
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
      contentAssetHandles: normalizeStringArray(readBuilderContentHandles(builder), 'contentAssetHandles[]'),
    });
  }

  private _attachOptionalPatchBuilderDeps(pbOpts: MutablePatchBuilderCtorOptions): void {
    this._attachOptionalPatchJournal(pbOpts);
    this._attachOptionalCommitMessageCodec(pbOpts);
    this._attachOptionalLogger(pbOpts);
    this._attachOptionalAssetStorage(pbOpts);
  }

  private _buildOverlayPatchBuilderOptions(
    descriptor: StrandDescriptor,
    state: WarpState,
    allPatches: Array<{ patch: Patch; sha: string }>,
    removalGuard: SharedDotRemovalGuard,
  ): PatchBuilderCtorOptions {
    const overlayRef = this._buildOverlayRef(descriptor.strandId);
    // Use the strand-materialized state (not the live _cachedState) so that
    // PatchBuilder can see strand-local nodes/edges when validating operations.
    const strandState = state;
    return this._buildPatchBuilderOptions({
      descriptor,
      lamport: maxPatchLamport(allPatches) + 1,
      versionVector: state.observedFrontier,
      patches: allPatches,
      getCurrentState: () => strandState,
      evaluationCoordinateRef: strandPatchCoordinateRef(
        this._graph._graphName,
        descriptor.strandId,
        allPatches.map(({ sha }) => sha)
      ),
      expectedParentSha: descriptor.overlay.headPatchSha ?? null,
      targetRefPath: overlayRef,
      removalGuard,
      onCommitSuccess: async (result: CommittedPatchResult) => {
        await this.syncOverlayDescriptor(descriptor, result);
      },
    });
  }

  /** Collisions recorded in this strand's view stay guarded: a lane repair does not reach a pinned base. */
  private async _removalGuard(descriptor: StrandDescriptor): Promise<SharedDotRemovalGuard> {
    return await SharedDotRemovalGuard.load(this._graph._dotRepairs, descriptor.strandId);
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

  private _attachOptionalAssetStorage(pbOpts: MutablePatchBuilderCtorOptions): void {
    if (this._graph._assetStorage !== null && this._graph._assetStorage !== undefined) {
      pbOpts.assetStorage = this._graph._assetStorage;
    }
  }
}
