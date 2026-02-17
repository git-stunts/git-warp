/**
 * TypeScript augmentation for WarpGraph wired methods.
 *
 * Methods in *.methods.js are wired onto WarpGraph.prototype at runtime
 * via wireWarpMethods(). This declaration file makes them visible to tsc.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { PatchBuilderV2 } from '../services/PatchBuilderV2.js';
import type { Writer } from './Writer.js';

export {};

declare module '../WarpGraph.js' {
  export default interface WarpGraph {
    // ── query.methods.js ──────────────────────────────────────────────────
    hasNode(nodeId: string): Promise<boolean>;
    getNodeProps(nodeId: string): Promise<Map<string, any> | null>;
    getEdgeProps(from: string, to: string, label: string): Promise<Record<string, any> | null>;
    neighbors(nodeId: string, direction?: 'outgoing' | 'incoming' | 'both', edgeLabel?: string): Promise<Array<{ nodeId: string; label: string; direction: 'outgoing' | 'incoming' }>>;
    getStateSnapshot(): Promise<any>;
    getNodes(): Promise<string[]>;
    getEdges(): Promise<Array<{ from: string; to: string; label: string; props: Record<string, any> }>>;
    getPropertyCount(): Promise<number>;
    query(): any;
    observer(name: string, config: any): Promise<any>;
    translationCost(configA: any, configB: any): Promise<{ cost: number; breakdown: { nodeLoss: number; edgeLoss: number; propLoss: number } }>;

    // ── subscribe.methods.js ──────────────────────────────────────────────
    subscribe(options: { onChange: Function; onError?: Function; replay?: boolean }): { unsubscribe: () => void };
    watch(pattern: string, options: { onChange: Function; onError?: Function; poll?: number }): { unsubscribe: () => void };
    _notifySubscribers(diff: any, currentState: any): void;

    // ── provenance.methods.js ─────────────────────────────────────────────
    patchesFor(entityId: string): Promise<string[]>;
    materializeSlice(nodeId: string, options?: any): Promise<any>;
    _computeBackwardCone(nodeId: string): Promise<Map<string, any>>;
    loadPatchBySha(sha: string): Promise<any>;
    _loadPatchBySha(sha: string): Promise<any>;
    _loadPatchesBySha(shas: string[]): Promise<Array<{ patch: any; sha: string }>>;
    _sortPatchesCausally(patches: any[]): any[];

    // ── fork.methods.js ───────────────────────────────────────────────────
    fork(options: { from: string; at: string; forkName?: string; forkWriterId?: string }): Promise<WarpGraph>;
    createWormhole(fromSha: string, toSha: string): Promise<{ fromSha: string; toSha: string; writerId: string; payload: any; patchCount: number }>;
    _isAncestor(ancestorSha: string, descendantSha: string): Promise<boolean>;
    _relationToCheckpointHead(ckHead: string, incomingSha: string): Promise<string>;
    _validatePatchAgainstCheckpoint(writerId: string, incomingSha: string, checkpoint: any): Promise<void>;

    // ── sync.methods.js ───────────────────────────────────────────────────
    getFrontier(): Promise<Map<string, string>>;
    hasFrontierChanged(): Promise<boolean>;
    status(): Promise<any>;
    createSyncRequest(): Promise<any>;
    processSyncRequest(request: any): Promise<any>;
    applySyncResponse(response: any): any;
    syncNeeded(remoteFrontier: any): Promise<boolean>;
    syncWith(remote: any, options?: any): Promise<any>;
    serve(options?: any): Promise<any>;

    // ── checkpoint.methods.js ─────────────────────────────────────────────
    createCheckpoint(): Promise<string>;
    syncCoverage(): Promise<void>;
    _loadLatestCheckpoint(): Promise<any>;
    _loadPatchesSince(checkpoint: any): Promise<any[]>;
    _validateMigrationBoundary(): Promise<void>;
    _hasSchema1Patches(): Promise<boolean>;
    _maybeRunGC(state: any): any;
    maybeRunGC(): any;
    runGC(): any;
    getGCMetrics(): any;

    // ── patch.methods.js ──────────────────────────────────────────────────
    createPatch(): Promise<PatchBuilderV2>;
    patch(build: (p: PatchBuilderV2) => void | Promise<void>): Promise<string>;
    _nextLamport(): Promise<{ lamport: number; parentSha: string | null }>;
    _loadWriterPatches(writerId: string, stopAtSha?: string | null): Promise<Array<{ patch: import('../types/WarpTypesV2.js').PatchV2; sha: string }>>;
    getWriterPatches(writerId: string, stopAtSha?: string | null): Promise<Array<{ patch: import('../types/WarpTypesV2.js').PatchV2; sha: string }>>;
    _onPatchCommitted(writerId: string, opts?: { patch?: any; sha?: string }): Promise<void>;
    writer(writerId?: string): Promise<Writer>;
    createWriter(opts?: any): Promise<Writer>;
    _ensureFreshState(): Promise<void>;
    discoverWriters(): Promise<string[]>;
    discoverTicks(): Promise<{ ticks: number[]; maxTick: number; perWriter: Map<string, { ticks: number[]; tipSha: string | null; tickShas: Record<number, string> }> }>;
    join(otherState: any): any;
    _frontierEquals(a: any, b: any): boolean;

    // ── materialize.methods.js ────────────────────────────────────────────
    materialize(options?: any): Promise<any>;
    _materializeGraph(): Promise<any>;

    // ── materializeAdvanced.methods.js ────────────────────────────────────
    _resolveCeiling(options: any): any;
    _buildAdjacency(state: any): any;
    _setMaterializedState(state: any): Promise<{ state: any; stateHash: string; adjacency: any }>;
    _materializeWithCeiling(ceiling: any, collectReceipts: boolean, t0: number): Promise<any>;
    materializeAt(checkpointSha: string): Promise<any>;
  }
}
