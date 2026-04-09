/**
 * TypeScript augmentation for WarpRuntime wired methods.
 *
 * Methods from extracted controllers are wired onto WarpRuntime.prototype
 * via defineProperty delegation. This declaration file makes them visible to tsc.
 */

import type { PatchBuilder } from '../services/PatchBuilder.js';
import type { Writer } from './Writer.ts';
import type { WarpState } from '../services/JoinReducer.ts';
import type Patch from '../types/Patch.js';
import type { StateDiffResult } from '../services/StateDiff.js';
import type { TickReceipt } from '../types/TickReceipt.js';

/**
 * Observer configuration for view creation and translation cost.
 */
interface ObserverConfig {
  match: string | string[];
  expose?: string[];
  redact?: string[];
}

/**
 * Translation cost result.
 */
interface TranslationCostResult {
  cost: number;
  breakdown: { nodeLoss: number; edgeLoss: number; propLoss: number };
}

interface ContentMeta {
  oid: string;
  mime: string | null;
  size: number | null;
}

/**
 * Lightweight status snapshot.
 */
interface WarpStatus {
  cachedState: 'fresh' | 'stale' | 'none';
  patchesSinceCheckpoint: number;
  tombstoneRatio: number;
  writers: number;
  frontier: Record<string, string>;
}

/**
 * Sync request message.
 */
interface SyncRequest {
  type: 'sync-request';
  frontier: Record<string, string>;
}

/**
 * Sync response message.
 */
interface SyncResponse {
  type: 'sync-response';
  frontier: Record<string, string>;
  patches: Array<{ writerId: string; sha: string; patch: unknown }>;
}

/**
 * Result of applySyncResponse().
 */
interface ApplySyncResult {
  state: WarpState;
  frontier: Map<string, number>;
  applied: number;
}

/**
 * Sync options for syncWith().
 */
interface SyncTrustOptions {
  mode?: 'off' | 'log-only' | 'enforce';
  pin?: string | null;
}

interface SyncWithOptions {
  path?: string;
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onStatus?: (event: {
    type: string;
    attempt: number;
    durationMs?: number;
    status?: number;
    error?: Error;
  }) => void;
  auth?: { secret: string; keyId?: string };
  trust?: SyncTrustOptions;
  /** Auto-materialize after sync; when true, result includes `state` */
  materialize?: boolean;
}

/**
 * GC execution result.
 */
interface GCExecuteResult {
  nodesCompacted: number;
  edgesCompacted: number;
  tombstonesRemoved: number;
  durationMs: number;
}

/**
 * GC metrics.
 */
interface GCMetrics {
  nodeCount: number;
  edgeCount: number;
  tombstoneCount: number;
  tombstoneRatio: number;
  patchesSinceCompaction: number;
  lastCompactionTime: number;
}

/**
 * Result of maybeRunGC().
 */
interface MaybeGCResult {
  ran: boolean;
  result: GCExecuteResult | null;
  reasons: string[];
}

/**
 * Join receipt from CRDT merge.
 */
interface JoinReceipt {
  nodesAdded: number;
  nodesRemoved: number;
  edgesAdded: number;
  edgesRemoved: number;
  propsChanged: number;
  frontierMerged: boolean;
}

/**
 * Wormhole edge.
 */
interface WormholeEdge {
  fromSha: string;
  toSha: string;
  writerId: string;
  payload: unknown;
  patchCount: number;
}

/**
 * Checkpoint data returned by _loadLatestCheckpoint.
 */
interface CheckpointData {
  state: WarpState;
  frontier: Map<string, string>;
  stateHash: string;
  schema: number;
  provenanceIndex?: unknown;
  indexShardOids?: Record<string, string>;
}

type ConflictKind = 'supersession' | 'eventual_override' | 'redundancy';
type ConflictEvidenceLevel = 'summary' | 'standard' | 'full';
type ConflictCausalRelation = 'concurrent' | 'ordered' | 'replay_equivalent' | 'reducer_collapsed';

interface ConflictTargetSelector {
  targetKind: 'node' | 'edge' | 'node_property' | 'edge_property';
  entityId?: string;
  propertyKey?: string;
  from?: string;
  to?: string;
  label?: string;
}

interface ConflictAnchor {
  patchSha: string;
  writerId: string;
  lamport: number;
  opIndex: number;
  receiptPatchSha?: string;
  receiptLamport?: number;
  receiptOpIndex?: number;
}

interface ConflictTarget {
  targetKind: 'node' | 'edge' | 'node_property' | 'edge_property';
  targetDigest: string;
  entityId?: string;
  propertyKey?: string;
  from?: string;
  to?: string;
  label?: string;
  edgeKey?: string;
}

interface ConflictParticipant {
  anchor: ConflictAnchor;
  effectDigest: string;
  causalRelationToWinner?: ConflictCausalRelation;
  structurallyDistinctAlternative: boolean;
  replayableFromAnchors: boolean;
  notes?: string[];
}

interface ConflictResolution {
  reducerId: string;
  basis: { code: string; reason?: string };
  winnerMode: 'immediate' | 'eventual';
  comparator?: {
    type: 'event_id' | 'effect_digest';
    winnerEventId?: { lamport: number; writerId: string; patchSha: string; opIndex: number };
    loserEventId?: { lamport: number; writerId: string; patchSha: string; opIndex: number };
  };
}

interface ConflictTrace {
  conflictId: string;
  kind: ConflictKind;
  target: ConflictTarget;
  winner: {
    anchor: ConflictAnchor;
    effectDigest: string;
  };
  losers: ConflictParticipant[];
  resolution: ConflictResolution;
  whyFingerprint: string;
  classificationNotes?: string[];
  evidence: {
    level: ConflictEvidenceLevel;
    patchRefs: string[];
    receiptRefs: Array<{ patchSha: string; lamport: number; opIndex: number }>;
  };
}

interface ConflictDiagnostic {
  code: string;
  severity: 'warning' | 'error';
  message: string;
  data?: Record<string, unknown>;
}

interface ConflictAnalysis {
  analysisVersion: string;
  resolvedCoordinate: {
    analysisVersion: string;
    coordinateKind: 'frontier' | 'strand';
    frontier: Record<string, string>;
    frontierDigest: string;
    lamportCeiling: number | null;
    scanBudgetApplied: { maxPatches: number | null };
    truncationPolicy: string;
    strand?: {
      strandId: string;
      baseLamportCeiling: number | null;
      overlayHeadPatchSha: string | null;
      overlayPatchCount: number;
      overlayWritable: boolean;
      braid: {
        readOverlayCount: number;
        braidedStrandIds: string[];
      };
    };
  };
  analysisSnapshotHash: string;
  diagnostics?: ConflictDiagnostic[];
  conflicts: ConflictTrace[];
}

interface StrandCreateOptions {
  strandId?: string;
  lamportCeiling?: number | null;
  owner?: string | null;
  scope?: string | null;
  leaseExpiresAt?: string | null;
}

interface StrandBraidOptions {
  braidedStrandIds?: string[];
  writable?: boolean | null;
}

interface StrandReadOverlayDescriptor {
  strandId: string;
  overlayId: string;
  kind: string;
  headPatchSha: string | null;
  patchCount: number;
}

interface StrandIntentDescriptor {
  intentId: string;
  enqueuedAt: string;
  patch: Patch;
  reads: string[];
  writes: string[];
  contentBlobOids: string[];
}

interface StrandTickCounterfactual {
  intentId: string;
  reason: string;
  conflictsWith: string[];
  reads: string[];
  writes: string[];
}

interface StrandTickRecord {
  tickId: string;
  strandId: string;
  tickIndex: number;
  createdAt: string;
  drainedIntentCount: number;
  admittedIntentIds: string[];
  rejected: StrandTickCounterfactual[];
  baseOverlayHeadPatchSha: string | null;
  overlayHeadPatchSha: string | null;
  overlayPatchShas: string[];
}

interface StrandDescriptor {
  schemaVersion: number;
  strandId: string;
  graphName: string;
  createdAt: string;
  updatedAt: string;
  owner: string | null;
  scope: string | null;
  lease: {
    expiresAt: string | null;
  };
  baseObservation: {
    coordinateVersion: string;
    frontier: Record<string, string>;
    frontierDigest: string;
    lamportCeiling: number | null;
  };
  overlay: {
    overlayId: string;
    kind: string;
    headPatchSha: string | null;
    patchCount: number;
    writable: boolean;
  };
  braid: {
    readOverlays: StrandReadOverlayDescriptor[];
  };
  intentQueue?: {
    nextIntentSeq: number;
    intents: StrandIntentDescriptor[];
  };
  evolution?: {
    tickCount: number;
    lastTick: StrandTickRecord | null;
  };
  materialization: {
    cacheAuthority: 'derived';
  };
}

interface VisibleStateSummaryV5 {
  nodeCount: number;
  edgeCount: number;
  nodePropertyCount: number;
  edgePropertyCount: number;
}

interface VisibleStateComparisonV5 {
  comparisonVersion: string;
  changed: boolean;
  summary: {
    left: VisibleStateSummaryV5;
    right: VisibleStateSummaryV5;
    nodes: { added: number; removed: number };
    edges: { added: number; removed: number };
    nodeProperties: { added: number; removed: number; changed: number };
    edgeProperties: { added: number; removed: number; changed: number };
  };
  nodes: {
    added: string[];
    removed: string[];
  };
  edges: {
    added: Array<{ from: string; to: string; label: string }>;
    removed: Array<{ from: string; to: string; label: string }>;
  };
  nodeProperties: {
    added: Array<{ node: string; key: string; value: unknown }>;
    removed: Array<{ node: string; key: string; value: unknown }>;
    changed: Array<{ node: string; key: string; leftValue: unknown; rightValue: unknown }>;
  };
  edgeProperties: {
    added: Array<{ from: string; to: string; label: string; key: string; value: unknown }>;
    removed: Array<{ from: string; to: string; label: string; key: string; value: unknown }>;
    changed: Array<{ from: string; to: string; label: string; key: string; leftValue: unknown; rightValue: unknown }>;
  };
  target?: {
    targetId: string | null;
    leftExists: boolean;
    rightExists: boolean;
    changed: boolean;
    left: {
      nodeId: string;
      props: Record<string, unknown>;
      outgoing: Array<{ nodeId: string; label: string; direction: 'outgoing' | 'incoming' }>;
      incoming: Array<{ nodeId: string; label: string; direction: 'outgoing' | 'incoming' }>;
      content: ContentMeta | null;
    } | null;
    right: {
      nodeId: string;
      props: Record<string, unknown>;
      outgoing: Array<{ nodeId: string; label: string; direction: 'outgoing' | 'incoming' }>;
      incoming: Array<{ nodeId: string; label: string; direction: 'outgoing' | 'incoming' }>;
      content: ContentMeta | null;
    } | null;
    propertyDelta: {
      added: Array<{ key: string; value: unknown }>;
      removed: Array<{ key: string; value: unknown }>;
      changed: Array<{ key: string; leftValue: unknown; rightValue: unknown }>;
    };
    outgoingDelta: {
      added: Array<{ nodeId: string; label: string; direction: 'outgoing' | 'incoming' }>;
      removed: Array<{ nodeId: string; label: string; direction: 'outgoing' | 'incoming' }>;
    };
    incomingDelta: {
      added: Array<{ nodeId: string; label: string; direction: 'outgoing' | 'incoming' }>;
      removed: Array<{ nodeId: string; label: string; direction: 'outgoing' | 'incoming' }>;
    };
    contentChanged: boolean;
  };
}

interface VisibleStateScopePrefixFilterV1 {
  include?: string[];
  exclude?: string[];
}

interface VisibleStateScopeV1 {
  nodeIdPrefixes?: VisibleStateScopePrefixFilterV1;
}

type CoordinateComparisonSelectorV1 =
  | { kind: 'live'; ceiling?: number | null }
  | { kind: 'strand'; strandId: string; ceiling?: number | null }
  | { kind: 'strand_base'; strandId: string; ceiling?: number | null }
  | { kind: 'coordinate'; frontier: Map<string, string> | Record<string, string>; ceiling?: number | null };

type CoordinateTransferPlanSelectorV1 = CoordinateComparisonSelectorV1;

interface CoordinateComparisonSideV1 {
  requested: Record<string, unknown>;
  resolved: {
    coordinateKind: 'frontier' | 'strand' | 'strand_base';
    patchFrontier: Record<string, string>;
    patchFrontierDigest: string;
    lamportFrontier: Record<string, number>;
    lamportFrontierDigest: string;
    lamportCeiling: number | null;
    stateHash: string;
    patchUniverseDigest: string;
    summary: VisibleStateSummaryV5 & { patchCount: number };
    strand?: {
      strandId: string;
      baseLamportCeiling: number | null;
      overlayHeadPatchSha: string | null;
      overlayPatchCount: number;
      overlayWritable: boolean;
      braid: {
        readOverlayCount: number;
        braidedStrandIds: string[];
      };
    };
  };
}

interface CoordinateComparisonV1 {
  comparisonVersion: string;
  comparisonDigest: string;
  scope?: VisibleStateScopeV1;
  left: CoordinateComparisonSideV1;
  right: CoordinateComparisonSideV1;
  visiblePatchDivergence: {
    sharedCount: number;
    leftOnlyCount: number;
    rightOnlyCount: number;
    leftOnlyPatchShas: string[];
    rightOnlyPatchShas: string[];
    target?: {
      targetId: string;
      leftCount: number;
      rightCount: number;
      sharedCount: number;
      leftOnlyCount: number;
      rightOnlyCount: number;
      leftOnlyPatchShas: string[];
      rightOnlyPatchShas: string[];
    };
  };
  visibleState: VisibleStateComparisonV5;
}

interface VisibleStateTransferPlanSummaryV1 {
  opCount: number;
  addNodeCount: number;
  removeNodeCount: number;
  setNodePropertyCount: number;
  clearNodePropertyCount: number;
  addEdgeCount: number;
  removeEdgeCount: number;
  setEdgePropertyCount: number;
  clearEdgePropertyCount: number;
  attachNodeContentCount: number;
  clearNodeContentCount: number;
  attachEdgeContentCount: number;
  clearEdgeContentCount: number;
}

type VisibleStateTransferOperationV1 =
  | { op: 'add_node'; nodeId: string }
  | { op: 'remove_node'; nodeId: string }
  | { op: 'set_node_property'; nodeId: string; key: string; value: unknown }
  | { op: 'add_edge'; from: string; to: string; label: string }
  | { op: 'remove_edge'; from: string; to: string; label: string }
  | { op: 'set_edge_property'; from: string; to: string; label: string; key: string; value: unknown }
  | { op: 'attach_node_content'; nodeId: string; content: Uint8Array; contentOid: string; mime?: string | null; size?: number | null }
  | { op: 'clear_node_content'; nodeId: string }
  | { op: 'attach_edge_content'; from: string; to: string; label: string; content: Uint8Array; contentOid: string; mime?: string | null; size?: number | null }
  | { op: 'clear_edge_content'; from: string; to: string; label: string };

type CoordinateTransferPlanSideV1 = CoordinateComparisonSideV1;

interface CoordinateTransferPlanV1 {
  transferVersion: string;
  transferDigest: string;
  comparisonDigest: string;
  scope?: VisibleStateScopeV1;
  changed: boolean;
  source: CoordinateTransferPlanSideV1;
  target: CoordinateTransferPlanSideV1;
  summary: VisibleStateTransferPlanSummaryV1;
  ops: VisibleStateTransferOperationV1[];
}

export {};

declare module '../WarpRuntime.js' {
  export default interface WarpRuntime {
    // ── query.methods.js ──────────────────────────────────────────────────
    hasNode(nodeId: string): Promise<boolean>;
    getNodeProps(nodeId: string): Promise<Record<string, unknown> | null>;
    getEdgeProps(from: string, to: string, label: string): Promise<Record<string, unknown> | null>;
    getContentMeta(nodeId: string): Promise<ContentMeta | null>;
    getEdgeContentMeta(from: string, to: string, label: string): Promise<ContentMeta | null>;
    neighbors(nodeId: string, direction?: 'outgoing' | 'incoming' | 'both', edgeLabel?: string): Promise<Array<{ nodeId: string; label: string; direction: 'outgoing' | 'incoming' }>>;
    getStateSnapshot(): Promise<WarpState | null>;
    getNodes(): Promise<string[]>;
    getEdges(): Promise<Array<{ from: string; to: string; label: string; props: Record<string, unknown> }>>;
    getPropertyCount(): Promise<number>;
    query(): import('../services/QueryBuilder.js').default;
    worldline(options?: import('../../../index.js').WorldlineOptions): import('../services/Worldline.js').default;
    observer(nameOrConfig: string | ObserverConfig, configOrOptions?: ObserverConfig | import('../../../index.js').ObserverOptions, options?: import('../../../index.js').ObserverOptions): Promise<import('../services/Observer.js').default>;
    translationCost(configA: ObserverConfig, configB: ObserverConfig): Promise<TranslationCostResult>;

    // ── subscribe.methods.js ──────────────────────────────────────────────
    subscribe(options: { onChange: (diff: StateDiffResult) => void; onError?: (error: unknown) => void; replay?: boolean }): { unsubscribe: () => void };
    watch(pattern: string | string[], options: { onChange: (diff: StateDiffResult) => void; onError?: (error: unknown) => void; poll?: number }): { unsubscribe: () => void };
    _notifySubscribers(diff: StateDiffResult, currentState: WarpState): void;

    // ── provenance.methods.js ─────────────────────────────────────────────
    patchesFor(entityId: string): Promise<string[]>;
    materializeSlice(nodeId: string, options?: { receipts?: boolean }): Promise<{ state: WarpState; patchCount: number; receipts?: TickReceipt[] }>;
    _computeBackwardCone(nodeId: string): Promise<Map<string, Patch>>;
    loadPatchBySha(sha: string): Promise<Patch>;
    _loadPatchBySha(sha: string): Promise<Patch>;
    _loadPatchesBySha(shas: string[]): Promise<Array<{ patch: Patch; sha: string }>>;
    _sortPatchesCausally(patches: Array<{ patch: Patch; sha: string }>): Array<{ patch: Patch; sha: string }>;
    analyzeConflicts(options?: {
      at?: { lamportCeiling?: number | null };
      strandId?: string;
      entityId?: string;
      target?: ConflictTargetSelector;
      kind?: ConflictKind | ConflictKind[];
      writerId?: string;
      evidence?: ConflictEvidenceLevel;
      scanBudget?: { maxPatches?: number };
    }): Promise<ConflictAnalysis>;

    // ── fork.methods.js ───────────────────────────────────────────────────
    fork(options: { from: string; at: string; forkName?: string; forkWriterId?: string }): Promise<WarpRuntime>;
    createWormhole(fromSha: string, toSha: string): Promise<WormholeEdge>;
    _isAncestor(ancestorSha: string, descendantSha: string): Promise<boolean>;
    _relationToCheckpointHead(ckHead: string, incomingSha: string): Promise<string>;
    _validatePatchAgainstCheckpoint(writerId: string, incomingSha: string, checkpoint: unknown): Promise<void>;

    // ── SyncController (direct delegation) ─────────────────────────────────
    getFrontier(): Promise<Map<string, string>>;
    hasFrontierChanged(): Promise<boolean>;
    status(): Promise<WarpStatus>;
    createSyncRequest(): Promise<SyncRequest>;
    processSyncRequest(request: SyncRequest): Promise<SyncResponse>;
    applySyncResponse(response: SyncResponse): ApplySyncResult;
    syncNeeded(remoteFrontier: Map<string, string>): Promise<boolean>;
    syncWith(remote: string | WarpRuntime, options?: SyncWithOptions): Promise<{ applied: number; attempts: number; state?: WarpState }>;
    serve(options: {
      port: number;
      host?: string;
      path?: string;
      maxRequestBytes?: number;
      httpPort: unknown;
      auth?: unknown;
      allowedWriters?: string[];
    }): Promise<{ close(): Promise<void>; url: string }>;

    // ── CheckpointController ──────────────────────────────────────────────
    createCheckpoint(): Promise<string>;
    syncCoverage(): Promise<void>;
    _loadLatestCheckpoint(): Promise<CheckpointData | null>;
    _loadPatchesSince(checkpoint: CheckpointData): Promise<Array<{ patch: Patch; sha: string }>>;
    _validateMigrationBoundary(): Promise<void>;
    _hasSchema1Patches(): Promise<boolean>;
    _maybeRunGC(state: WarpState): void;
    maybeRunGC(): MaybeGCResult;
    runGC(): GCExecuteResult;
    getGCMetrics(): GCMetrics | null;

    // ── PatchController ──────────────────────────────────────────────────
    createPatch(): Promise<PatchBuilder>;
    patch(build: (p: PatchBuilder) => void | Promise<void>): Promise<string>;
    patchMany(...builds: Array<(p: PatchBuilder) => void | Promise<void>>): Promise<string[]>;
    _nextLamport(): Promise<{ lamport: number; parentSha: string | null }>;
    _loadPatchChainFromSha(tipSha: string, stopAtSha?: string | null): Promise<Array<{ patch: Patch; sha: string }>>;
    _loadWriterPatches(writerId: string, stopAtSha?: string | null): Promise<Array<{ patch: Patch; sha: string }>>;
    getWriterPatches(writerId: string, stopAtSha?: string | null): Promise<Array<{ patch: Patch; sha: string }>>;
    _onPatchCommitted(writerId: string, opts?: { patch?: Patch; sha?: string }): Promise<void>;
    writer(writerId?: string): Promise<Writer>;
    _ensureFreshState(): Promise<void>;
    discoverWriters(): Promise<string[]>;
    discoverTicks(): Promise<{ ticks: number[]; maxTick: number; perWriter: Map<string, { ticks: number[]; tipSha: string | null; tickShas: Record<number, string> }> }>;
    join(otherState: WarpState): { state: WarpState; receipt: JoinReceipt };
    _frontierEquals(a: import('../crdt/VersionVector.ts').default, b: import('../crdt/VersionVector.ts').default): boolean;

    // ── MaterializeController ─────────────────────────────────────────────
    materialize(options: { receipts: true; ceiling?: number | null }): Promise<{ state: WarpState; receipts: TickReceipt[] }>;
    materialize(options?: { receipts?: false; ceiling?: number | null }): Promise<WarpState>;
    _materializeGraph(): Promise<{ state: WarpState; stateHash: string; adjacency: unknown }>;

    // ── MaterializeController (advanced) ──────────────────────────────────
    _resolveCeiling(options?: { ceiling?: number | null }): number | null;
    _buildAdjacency(state: WarpState): { outgoing: Map<string, Array<{ neighborId: string; label: string }>>; incoming: Map<string, Array<{ neighborId: string; label: string }>> };
    _buildView(state: WarpState, stateHash: string, diff?: import('../types/PatchDiff.js').PatchDiff): void;
    _setMaterializedState(state: WarpState, optionsOrDiff?: import('../types/PatchDiff.js').PatchDiff | { diff?: import('../types/PatchDiff.js').PatchDiff | null }): Promise<{ state: WarpState; stateHash: string; adjacency: unknown }>;
    materializeCoordinate(options: { frontier: Map<string, string> | Record<string, string>; ceiling?: number | null; receipts: true }): Promise<{ state: WarpState; receipts: TickReceipt[] }>;
    materializeCoordinate(options: { frontier: Map<string, string> | Record<string, string>; ceiling?: number | null; receipts?: false }): Promise<WarpState>;
    _materializeWithCeiling(ceiling: number, collectReceipts: boolean, t0: number): Promise<WarpState | { state: WarpState; receipts: TickReceipt[] }>;
    _materializeWithCoordinate(frontier: Map<string, string>, ceiling: number | null, collectReceipts: boolean, t0: number): Promise<WarpState | { state: WarpState; receipts: TickReceipt[] }>;
    _persistSeekCacheEntry(cacheKey: string, buf: Uint8Array, state: WarpState): Promise<void>;
    _restoreIndexFromCache(indexTreeOid: string): Promise<void>;
    materializeAt(checkpointSha: string): Promise<WarpState>;
    verifyIndex(options?: { seed?: number; sampleRate?: number }): { passed: number; failed: number; errors: Array<{ nodeId: string; direction: string; expected: string[]; actual: string[] }> };
    invalidateIndex(): void;

    // ── strand.methods.js ─────────────────────────────────────────────
    createStrand(options?: StrandCreateOptions): Promise<StrandDescriptor>;
    braidStrand(strandId: string, options?: StrandBraidOptions): Promise<StrandDescriptor>;
    getStrand(strandId: string): Promise<StrandDescriptor | null>;
    listStrands(): Promise<StrandDescriptor[]>;
    dropStrand(strandId: string): Promise<boolean>;
    materializeStrand(strandId: string, options: { receipts: true; ceiling?: number | null }): Promise<{ state: WarpState; receipts: TickReceipt[] }>;
    materializeStrand(strandId: string, options?: { receipts?: false; ceiling?: number | null }): Promise<WarpState>;
    getStrandPatches(strandId: string, options?: { ceiling?: number | null }): Promise<Array<{ patch: Patch; sha: string }>>;
    patchesForStrand(strandId: string, entityId: string, options?: { ceiling?: number | null }): Promise<string[]>;
    createStrandPatch(strandId: string): Promise<PatchBuilder>;
    patchStrand(strandId: string, build: (p: PatchBuilder) => void | Promise<void>): Promise<string>;
    queueStrandIntent(strandId: string, build: (p: PatchBuilder) => void | Promise<void>): Promise<StrandIntentDescriptor>;
    listStrandIntents(strandId: string): Promise<StrandIntentDescriptor[]>;
    tickStrand(strandId: string): Promise<StrandTickRecord>;
    compareStrand(strandId: string, options?: {
      against?: 'base' | 'live' | { kind: 'strand'; strandId: string };
      ceiling?: number | null;
      againstCeiling?: number | null;
      targetId?: string | null;
      scope?: VisibleStateScopeV1 | null;
    }): Promise<CoordinateComparisonV1>;
    planStrandTransfer(strandId: string, options?: {
      into?: 'base' | 'live' | { kind: 'strand'; strandId: string };
      ceiling?: number | null;
      intoCeiling?: number | null;
      scope?: VisibleStateScopeV1 | null;
    }): Promise<CoordinateTransferPlanV1>;
    compareCoordinates(options: {
      left: CoordinateComparisonSelectorV1;
      right: CoordinateComparisonSelectorV1;
      targetId?: string | null;
      scope?: VisibleStateScopeV1 | null;
    }): Promise<CoordinateComparisonV1>;
    planCoordinateTransfer(options: {
      source: CoordinateTransferPlanSelectorV1;
      target: CoordinateTransferPlanSelectorV1;
      scope?: VisibleStateScopeV1 | null;
    }): Promise<CoordinateTransferPlanV1>;
  }
}
