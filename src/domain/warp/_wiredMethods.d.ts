/**
 * TypeScript augmentation for WarpGraph wired methods.
 *
 * Methods in *.methods.js are wired onto WarpGraph.prototype at runtime
 * via wireWarpMethods(). This declaration file makes them visible to tsc.
 */

import type { PatchBuilderV2 } from '../services/PatchBuilderV2.js';
import type { Writer } from './Writer.js';
import type { WarpStateV5 } from '../services/JoinReducer.js';
import type { PatchV2 } from '../types/WarpTypesV2.js';
import type { StateDiffResult } from '../services/StateDiff.js';
import type { TickReceipt } from '../types/TickReceipt.js';

/**
 * Observer configuration for view creation and translation cost.
 */
interface ObserverConfig {
  match: string;
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

/**
 * Lightweight status snapshot.
 */
interface WarpGraphStatus {
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
  state: WarpStateV5;
  frontier: Map<string, number>;
  applied: number;
}

/**
 * Sync options for syncWith().
 */
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
  state: WarpStateV5;
  frontier: Map<string, string>;
  stateHash: string;
  schema: number;
  provenanceIndex?: unknown;
}

export {};

declare module '../WarpGraph.js' {
  export default interface WarpGraph {
    // ── query.methods.js ──────────────────────────────────────────────────
    hasNode(nodeId: string): Promise<boolean>;
    getNodeProps(nodeId: string): Promise<Map<string, unknown> | null>;
    getEdgeProps(from: string, to: string, label: string): Promise<Record<string, unknown> | null>;
    neighbors(nodeId: string, direction?: 'outgoing' | 'incoming' | 'both', edgeLabel?: string): Promise<Array<{ nodeId: string; label: string; direction: 'outgoing' | 'incoming' }>>;
    getStateSnapshot(): Promise<WarpStateV5 | null>;
    getNodes(): Promise<string[]>;
    getEdges(): Promise<Array<{ from: string; to: string; label: string; props: Record<string, unknown> }>>;
    getPropertyCount(): Promise<number>;
    query(): import('../services/QueryBuilder.js').default;
    observer(name: string, config: ObserverConfig): Promise<import('../services/ObserverView.js').default>;
    translationCost(configA: ObserverConfig, configB: ObserverConfig): Promise<TranslationCostResult>;

    // ── subscribe.methods.js ──────────────────────────────────────────────
    subscribe(options: { onChange: (diff: StateDiffResult) => void; onError?: (error: Error) => void; replay?: boolean }): { unsubscribe: () => void };
    watch(pattern: string, options: { onChange: (diff: StateDiffResult) => void; onError?: (error: Error) => void; poll?: number }): { unsubscribe: () => void };
    _notifySubscribers(diff: StateDiffResult, currentState: WarpStateV5): void;

    // ── provenance.methods.js ─────────────────────────────────────────────
    patchesFor(entityId: string): Promise<string[]>;
    materializeSlice(nodeId: string, options?: { receipts?: boolean }): Promise<{ state: WarpStateV5; patchCount: number; receipts?: TickReceipt[] }>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- internal method; `any` avoids breaking provenance.methods.js callers
    _computeBackwardCone(nodeId: string): Promise<Map<string, any>>;
    loadPatchBySha(sha: string): Promise<{ patch: PatchV2; sha: string }>;
    _loadPatchBySha(sha: string): Promise<{ patch: PatchV2; sha: string }>;
    _loadPatchesBySha(shas: string[]): Promise<Array<{ patch: PatchV2; sha: string }>>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- internal method; `any` avoids breaking provenance.methods.js callers
    _sortPatchesCausally(patches: Array<{ patch: any; sha: string }>): Array<{ patch: any; sha: string }>;

    // ── fork.methods.js ───────────────────────────────────────────────────
    fork(options: { from: string; at: string; forkName?: string; forkWriterId?: string }): Promise<WarpGraph>;
    createWormhole(fromSha: string, toSha: string): Promise<WormholeEdge>;
    _isAncestor(ancestorSha: string, descendantSha: string): Promise<boolean>;
    _relationToCheckpointHead(ckHead: string, incomingSha: string): Promise<string>;
    _validatePatchAgainstCheckpoint(writerId: string, incomingSha: string, checkpoint: unknown): Promise<void>;

    // ── SyncController (direct delegation) ─────────────────────────────────
    getFrontier(): Promise<Map<string, string>>;
    hasFrontierChanged(): Promise<boolean>;
    status(): Promise<WarpGraphStatus>;
    createSyncRequest(): Promise<SyncRequest>;
    processSyncRequest(request: SyncRequest): Promise<SyncResponse>;
    applySyncResponse(response: SyncResponse): ApplySyncResult;
    syncNeeded(remoteFrontier: Map<string, string>): Promise<boolean>;
    syncWith(remote: string | WarpGraph, options?: SyncWithOptions): Promise<{ applied: number; attempts: number; state?: WarpStateV5 }>;
    serve(options: {
      port: number;
      host?: string;
      path?: string;
      maxRequestBytes?: number;
      httpPort: unknown;
      auth?: unknown;
      allowedWriters?: string[];
    }): Promise<{ close(): Promise<void>; url: string }>;

    // ── checkpoint.methods.js ─────────────────────────────────────────────
    createCheckpoint(): Promise<string>;
    syncCoverage(): Promise<void>;
    _loadLatestCheckpoint(): Promise<CheckpointData | null>;
    _loadPatchesSince(checkpoint: CheckpointData): Promise<Array<{ patch: PatchV2; sha: string }>>;
    _validateMigrationBoundary(): Promise<void>;
    _hasSchema1Patches(): Promise<boolean>;
    _maybeRunGC(state: WarpStateV5): void;
    maybeRunGC(): MaybeGCResult;
    runGC(): GCExecuteResult;
    getGCMetrics(): GCMetrics | null;

    // ── patch.methods.js ──────────────────────────────────────────────────
    createPatch(): Promise<PatchBuilderV2>;
    patch(build: (p: PatchBuilderV2) => void | Promise<void>): Promise<string>;
    _nextLamport(): Promise<{ lamport: number; parentSha: string | null }>;
    _loadWriterPatches(writerId: string, stopAtSha?: string | null): Promise<Array<{ patch: PatchV2; sha: string }>>;
    getWriterPatches(writerId: string, stopAtSha?: string | null): Promise<Array<{ patch: PatchV2; sha: string }>>;
    _onPatchCommitted(writerId: string, opts?: { patch?: PatchV2; sha?: string }): Promise<void>;
    writer(writerId?: string): Promise<Writer>;
    createWriter(opts?: { persist?: 'config' | 'none'; alias?: string }): Promise<Writer>;
    _ensureFreshState(): Promise<void>;
    discoverWriters(): Promise<string[]>;
    discoverTicks(): Promise<{ ticks: number[]; maxTick: number; perWriter: Map<string, { ticks: number[]; tipSha: string | null; tickShas: Record<number, string> }> }>;
    join(otherState: WarpStateV5): { state: WarpStateV5; receipt: JoinReceipt };
    _frontierEquals(a: Map<string, number>, b: Map<string, number>): boolean;

    // ── materialize.methods.js ────────────────────────────────────────────
    materialize(options: { receipts: true; ceiling?: number | null }): Promise<{ state: WarpStateV5; receipts: TickReceipt[] }>;
    materialize(options?: { receipts?: false; ceiling?: number | null }): Promise<WarpStateV5>;
    _materializeGraph(): Promise<{ state: WarpStateV5; stateHash: string; adjacency: unknown }>;

    // ── materializeAdvanced.methods.js ────────────────────────────────────
    _resolveCeiling(options?: { ceiling?: number | null }): number | null;
    _buildAdjacency(state: WarpStateV5): { outgoing: Map<string, Array<{ neighborId: string; label: string }>>; incoming: Map<string, Array<{ neighborId: string; label: string }>> };
    _setMaterializedState(state: WarpStateV5): Promise<{ state: WarpStateV5; stateHash: string; adjacency: unknown }>;
    _materializeWithCeiling(ceiling: number, collectReceipts: boolean, t0: number): Promise<WarpStateV5 | { state: WarpStateV5; receipts: TickReceipt[] }>;
    materializeAt(checkpointSha: string): Promise<WarpStateV5>;
  }
}
