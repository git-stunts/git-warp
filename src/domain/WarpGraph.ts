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
 * `openWarpGraph()` is the composition root. It accepts the governing
 * policy, witness infrastructure, and revelation regime as typed ports,
 * wires controllers, and returns a frozen capability bag organized by
 * architectural moment.
 */
import WarpRuntime from './WarpRuntime.ts';
import type QueryCapability from './capabilities/QueryCapability.ts';
import type PatchCapability from './capabilities/PatchCapability.ts';
import type MaterializeCapability from './capabilities/MaterializeCapability.ts';
import type SyncCapability from './capabilities/SyncCapability.ts';
import type StrandCapability from './capabilities/StrandCapability.ts';
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
  /** Speculative lanes: fork, materialize, collapse, braid. */
  readonly strands: StrandCapability;
  /** Braid presentation: compare coordinates, plan transfers. */
  readonly comparison: ComparisonCapability;
}

/**
 * Folding capabilities — re-expressing admitted history.
 *
 * Frontier-relative materialization and checkpoint-based history folding.
 */
export interface FoldingSurface {
  /** Frontier-relative materialization of causal history into state. */
  readonly materialize: MaterializeCapability;
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
  readonly materialize: MaterializeCapability;
  readonly sync: SyncCapability;
  readonly strands: StrandCapability;
  readonly checkpoint: CheckpointCapability;
  readonly provenance: ProvenanceCapability;
  readonly comparison: ComparisonCapability;
  readonly subscriptions: SubscriptionCapability;

  /** The underlying runtime — TEMPORARY bridge. Removed when API_kill-warpruntime ships. */
  readonly _runtime: WarpRuntime;
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

/**
 * Opens a WARP multi-writer graph and returns a frozen capability bag.
 *
 * This is the single public entry point — the composition root for
 * the admission architecture. It accepts the governing policy, witness
 * infrastructure, and revelation regime as typed ports, wires
 * controllers, and returns a frozen WarpGraph.
 *
 * @example
 * ```ts
 * import { openWarpGraph } from '@git-stunts/git-warp';
 *
 * const graph = await openWarpGraph({
 *   persistence,
 *   graphName: 'events',
 *   writerId: 'node-1',
 *   trust: { mode: 'enforce' },
 * });
 *
 * // Commitment: create a patch
 * const patch = await graph.patches.createPatch();
 * patch.addNode('user:alice');
 * await patch.commit();
 *
 * // Folding: materialize state
 * await graph.materialize.materialize({});
 *
 * // Revelation: query the graph
 * const props = await graph.query.getNodeProps('user:alice');
 * ```
 */
export async function openWarpGraph(deps: WarpGraphDeps): Promise<WarpGraph> {
  const runtime = await WarpRuntime.open(deps);

  // Bind capabilities from the runtime's wired methods
  const query = runtime as unknown as QueryCapability;
  const patches = runtime as unknown as PatchCapability;
  const materialize = runtime as unknown as MaterializeCapability;
  const sync = runtime as unknown as SyncCapability;
  const strands = runtime as unknown as StrandCapability;
  const checkpoint = runtime as unknown as CheckpointCapability;
  const provenance = runtime as unknown as ProvenanceCapability;
  const comparison = runtime as unknown as ComparisonCapability;
  const subscriptions = runtime as unknown as SubscriptionCapability;

  const graph: WarpGraph = {
    graphName: runtime.graphName,
    writerId: runtime.writerId,

    // Architectural moments
    commitment: Object.freeze({ patches, strands, comparison }),
    folding: Object.freeze({ materialize, checkpoint }),
    revelation: Object.freeze({ query, subscriptions, provenance }),
    governance: Object.freeze({ sync }),

    // Flat aliases
    query, patches, materialize, sync, strands,
    checkpoint, provenance, comparison, subscriptions,

    _runtime: runtime,
  };

  return Object.freeze(graph);
}
