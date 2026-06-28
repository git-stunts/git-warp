/**
 * WarpGraph — the public API surface for git-warp.
 *
 * WARP is a recursive, witnessed admission architecture over bounded
 * frontier-relative causal sites. The admission kernel recurs at three
 * scales: local tick admission, braid-local admission, and distributed
 * suffix admission. The stack decomposes into three moments:
 *
 *   Commitment — plural claims are admitted into frontier-relative truth
 *   Folding    — admitted history is re-expressed in boundary-equivalent form
 *   Revelation — admitted history is exposed under bounded rights
 *
 * `openWarpGraph()` is the advanced composition root. It accepts the governing
 * policy, witness infrastructure, and revelation regime as typed ports,
 * wires controllers, and returns a frozen capability bag organized by
 * architectural moment.
 */
import WarpError from './errors/WarpError.ts';
import { openWarpGraphRuntime, type WarpGraphRuntimeSurface } from './warp/WarpGraphRuntimeBridge.ts';
import type QueryCapability from './capabilities/QueryCapability.ts';
import type PatchCapability from './capabilities/PatchCapability.ts';
import type SyncCapability from './capabilities/SyncCapability.ts';
import type { SyncRemote, SyncWithOptions } from './capabilities/SyncCapability.ts';
import type StrandCapability from './capabilities/StrandCapability.ts';
import type IntentCapability from './capabilities/IntentCapability.ts';
import type CheckpointCapability from './capabilities/CheckpointCapability.ts';
import type ProvenanceCapability from './capabilities/ProvenanceCapability.ts';
import type ComparisonCapability from './capabilities/ComparisonCapability.ts';
import type SubscriptionCapability from './capabilities/SubscriptionCapability.ts';
import type { CorePersistence } from './types/WarpPersistence.ts';
import type LoggerPort from '../ports/LoggerPort.ts';
import type CryptoPort from '../ports/CryptoPort.ts';
import type CodecPort from '../ports/CodecPort.ts';
import type SeekCachePort from '../ports/SeekCachePort.ts';
import type BlobStoragePort from '../ports/BlobStoragePort.ts';
import type PatchJournalPort from '../ports/PatchJournalPort.ts';
import type CheckpointStorePort from '../ports/CheckpointStorePort.ts';
import type IndexStorePort from '../ports/IndexStorePort.ts';
import type EffectSinkPort from '../ports/EffectSinkPort.ts';
import type { EffectPipeline } from './services/EffectPipeline.ts';
import type { ExternalizationPolicy } from './types/ExternalizationPolicy.ts';
import type { GCPolicyConfig } from './services/GCPolicy.ts';

// ---------------------------------------------------------------------------
// WarpGraph — frozen capability bag, organized by architectural moment
// ---------------------------------------------------------------------------

/**
 * Commitment capabilities — admitting claims into frontier-relative truth.
 *
 * Local tick admission (patches), speculative lane management (strands),
 * and braid presentation for comparison and transfer planning.
 */
export interface CommitmentSurface {
  /** Local tick admission: create patches, commit CRDT state. */
  readonly patches: PatchCapability;
  /** Speculative lanes: fork, collapse, braid. */
  readonly strands: StrandCapability;
  /** Unmaterialized intents: declarative machine work admission. */
  readonly intents: IntentCapability;
  /** Braid presentation: compare coordinates, plan transfers. */
  readonly comparison: ComparisonCapability;
}

/**
 * Folding capabilities — re-expressing admitted history as explicit
 * operational artifacts.
 */
export interface FoldingSurface {
  /** History folding: create/restore checkpoints. */
  readonly checkpoint: CheckpointCapability;
}

/**
 * Revelation capabilities — bounded observer access to admitted truth.
 *
 * Queries, reactive subscriptions, and provenance witness access.
 */
export interface RevelationSurface {
  /** Bounded observer reads: nodes, edges, content, worldlines, observers. */
  readonly query: QueryCapability;
  /** Reactive revelation: subscribe to state changes. */
  readonly subscriptions: SubscriptionCapability;
  /** Witness access: provenance, audit, boundary transition records. */
  readonly provenance: ProvenanceCapability;
}

/**
 * Governance capabilities — distributed suffix admission and transport.
 */
export interface GovernanceSurface {
  /** Distributed suffix admission: sync, serve, transport. */
  readonly sync: SyncCapability;
}

/** The public API surface returned by openWarpGraph(). */
export interface WarpGraph {
  readonly graphName: string;
  readonly writerId: string;

  // Architectural moments
  readonly commitment: CommitmentSurface;
  readonly folding: FoldingSurface;
  readonly revelation: RevelationSurface;
  readonly governance: GovernanceSurface;

  // Flat aliases for ergonomic access (commitment.patches vs graph.patches)
  readonly query: QueryCapability;
  readonly patches: PatchCapability;
  readonly sync: SyncCapability;
  readonly strands: StrandCapability;
  readonly intents: IntentCapability;
  readonly checkpoint: CheckpointCapability;
  readonly provenance: ProvenanceCapability;
  readonly comparison: ComparisonCapability;
  readonly subscriptions: SubscriptionCapability;
}

// ---------------------------------------------------------------------------
// WarpGraphDeps — the composition root's dependency contract
// ---------------------------------------------------------------------------

type TrustMode = 'off' | 'log-only' | 'enforce';

/**
 * Dependencies for openWarpGraph().
 *
 * The composition root accepts:
 * - persistence substrate (GraphPersistencePort)
 * - identity (graphName, writerId)
 * - governing policy (trust, GC, checkpoint, onDeleteWithData)
 * - witness infrastructure (crypto, codec, audit)
 * - revelation regime (logger, effectSinks, externalizationPolicy)
 * - optional accelerators (seekCache, blobStorage, indexStore)
 */
export interface WarpGraphDeps {
  // Substrate
  readonly persistence: CorePersistence;

  // Identity
  readonly graphName: string;
  readonly writerId: string;

  // Governing policy
  readonly trust?: { mode?: TrustMode; pin?: string | null };
  readonly gcPolicy?: GCPolicyConfig;
  readonly checkpointPolicy?: { every: number };
  readonly onDeleteWithData?: 'reject' | 'cascade' | 'warn';
  readonly autoMaterialize?: boolean;

  // Witness infrastructure
  readonly crypto?: CryptoPort;
  readonly codec?: CodecPort;
  readonly audit?: boolean;

  // Revelation regime
  readonly logger?: LoggerPort;
  readonly effectPipeline?: EffectPipeline;
  readonly effectSinks?: EffectSinkPort[];
  readonly externalizationPolicy?: ExternalizationPolicy;

  // Accelerators (optional — auto-constructed if absent)
  readonly seekCache?: SeekCachePort;
  readonly blobStorage?: BlobStoragePort;
  readonly patchBlobStorage?: BlobStoragePort;
  readonly patchJournal?: PatchJournalPort | null;
  readonly checkpointStore?: CheckpointStorePort | null;
  readonly indexStore?: IndexStorePort | null;
  readonly adjacencyCacheSize?: number;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

type SyncCapabilitySurface = Pick<
  SyncCapability,
  'getFrontier' |
  'hasFrontierChanged' |
  'status' |
  'createSyncRequest' |
  'processSyncRequest' |
  'applySyncResponse' |
  'syncNeeded' |
  'syncWith' |
  'serve'
>;

function requireCapabilityMethod(owner: object, capabilityName: string, methodName: string): void {
  if (typeof Reflect.get(owner, methodName) === 'function') {
    return;
  }
  throw new WarpError(
    `${capabilityName} is missing required method: ${methodName}()`,
    `E_WARPGRAPH_${capabilityName.toUpperCase()}_MISSING_METHOD`,
  );
}

function requireCapability(owner: object, capabilityName: string, methodNames: readonly string[]): void {
  for (const methodName of methodNames) {
    requireCapabilityMethod(owner, capabilityName, methodName);
  }
}

function bindQueryCapability(runtime: WarpGraphRuntimeSurface): QueryCapability {
  requireCapability(runtime, 'query', [
    'hasNode', 'getNodeProps', 'getEdgeProps', 'neighbors',
    'getStateSnapshot', 'getNodes', 'getEdges', 'getPropertyCount',
    'query', 'worldline', 'observer', 'translationCost',
    'getContentOid', 'getContentMeta', 'getContent',
    'getEdgeContentOid', 'getEdgeContentMeta', 'getEdgeContent',
    'getContentStream', 'getEdgeContentStream',
  ]);
  return Object.freeze({
    hasNode: runtime.hasNode.bind(runtime),
    getNodeProps: runtime.getNodeProps.bind(runtime),
    getEdgeProps: runtime.getEdgeProps.bind(runtime),
    neighbors: runtime.neighbors.bind(runtime),
    getStateSnapshot: runtime.getStateSnapshot.bind(runtime),
    getNodes: runtime.getNodes.bind(runtime),
    getEdges: runtime.getEdges.bind(runtime),
    getPropertyCount: runtime.getPropertyCount.bind(runtime),
    query: runtime.query.bind(runtime),
    worldline: runtime.worldline.bind(runtime),
    observer: runtime.observer.bind(runtime),
    translationCost: runtime.translationCost.bind(runtime),
    getContentOid: runtime.getContentOid.bind(runtime),
    getContentMeta: runtime.getContentMeta.bind(runtime),
    getContent: runtime.getContent.bind(runtime),
    getEdgeContentOid: runtime.getEdgeContentOid.bind(runtime),
    getEdgeContentMeta: runtime.getEdgeContentMeta.bind(runtime),
    getEdgeContent: runtime.getEdgeContent.bind(runtime),
    getContentStream: runtime.getContentStream.bind(runtime),
    getEdgeContentStream: runtime.getEdgeContentStream.bind(runtime),
  });
}

function bindPatchCapability(runtime: WarpGraphRuntimeSurface): PatchCapability {
  requireCapability(runtime, 'patch', [
    'createPatch', 'patch', 'patchMany', 'getWriterPatches',
    'writer', 'discoverWriters', 'discoverTicks', 'join',
  ]);
  return Object.freeze({
    createPatch: runtime.createPatch.bind(runtime),
    patch: runtime.patch.bind(runtime),
    patchMany: runtime.patchMany.bind(runtime),
    getWriterPatches: runtime.getWriterPatches.bind(runtime),
    writer: runtime.writer.bind(runtime),
    discoverWriters: runtime.discoverWriters.bind(runtime),
    discoverTicks: runtime.discoverTicks.bind(runtime),
    join: runtime.join.bind(runtime),
  });
}

function bindSyncCapability(runtime: WarpGraphRuntimeSurface): SyncCapability {
  const syncSurface: SyncCapabilitySurface = runtime;
  requireCapability(runtime, 'sync', [
    'getFrontier', 'hasFrontierChanged', 'status', 'createSyncRequest',
    'processSyncRequest', 'applySyncResponse', 'syncNeeded',
    'syncWith', 'serve',
  ]);
  return Object.freeze({
    getFrontier: syncSurface.getFrontier.bind(runtime),
    hasFrontierChanged: syncSurface.hasFrontierChanged.bind(runtime),
    status: syncSurface.status.bind(runtime),
    createSyncRequest: syncSurface.createSyncRequest.bind(runtime),
    processSyncRequest: syncSurface.processSyncRequest.bind(runtime),
    applySyncResponse: syncSurface.applySyncResponse.bind(runtime),
    syncNeeded: syncSurface.syncNeeded.bind(runtime),
    async syncWith(remote: SyncRemote, options?: SyncWithOptions) {
      return await syncSurface.syncWith.call(runtime, remote, options);
    },
    serve: syncSurface.serve.bind(runtime),
  });
}

function bindStrandCapability(runtime: WarpGraphRuntimeSurface): StrandCapability {
  requireCapability(runtime, 'strand', [
    'createStrand', 'braidStrand', 'getStrand', 'listStrands', 'dropStrand',
    'materializeStrand', 'getStrandPatches', 'patchesForStrand',
    'createStrandPatch', 'patchStrand', 'queueStrandIntent',
    'listStrandIntents', 'tickStrand', 'analyzeConflicts',
  ]);
  return Object.freeze({
    createStrand: runtime.createStrand.bind(runtime),
    braidStrand: runtime.braidStrand.bind(runtime),
    getStrand: runtime.getStrand.bind(runtime),
    listStrands: runtime.listStrands.bind(runtime),
    dropStrand: runtime.dropStrand.bind(runtime),
    materializeStrand: runtime.materializeStrand.bind(runtime),
    getStrandPatches: runtime.getStrandPatches.bind(runtime),
    patchesForStrand: runtime.patchesForStrand.bind(runtime),
    createStrandPatch: runtime.createStrandPatch.bind(runtime),
    patchStrand: runtime.patchStrand.bind(runtime),
    queueStrandIntent: runtime.queueStrandIntent.bind(runtime),
    listStrandIntents: runtime.listStrandIntents.bind(runtime),
    tickStrand: runtime.tickStrand.bind(runtime),
    analyzeConflicts: runtime.analyzeConflicts.bind(runtime),
  });
}

function bindIntentCapability(runtime: WarpGraphRuntimeSurface): IntentCapability {
  requireCapability(runtime, 'intent', [
    'admitIntent', 'queueIntent', 'getWriterIntents',
  ]);
  return Object.freeze({
    admitIntent: runtime.admitIntent.bind(runtime),
    queueIntent: runtime.queueIntent.bind(runtime),
    getWriterIntents: runtime.getWriterIntents.bind(runtime),
  });
}

function bindCheckpointCapability(runtime: WarpGraphRuntimeSurface): CheckpointCapability {
  requireCapability(runtime, 'checkpoint', [
    'createCheckpoint', 'syncCoverage', 'maybeRunGC', 'runGC', 'getGCMetrics',
  ]);
  return Object.freeze({
    createCheckpoint: runtime.createCheckpoint.bind(runtime),
    syncCoverage: runtime.syncCoverage.bind(runtime),
    maybeRunGC: runtime.maybeRunGC.bind(runtime),
    runGC: runtime.runGC.bind(runtime),
    getGCMetrics: runtime.getGCMetrics.bind(runtime),
  });
}

function bindProvenanceCapability(runtime: WarpGraphRuntimeSurface): ProvenanceCapability {
  requireCapability(runtime, 'provenance', [
    'patchesFor', 'materializeSlice', 'loadPatchBySha',
  ]);
  return Object.freeze({
    patchesFor: runtime.patchesFor.bind(runtime),
    materializeSlice: runtime.materializeSlice.bind(runtime),
    loadPatchBySha: runtime.loadPatchBySha.bind(runtime),
  });
}

function bindComparisonCapability(runtime: WarpGraphRuntimeSurface): ComparisonCapability {
  requireCapability(runtime, 'comparison', [
    'buildPatchDivergence', 'compareStrand', 'planStrandTransfer',
    'compareCoordinates', 'diff', 'planCoordinateTransfer',
  ]);
  return Object.freeze({
    buildPatchDivergence: runtime.buildPatchDivergence.bind(runtime),
    compareStrand: runtime.compareStrand.bind(runtime),
    planStrandTransfer: runtime.planStrandTransfer.bind(runtime),
    compareCoordinates: runtime.compareCoordinates.bind(runtime),
    diff: runtime.diff.bind(runtime),
    planCoordinateTransfer: runtime.planCoordinateTransfer.bind(runtime),
  });
}

function bindSubscriptionCapability(runtime: WarpGraphRuntimeSurface): SubscriptionCapability {
  requireCapability(runtime, 'subscription', ['subscribe', 'watch']);
  return Object.freeze({
    subscribe: runtime.subscribe.bind(runtime),
    watch: runtime.watch.bind(runtime),
  });
}

/**
 * Opens a WARP multi-writer graph compatibility capability bag.
 *
 * Application workflows should use openWarpWorldline(), which opens a named
 * causal worldline and keeps reads on explicit worldline, coordinate, observer,
 * or optic bases instead of graph-wide materialization.
 *
 * @deprecated For application workflows, use openWarpWorldline(). This advanced
 * compatibility bag remains supported for tooling and substrate diagnostics.
 */
export async function openWarpGraph(deps: WarpGraphDeps): Promise<WarpGraph> {
  const runtime = await openWarpGraphRuntime(deps);

  const query = bindQueryCapability(runtime);
  const patches = bindPatchCapability(runtime);
  const sync = bindSyncCapability(runtime);
  const strands = bindStrandCapability(runtime);
  const intents = bindIntentCapability(runtime);
  const checkpoint = bindCheckpointCapability(runtime);
  const provenance = bindProvenanceCapability(runtime);
  const comparison = bindComparisonCapability(runtime);
  const subscriptions = bindSubscriptionCapability(runtime);

  const graph: WarpGraph = {
    graphName: runtime.graphName,
    writerId: runtime.writerId,

    // Architectural moments
    commitment: Object.freeze({ patches, strands, intents, comparison }),
    folding: Object.freeze({ checkpoint }),
    revelation: Object.freeze({ query, subscriptions, provenance }),
    governance: Object.freeze({ sync }),

    // Flat aliases
    query, patches, sync, strands, intents,
    checkpoint, provenance, comparison, subscriptions,
  };

  return Object.freeze(graph);
}
