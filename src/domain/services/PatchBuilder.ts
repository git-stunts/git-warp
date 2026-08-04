/**
 * PatchBuilder — fluent API for building schema:2 WARP patches.
 * Maintains a VersionVector per writer, assigns dots on add operations,
 * reads current state to populate observedDots for removes, and includes
 * context VersionVector in the patch.
 *
 * @module domain/services/PatchBuilder
 */

import nullLogger from '../utils/nullLogger.ts';
import VersionVector from '../crdt/VersionVector.ts';
import Patch from '../types/Patch.ts';
import NodeAdd from '../types/ops/NodeAdd.ts';
import NodeRemove from '../types/ops/NodeRemove.ts';
import EdgeAdd from '../types/ops/EdgeAdd.ts';
import EdgeRemove from '../types/ops/EdgeRemove.ts';
import type { PatchOp, CanonicalPatchOp } from '../types/ops/unions.ts';
import { encodeEdgeKey } from './KeyCodec.ts';
import { lowerCanonicalOp } from './OpNormalizer.ts';
import PatchError from '../errors/PatchError.ts';
import { canonicalStringify } from '../utils/canonicalStringify.ts';
import {
  findAttachedData,
  assertNoReservedBytes,
  assertObservedDotsForRemove,
  resolveEffectId,
} from './PatchBuilderValidation.ts';
import type { ContentInput, ContentMetadataInput } from './PatchBuilderContent.ts';
import { allocateEntityCapture, planEntityCapturePayload } from './PatchBuilderEntity.ts';
import PatchBuilderPropertyRuntime from './PatchBuilderPropertyRuntime.ts';
import type { EntityCapturePayload } from '../types/EntityCapturePayload.ts';
import { capturePatchBuilderCausalBasis } from './admission/PatchBuilderCausalBasis.ts';
import { requireCommitMessageCodec } from './codec/CommitMessageCodecRequirement.ts';
import { commitPatch } from './PatchCommitter.ts';
import type { PatchCommitResult } from '../types/PatchCommitResult.ts';
import type { WarpState } from './JoinReducer.ts';
import type WarpKernelPort from '../../ports/WarpKernelPort.ts';
import type PatchJournalPort from '../../ports/PatchJournalPort.ts';
import type LoggerPort from '../../ports/LoggerPort.ts';
import type AssetStoragePort from '../../ports/AssetStoragePort.ts';
import type CommitMessageCodecPort from '../../ports/CommitMessageCodecPort.ts';
import type AssetHandle from '../storage/AssetHandle.ts';

type DeletePolicy = 'reject' | 'cascade' | 'warn';

type PatchBuilderOptions = {
  persistence: WarpKernelPort;
  graphName: string;
  writerId: string;
  lamport: number;
  versionVector: VersionVector;
  getCurrentState: () => WarpState | null;
  evaluationCoordinateRef?: string;
  admissionParticipantId?: string;
  expectedParentSha?: string | null;
  targetRefPath?: string;
  onCommitSuccess?: ((result: PatchCommitResult) => void | Promise<void>) | null;
  onDeleteWithData?: DeletePolicy;
  patchJournal?: PatchJournalPort;
  commitMessageCodec?: CommitMessageCodecPort;
  logger?: LoggerPort;
  assetStorage?: AssetStoragePort;
};

export class PatchBuilder {
  private readonly _persistence: WarpKernelPort;
  private readonly _graphName: string;
  private readonly _writerId: string;
  private readonly _targetRefPath: string | null;
  private readonly _lamport: number;
  private readonly _vv: VersionVector;
  private readonly _getCurrentState: () => WarpState | null;
  private readonly _expectedParentSha: string | null;
  private readonly _onCommitSuccess: ((result: PatchCommitResult) => void | Promise<void>) | null;
  private readonly _onDeleteWithData: DeletePolicy;
  private readonly _patchJournal: PatchJournalPort | null;
  private readonly _commitMessageCodec: CommitMessageCodecPort | null;
  private readonly _logger: LoggerPort;
  private readonly _properties: PatchBuilderPropertyRuntime;
  private readonly _ops: PatchOp[] = [];
  private readonly _nodesAdded = new Set<string>();
  private readonly _edgesAdded = new Set<string>();
  private readonly _observedOperands = new Set<string>();
  private readonly _writes = new Set<string>();
  private _snapshotState: WarpState | null | undefined = undefined;
  private _committed = false;
  private _committing = false;

  constructor(options: PatchBuilderOptions) {
    this._persistence = options.persistence;
    this._graphName = options.graphName;
    this._writerId = options.writerId;
    this._targetRefPath =
      typeof options.targetRefPath === 'string' && options.targetRefPath.length > 0
        ? options.targetRefPath
        : null;
    this._lamport = options.lamport;
    this._vv = options.versionVector.clone();
    this._getCurrentState = options.getCurrentState;
    this._expectedParentSha = options.expectedParentSha ?? null;
    this._onCommitSuccess = options.onCommitSuccess ?? null;
    this._onDeleteWithData = options.onDeleteWithData ?? 'warn';
    this._patchJournal = options.patchJournal ?? null;
    this._commitMessageCodec = options.commitMessageCodec ?? null;
    this._logger = options.logger ?? nullLogger;
    this._properties = new PatchBuilderPropertyRuntime({
      assetStorage: options.assetStorage ?? null,
      assertMutable: () => this._assertNotCommitted(),
      edgesAdded: this._edgesAdded,
      getSnapshotState: () => this._getSnapshotState(),
      graphName: this._graphName,
      nodesAdded: this._nodesAdded,
      observedOperands: this._observedOperands,
      ops: this._ops,
      writes: this._writes,
    });
    capturePatchBuilderCausalBasis(this, {
      graphName: options.graphName,
      writerId: options.writerId,
      participantId: options.admissionParticipantId ?? options.writerId,
      expectedParentSha: this._expectedParentSha,
      evaluationCoordinateRef: options.evaluationCoordinateRef ?? null,
    });
  }

  // ── State access ───────────────────────────────────────────────────

  private _getSnapshotState(): WarpState | null {
    if (this._snapshotState === undefined) {
      this._snapshotState = this._getCurrentState() ?? null;
    }
    return this._snapshotState;
  }

  private _assertNotCommitted(): void {
    if (this._committed || this._committing) {
      throw new PatchError('PatchBuilder already committed — create a new builder', {
        code: 'E_PATCH_ALREADY_COMMITTED',
      });
    }
  }

  // ── Graph operations ───────────────────────────────────────────────
  addNode(nodeId: string): PatchBuilder {
    this._assertNotCommitted();
    assertNoReservedBytes(nodeId, 'nodeId');
    const dot = this._vv.increment(this._writerId);
    this._ops.push(new NodeAdd(nodeId, dot));
    this._nodesAdded.add(nodeId);
    this._writes.add(nodeId);
    return this;
  }

  /** Creates one entity and its initial payload in a single-subject patch. */
  addEntity(nodeId: string, properties: EntityCapturePayload): PatchBuilder {
    this._assertNotCommitted();
    const scope = { added: this._nodesAdded, state: this._getSnapshotState() };
    const payload = planEntityCapturePayload(nodeId, properties, scope);
    this.addNode(nodeId);
    this._ops.push(...payload);
    return this;
  }
  addEntityAuto(namespace: string, properties: EntityCapturePayload): PatchBuilder {
    this._assertNotCommitted();
    const capture = allocateEntityCapture({
      namespace,
      properties,
      scope: { added: this._nodesAdded, state: this._getSnapshotState() },
      writerId: this._writerId,
      versionVector: this._vv,
    });
    this._ops.push(new NodeAdd(capture.nodeId, capture.dot), ...capture.payload);
    this._nodesAdded.add(capture.nodeId);
    this._writes.add(capture.nodeId);
    return this;
  }
  removeNode(nodeId: string): PatchBuilder {
    this._assertNotCommitted();
    const state = this._getSnapshotState();

    if (this._onDeleteWithData === 'cascade' && state) {
      const { edges } = findAttachedData(state, nodeId);
      for (const edgeKey of edges) {
        const parts = edgeKey.split('\0');
        const edgeDots = [...state.edgeAlive.getDots(edgeKey)];
        this._ops.push(
          new EdgeRemove({
            from: parts[0]!,
            to: parts[1]!,
            label: parts[2]!,
            observedDots: edgeDots,
          })
        );
        this._observedOperands.add(edgeKey);
      }
    }

    if (state && this._onDeleteWithData !== 'cascade') {
      const { edges, props, hasData } = findAttachedData(state, nodeId);
      if (hasData) {
        const details: string[] = [];
        if (edges.length > 0) {
          details.push(`${edges.length} edge(s)`);
        }
        if (props.length > 0) {
          details.push(`${props.length} propert${props.length === 1 ? 'y' : 'ies'}`);
        }
        const summary = details.join(' and ');

        if (this._onDeleteWithData === 'reject') {
          throw new PatchError(
            `Cannot delete node '${nodeId}': node has attached data (${summary}). ` +
              `Remove edges and properties first, or set onDeleteWithData to 'cascade'.`,
            {
              code: 'E_PATCH_DELETE_WITH_DATA',
              context: { nodeId, edges: edges.length, props: props.length },
            }
          );
        }
        if (this._onDeleteWithData === 'warn') {
          this._logger.warn(
            `[warp] Deleting node '${nodeId}' which has attached data (${summary}). Orphaned data will remain in state.`
          );
        }
      }
    }

    if (!state) {
      throw new PatchError(
        `Cannot remove node '${nodeId}': graph must be materialized before removing nodes`,
        { code: 'E_PATCH_NO_STATE' }
      );
    }
    const observedDots = [...state.nodeAlive.getDots(nodeId)];
    assertObservedDotsForRemove(observedDots, 'node', { nodeId });
    this._ops.push(new NodeRemove(nodeId, observedDots));
    this._observedOperands.add(nodeId);
    return this;
  }

  addEdge(from: string, to: string, label: string): PatchBuilder {
    this._assertNotCommitted();
    assertNoReservedBytes(from, 'from node ID');
    assertNoReservedBytes(to, 'to node ID');
    assertNoReservedBytes(label, 'edge label');
    const dot = this._vv.increment(this._writerId);
    this._ops.push(new EdgeAdd({ from, to, label, dot }));
    const edgeKey = encodeEdgeKey(from, to, label);
    this._edgesAdded.add(edgeKey);
    this._observedOperands.add(from);
    this._observedOperands.add(to);
    this._writes.add(edgeKey);
    return this;
  }

  removeEdge(from: string, to: string, label: string): PatchBuilder {
    this._assertNotCommitted();
    const state = this._getSnapshotState();
    const edgeKey = encodeEdgeKey(from, to, label);
    if (!state) {
      throw new PatchError(
        `Cannot remove edge '${from}->${to}' (${label}): graph must be materialized before removing edges`,
        { code: 'E_PATCH_NO_STATE' }
      );
    }
    const observedDots = [...state.edgeAlive.getDots(edgeKey)];
    assertObservedDotsForRemove(observedDots, 'edge', { edgeKey });
    this._ops.push(new EdgeRemove({ from, to, label, observedDots }));
    this._observedOperands.add(edgeKey);
    return this;
  }

  emitEffect<T>(kind: string, payload?: T, options?: { effectId?: string }): string {
    this._assertNotCommitted();
    const effectId = resolveEffectId(kind, options?.effectId, {
      writerId: this._writerId,
      lamport: this._lamport,
      sequence: this._ops.length,
    });
    this.addNode(effectId);
    this.setProperty(effectId, 'kind', kind);
    this.setProperty(effectId, 'writer', this._writerId);
    if (payload !== null && payload !== undefined) {
      this.setProperty(effectId, 'payload', canonicalStringify(payload));
    }
    return effectId;
  }

  setProperty<T>(nodeId: string, key: string, value: T): PatchBuilder {
    this._assertNotCommitted();
    this._properties.setNodeProperty(nodeId, key, value);
    return this;
  }

  setEdgeProperty<T>(from: string, to: string, label: string, key: string, value: T): PatchBuilder {
    this._assertNotCommitted();
    this._properties.setEdgeProperty({ from, to, label, key, value });
    return this;
  }

  // ── Content operations ─────────────────────────────────────────────

  async attachContent(
    nodeId: string,
    content: ContentInput,
    metadata?: ContentMetadataInput
  ): Promise<PatchBuilder> {
    this._assertNotCommitted();
    await this._properties.attachNodeContent(nodeId, content, metadata);
    return this;
  }

  clearContent(nodeId: string): PatchBuilder {
    this._assertNotCommitted();
    this._properties.clearNodeContent(nodeId);
    return this;
  }

  async attachEdgeContent(
    from: string,
    to: string,
    label: string,
    content: ContentInput,
    metadata?: ContentMetadataInput
  ): Promise<PatchBuilder> {
    this._assertNotCommitted();
    await this._properties.attachEdgeContent({ from, to, label, content, metadata });
    return this;
  }

  clearEdgeContent(from: string, to: string, label: string): PatchBuilder {
    this._assertNotCommitted();
    this._properties.clearEdgeContent(from, to, label);
    return this;
  }

  // ── Build & Commit ─────────────────────────────────────────────────

  build(): Patch {
    const schema = this._properties.hasEdgeProperties ? 3 : 2;
    const rawOps = this._ops.map((op) => lowerCanonicalOp(op as CanonicalPatchOp));
    return new Patch({
      schema,
      writer: this._writerId,
      lamport: this._lamport,
      context: VersionVector.serialize(this._vv),
      ops: rawOps,
      reads: [...this._observedOperands].sort(),
      writes: [...this._writes].sort(),
    });
  }

  async commit(): Promise<string> {
    return (await this.commitWithEvidence()).sha;
  }

  /** Commits and returns the storage-retention evidence for the causal patch. */
  async commitWithEvidence(): Promise<PatchCommitResult> {
    this._assertNotCommitted();
    this._committing = true;
    try {
      const result = await commitPatch({
        persistence: this._persistence,
        graphName: this._graphName,
        writerId: this._writerId,
        lamport: this._lamport,
        vv: this._vv,
        ops: this._ops,
        observedOperands: this._observedOperands,
        writes: this._writes,
        hasEdgeProps: this._properties.hasEdgeProperties,
        expectedParentSha: this._expectedParentSha,
        targetRefPath: this._targetRefPath,
        contentAssets: this._properties.contentAssets,
        patchJournal: this._patchJournal,
        commitMessageCodec: requireCommitMessageCodec(this._commitMessageCodec),
        logger: this._logger,
        onCommitSuccess: this._onCommitSuccess,
      });
      this._committed = true;
      return result;
    } finally {
      this._committing = false;
    }
  }

  // ── Accessors ──────────────────────────────────────────────────────

  get ops(): PatchOp[] {
    return this._ops;
  }
  get versionVector(): VersionVector {
    return this._vv;
  }
  get reads(): ReadonlySet<string> {
    return new Set(this._observedOperands);
  }
  get writes(): ReadonlySet<string> {
    return new Set(this._writes);
  }

  /**
   * Asset handles captured via content attachment operations.
   */
  get contentAssets(): readonly AssetHandle[] {
    return this._properties.contentAssets;
  }
}
