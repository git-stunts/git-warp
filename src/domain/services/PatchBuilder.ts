/**
 * PatchBuilder — fluent API for building schema:2 WARP patches.
 *
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
import NodePropSet from '../types/ops/NodePropSet.ts';
import EdgePropSet from '../types/ops/EdgePropSet.ts';
import ContentAttachmentWriteIntent from '../graph/ContentAttachmentWriteIntent.ts';
import EdgePropertyWriteIntent from '../graph/EdgePropertyWriteIntent.ts';
import NodePropertyWriteIntent from '../graph/NodePropertyWriteIntent.ts';
import type { PatchOp, CanonicalPatchOp } from '../types/ops/unions.ts';
import { encodeEdgeKey, CONTENT_PROPERTY_KEY, CONTENT_MIME_PROPERTY_KEY, CONTENT_SIZE_PROPERTY_KEY, EFFECT_NODE_PREFIX } from './KeyCodec.ts';
import { lowerCanonicalOp } from './OpNormalizer.ts';
import WriterError from '../errors/WriterError.ts';
import PatchError from '../errors/PatchError.ts';
import { canonicalStringify } from '../utils/canonicalStringify.ts';
import {
  findAttachedData,
  assertNoReservedBytes,
  assertObservedDotsForRemove,
} from './PatchBuilderValidation.ts';
import {
  requirePatchPropertyValue,
  storeContentAttachmentPayload,
  type ContentInput,
  type ContentMetadataInput,
} from './PatchBuilderContent.ts';
import { requireCommitMessageCodec } from './codec/CommitMessageCodecRequirement.ts';
import { commitPatch } from './PatchCommitter.ts';
import type { WarpState } from './JoinReducer.ts';
import type WarpKernelPort from '../../ports/WarpKernelPort.ts';
import type PatchJournalPort from '../../ports/PatchJournalPort.ts';
import type LoggerPort from '../../ports/LoggerPort.ts';
import type BlobStoragePort from '../../ports/BlobStoragePort.ts';
import type CommitMessageCodecPort from '../../ports/CommitMessageCodecPort.ts';

type DeletePolicy = 'reject' | 'cascade' | 'warn';

type PatchBuilderOptions = {
  persistence: WarpKernelPort;
  graphName: string;
  writerId: string;
  lamport: number;
  versionVector: VersionVector;
  getCurrentState: () => WarpState | null;
  expectedParentSha?: string | null;
  targetRefPath?: string;
  onCommitSuccess?: ((result: { patch: Patch; sha: string }) => void | Promise<void>) | null;
  onDeleteWithData?: DeletePolicy;
  patchJournal?: PatchJournalPort;
  commitMessageCodec?: CommitMessageCodecPort;
  logger?: LoggerPort;
  blobStorage?: BlobStoragePort;
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
  private readonly _onCommitSuccess: ((result: { patch: Patch; sha: string }) => void | Promise<void>) | null;
  private readonly _onDeleteWithData: DeletePolicy;
  private readonly _patchJournal: PatchJournalPort | null;
  private readonly _commitMessageCodec: CommitMessageCodecPort | null;
  private readonly _logger: LoggerPort;
  private readonly _blobStorage: BlobStoragePort | null;
  private readonly _ops: PatchOp[] = [];
  private readonly _nodesAdded = new Set<string>();
  private readonly _edgesAdded = new Set<string>();
  private readonly _observedOperands = new Set<string>();
  private readonly _writes = new Set<string>();
  private readonly _contentBlobs: string[] = [];
  private _snapshotState: WarpState | null | undefined = undefined;
  private _hasEdgeProps = false;
  private _committed = false;
  private _committing = false;

  constructor(options: PatchBuilderOptions) {
    this._persistence = options.persistence;
    this._graphName = options.graphName;
    this._writerId = options.writerId;
    this._targetRefPath = typeof options.targetRefPath === 'string' && options.targetRefPath.length > 0
      ? options.targetRefPath : null;
    this._lamport = options.lamport;
    this._vv = options.versionVector.clone();
    this._getCurrentState = options.getCurrentState;
    this._expectedParentSha = options.expectedParentSha ?? null;
    this._onCommitSuccess = options.onCommitSuccess ?? null;
    this._onDeleteWithData = options.onDeleteWithData ?? 'warn';
    this._patchJournal = options.patchJournal ?? null;
    this._commitMessageCodec = options.commitMessageCodec ?? null;
    this._logger = options.logger ?? nullLogger;
    this._blobStorage = options.blobStorage ?? null;
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
      throw new PatchError('PatchBuilder already committed — create a new builder', { code: 'E_PATCH_ALREADY_COMMITTED' });
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

  removeNode(nodeId: string): PatchBuilder {
    this._assertNotCommitted();
    const state = this._getSnapshotState();

    if (this._onDeleteWithData === 'cascade' && state) {
      const { edges } = findAttachedData(state, nodeId);
      for (const edgeKey of edges) {
        const parts = edgeKey.split('\0');
        const edgeDots = [...state.edgeAlive.getDots(edgeKey)];
        this._ops.push(new EdgeRemove({ from: parts[0]!, to: parts[1]!, label: parts[2]!, observedDots: edgeDots }));
        this._observedOperands.add(edgeKey);
      }
    }

    if (state && this._onDeleteWithData !== 'cascade') {
      const { edges, props, hasData } = findAttachedData(state, nodeId);
      if (hasData) {
        const details: string[] = [];
        if (edges.length > 0) { details.push(`${edges.length} edge(s)`); }
        if (props.length > 0) { details.push(`${props.length} propert${props.length === 1 ? 'y' : 'ies'}`); }
        const summary = details.join(' and ');

        if (this._onDeleteWithData === 'reject') {
          throw new PatchError(
            `Cannot delete node '${nodeId}': node has attached data (${summary}). ` +
            `Remove edges and properties first, or set onDeleteWithData to 'cascade'.`,
            { code: 'E_PATCH_DELETE_WITH_DATA', context: { nodeId, edges: edges.length, props: props.length } },
          );
        }
        if (this._onDeleteWithData === 'warn') {
          this._logger.warn(
            `[warp] Deleting node '${nodeId}' which has attached data (${summary}). Orphaned data will remain in state.`,
          );
        }
      }
    }

    if (!state) {
      throw new PatchError(
        `Cannot remove node '${nodeId}': graph must be materialized before removing nodes`,
        { code: 'E_PATCH_NO_STATE' },
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
        { code: 'E_PATCH_NO_STATE' },
      );
    }
    const observedDots = [...state.edgeAlive.getDots(edgeKey)];
    assertObservedDotsForRemove(observedDots, 'edge', { edgeKey });
    this._ops.push(new EdgeRemove({ from, to, label, observedDots }));
    this._observedOperands.add(edgeKey);
    return this;
  }

  emitEffect(kind: string, payload?: unknown, options?: { effectId?: string }): string { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
    this._assertNotCommitted();
    if (typeof kind !== 'string' || kind.length === 0) {
      throw new PatchError('emitEffect: kind must be a non-empty string', {
        code: 'E_EFFECT_INVALID_KIND', context: { kind },
      });
    }
    const effectId = (options?.effectId !== undefined && options.effectId !== '')
      ? options.effectId
      : `${EFFECT_NODE_PREFIX}${this._writerId}-${this._lamport}-${this._ops.length}`;
    this.addNode(effectId);
    this.setProperty(effectId, 'kind', kind);
    this.setProperty(effectId, 'writer', this._writerId);
    if (payload !== null && payload !== undefined) {
      this.setProperty(effectId, 'payload', canonicalStringify(payload));
    }
    return effectId;
  }

  setProperty(nodeId: string, key: string, value: unknown): PatchBuilder { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
    this._assertNotCommitted();
    assertNoReservedBytes(nodeId, 'nodeId');
    assertNoReservedBytes(key, 'key');
    const intent = NodePropertyWriteIntent.fromLegacyProperty(
      nodeId,
      key,
      requirePatchPropertyValue(value),
    );
    this._lowerNodePropertyIntent(intent);
    return this;
  }

  setEdgeProperty(from: string, to: string, label: string, key: string, value: unknown): PatchBuilder { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
    this._assertNotCommitted();
    assertNoReservedBytes(from, 'from node ID');
    assertNoReservedBytes(to, 'to node ID');
    assertNoReservedBytes(label, 'edge label');
    assertNoReservedBytes(key, 'key');
    const intent = EdgePropertyWriteIntent.fromLegacyProperty({
      from,
      to,
      label,
      key,
      value: requirePatchPropertyValue(value),
    });
    const ek = this._assertEdgeExists(from, to, label);
    this._lowerEdgePropertyIntent(intent);
    this._observedOperands.add(ek);
    this._writes.add(ek);
    return this;
  }

  // ── Content operations ─────────────────────────────────────────────

  async attachContent(
    nodeId: string,
    content: ContentInput,
    metadata?: ContentMetadataInput,
  ): Promise<PatchBuilder> {
    this._assertNotCommitted();
    assertNoReservedBytes(nodeId, 'nodeId');
    assertNoReservedBytes(CONTENT_PROPERTY_KEY, 'key');
    this._assertNodeExistsForContent(nodeId);
    if (!this._blobStorage) {
      throw new WriterError('Cannot attach content without blob storage; configure content storage when opening the runtime', { code: 'NO_BLOB_STORAGE' });
    }
    const slug = `${this._graphName}/${nodeId}`;
    const payload = await storeContentAttachmentPayload({
      blobStorage: this._blobStorage,
      content,
      metadata,
      slug,
    });
    const intent = ContentAttachmentWriteIntent.forNode(nodeId, payload);
    this._lowerNodeContentIntent(intent);
    this._contentBlobs.push(intent.oid());
    return this;
  }

  clearContent(nodeId: string): PatchBuilder {
    this._assertNotCommitted();
    assertNoReservedBytes(nodeId, 'nodeId');
    assertNoReservedBytes(CONTENT_PROPERTY_KEY, 'key');
    this._assertNodeExistsForContent(nodeId);
    this.setProperty(nodeId, CONTENT_PROPERTY_KEY, null);
    this.setProperty(nodeId, CONTENT_SIZE_PROPERTY_KEY, null);
    this.setProperty(nodeId, CONTENT_MIME_PROPERTY_KEY, null);
    return this;
  }

  async attachEdgeContent(
    from: string, to: string, label: string,
    content: ContentInput,
    metadata?: ContentMetadataInput,
  ): Promise<PatchBuilder> {
    this._assertNotCommitted();
    assertNoReservedBytes(from, 'from');
    assertNoReservedBytes(to, 'to');
    assertNoReservedBytes(label, 'label');
    assertNoReservedBytes(CONTENT_PROPERTY_KEY, 'key');
    this._assertEdgeExists(from, to, label);
    if (!this._blobStorage) {
      throw new WriterError('Cannot attach content without blob storage; configure content storage when opening the runtime', { code: 'NO_BLOB_STORAGE' });
    }
    const slug = `${this._graphName}/${from}/${to}/${label}`;
    const payload = await storeContentAttachmentPayload({
      blobStorage: this._blobStorage,
      content,
      metadata,
      slug,
    });
    const intent = ContentAttachmentWriteIntent.forEdge({ from, to, label }, payload);
    this._lowerEdgeContentIntent(intent);
    this._contentBlobs.push(intent.oid());
    return this;
  }

  clearEdgeContent(from: string, to: string, label: string): PatchBuilder {
    this._assertNotCommitted();
    assertNoReservedBytes(from, 'from');
    assertNoReservedBytes(to, 'to');
    assertNoReservedBytes(label, 'label');
    assertNoReservedBytes(CONTENT_PROPERTY_KEY, 'key');
    this._assertEdgeExists(from, to, label);
    this.setEdgeProperty(from, to, label, CONTENT_PROPERTY_KEY, null);
    this.setEdgeProperty(from, to, label, CONTENT_SIZE_PROPERTY_KEY, null);
    this.setEdgeProperty(from, to, label, CONTENT_MIME_PROPERTY_KEY, null);
    return this;
  }

  private _lowerNodeContentIntent(intent: ContentAttachmentWriteIntent): void {
    const nodeId = intent.nodeId();
    this.setProperty(nodeId, CONTENT_PROPERTY_KEY, intent.oid());
    this.setProperty(nodeId, CONTENT_SIZE_PROPERTY_KEY, intent.size());
    this.setProperty(nodeId, CONTENT_MIME_PROPERTY_KEY, intent.mime());
  }

  private _lowerEdgeContentIntent(intent: ContentAttachmentWriteIntent): void {
    const target = intent.edgeTarget();
    this.setEdgeProperty(target.from, target.to, target.label, CONTENT_PROPERTY_KEY, intent.oid());
    this.setEdgeProperty(target.from, target.to, target.label, CONTENT_SIZE_PROPERTY_KEY, intent.size());
    this.setEdgeProperty(target.from, target.to, target.label, CONTENT_MIME_PROPERTY_KEY, intent.mime());
  }

  private _lowerNodePropertyIntent(intent: NodePropertyWriteIntent): void {
    const nodeId = intent.nodeId();
    this._ops.push(new NodePropSet(nodeId, intent.propertyKey(), intent.propertyValue()));
    this._observedOperands.add(nodeId);
    this._writes.add(nodeId);
  }

  private _lowerEdgePropertyIntent(intent: EdgePropertyWriteIntent): void {
    const target = intent.edgeTarget();
    this._ops.push(new EdgePropSet({
      from: target.from,
      to: target.to,
      label: target.label,
      key: intent.propertyKey(),
      value: intent.propertyValue(),
    }));
    this._hasEdgeProps = true;
  }

  // ── Existence guards ───────────────────────────────────────────────

  private _assertNodeExistsForContent(nodeId: string): void {
    if (this._nodesAdded.has(nodeId)) { return; }
    const state = this._getSnapshotState();
    if (!state || !state.nodeAlive.contains(nodeId)) {
      throw new PatchError(
        `Cannot attach content to unknown node '${nodeId}': add the node first`, // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
        { code: 'E_PATCH_CONTENT_UNKNOWN_NODE', context: { nodeId } },
      );
    }
  }

  private _assertEdgeExists(from: string, to: string, label: string): string {
    const ek = encodeEdgeKey(from, to, label);
    if (!this._edgesAdded.has(ek)) {
      const state = this._getSnapshotState();
      if (!state || !state.edgeAlive.contains(ek)) {
        throw new PatchError(
          `Cannot set property on unknown edge (${from} → ${to} [${label}]): add the edge first`, // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
          { code: 'E_PATCH_EDGE_PROP_UNKNOWN_EDGE', context: { from, to, label } },
        );
      }
    }
    return ek;
  }

  // ── Build & Commit ─────────────────────────────────────────────────

  build(): Patch {
    const schema = this._hasEdgeProps ? 3 : 2;
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
    this._assertNotCommitted();
    this._committing = true;
    try {
      const sha = await commitPatch({
        persistence: this._persistence,
        graphName: this._graphName,
        writerId: this._writerId,
        lamport: this._lamport,
        vv: this._vv,
        ops: this._ops,
        observedOperands: this._observedOperands,
        writes: this._writes,
        hasEdgeProps: this._hasEdgeProps,
        expectedParentSha: this._expectedParentSha,
        targetRefPath: this._targetRefPath,
        contentBlobs: this._contentBlobs,
        patchJournal: this._patchJournal,
        commitMessageCodec: requireCommitMessageCodec(this._commitMessageCodec),
        logger: this._logger,
        onCommitSuccess: this._onCommitSuccess,
      });
      this._committed = true;
      return sha;
    } finally {
      this._committing = false;
    }
  }

  // ── Accessors ──────────────────────────────────────────────────────

  get ops(): PatchOp[] { return this._ops; }
  get versionVector(): VersionVector { return this._vv; }
  get reads(): ReadonlySet<string> { return new Set(this._observedOperands); }
  get writes(): ReadonlySet<string> { return new Set(this._writes); }

  /**
   * Content-blob OIDs captured via `attachNodeContent` / `attachEdgeContent`.
   * Exposed for strand-overlay queued-intent assembly, which needs the
   * snapshot of blob OIDs to persist alongside the patch entry.
   */
  get contentBlobs(): readonly string[] { return [...this._contentBlobs]; }
}
