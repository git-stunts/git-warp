/**
 * WarpGraph — the public API surface for git-warp.
 *
 * `openWarpGraph()` is the single entry point. It returns a frozen
 * capability bag — no god object, no defineProperty wiring, no
 * _internal shims. Each capability namespace exposes exactly the
 * methods consumers need.
 *
 * Internally wraps WarpRuntime during the migration. When all
 * consumers have migrated, WarpRuntime dies and the factory
 * wires controllers directly.
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
import type ClockPort from '../ports/ClockPort.ts';
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
// WarpGraph — the frozen capability bag
// ---------------------------------------------------------------------------

/** The public API surface returned by openWarpGraph(). */
export interface WarpGraph {
  readonly graphName: string;
  readonly writerId: string;
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
// WarpGraphDeps — validated dependency bag
// ---------------------------------------------------------------------------

type TrustMode = 'off' | 'log-only' | 'enforce';

/** Dependencies for openWarpGraph(). Every field is a named port or value. */
export interface WarpGraphDeps {
  readonly persistence: CorePersistence;
  readonly graphName: string;
  readonly writerId: string;
  readonly gcPolicy?: GCPolicyConfig;
  readonly adjacencyCacheSize?: number;
  readonly checkpointPolicy?: { every: number };
  readonly autoMaterialize?: boolean;
  readonly onDeleteWithData?: 'reject' | 'cascade' | 'warn';
  readonly logger?: LoggerPort;
  readonly clock?: ClockPort;
  readonly crypto?: CryptoPort;
  readonly codec?: CodecPort;
  readonly seekCache?: SeekCachePort;
  readonly audit?: boolean;
  readonly blobStorage?: BlobStoragePort;
  readonly patchBlobStorage?: BlobStoragePort;
  readonly patchJournal?: PatchJournalPort | null;
  readonly checkpointStore?: CheckpointStorePort | null;
  readonly indexStore?: IndexStorePort | null;
  readonly trust?: { mode?: TrustMode; pin?: string | null };
  readonly effectPipeline?: EffectPipeline;
  readonly effectSinks?: EffectSinkPort[];
  readonly externalizationPolicy?: ExternalizationPolicy;
}

// ---------------------------------------------------------------------------
// Capability binding — wraps WarpRuntime methods into capability objects
// ---------------------------------------------------------------------------

function bindQuery(rt: WarpRuntime): QueryCapability {
  return rt as unknown as QueryCapability;
}

function bindPatches(rt: WarpRuntime): PatchCapability {
  return rt as unknown as PatchCapability;
}

function bindMaterialize(rt: WarpRuntime): MaterializeCapability {
  return rt as unknown as MaterializeCapability;
}

function bindSync(rt: WarpRuntime): SyncCapability {
  return rt as unknown as SyncCapability;
}

function bindStrands(rt: WarpRuntime): StrandCapability {
  return rt as unknown as StrandCapability;
}

function bindCheckpoint(rt: WarpRuntime): CheckpointCapability {
  return rt as unknown as CheckpointCapability;
}

function bindProvenance(rt: WarpRuntime): ProvenanceCapability {
  return rt as unknown as ProvenanceCapability;
}

function bindComparison(rt: WarpRuntime): ComparisonCapability {
  return rt as unknown as ComparisonCapability;
}

function bindSubscriptions(rt: WarpRuntime): SubscriptionCapability {
  return rt as unknown as SubscriptionCapability;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Opens a WARP multi-writer graph and returns a frozen capability bag.
 *
 * This is the single public entry point. The returned WarpGraph is
 * immutable — capabilities cannot be added, removed, or replaced
 * after construction.
 */
export async function openWarpGraph(deps: WarpGraphDeps): Promise<WarpGraph> {
  const runtime = await WarpRuntime.open(deps);

  const graph: WarpGraph = {
    graphName: runtime.graphName,
    writerId: runtime.writerId,
    query: bindQuery(runtime),
    patches: bindPatches(runtime),
    materialize: bindMaterialize(runtime),
    sync: bindSync(runtime),
    strands: bindStrands(runtime),
    checkpoint: bindCheckpoint(runtime),
    provenance: bindProvenance(runtime),
    comparison: bindComparison(runtime),
    subscriptions: bindSubscriptions(runtime),
    _runtime: runtime,
  };

  return Object.freeze(graph);
}
