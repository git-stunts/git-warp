import type SeekCachePort from '../../ports/SeekCachePort.ts';
import type BlobStoragePort from '../../ports/BlobStoragePort.ts';
import type CryptoPort from '../../ports/CryptoPort.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import type RuntimeStorageCapabilityPort from '../../ports/RuntimeStorageCapabilityPort.ts';
import type CommitMessageCodecPort from '../../ports/CommitMessageCodecPort.ts';
import type { NeighborEdge } from '../../ports/NeighborProviderPort.ts';
import type QueryCapability from '../capabilities/QueryCapability.ts';
import type PatchCapability from '../capabilities/PatchCapability.ts';
import type SyncCapability from '../capabilities/SyncCapability.ts';
import type StrandCapability from '../capabilities/StrandCapability.ts';
import type IntentCapability from '../capabilities/IntentCapability.ts';
import type CheckpointCapability from '../capabilities/CheckpointCapability.ts';
import type ProvenanceCapability from '../capabilities/ProvenanceCapability.ts';
import type ComparisonCapability from '../capabilities/ComparisonCapability.ts';
import type SubscriptionCapability from '../capabilities/SubscriptionCapability.ts';
import type { EffectPipeline } from '../services/EffectPipeline.ts';
import type GCPolicy from '../services/GCPolicy.ts';
import type BitmapNeighborProvider from '../services/index/BitmapNeighborProvider.ts';
import type MaterializedViewService from '../services/MaterializedViewService.ts';
import type { VerifyResult } from '../services/MaterializedViewService.ts';
import type LogicalTraversal from '../services/query/LogicalTraversal.ts';
import type { LoadedCheckpoint } from '../services/state/checkpointLoad.ts';
import type { PatchDiff } from '../types/PatchDiff.ts';
import type { ProvenanceIndex } from '../services/provenance/ProvenanceIndex.ts';
import type ProvenancePayload from '../services/provenance/ProvenancePayload.ts';
import type SyncController from '../services/controllers/SyncController.ts';
import type { TemporalQuery } from '../services/TemporalQuery.ts';
import type { CorePersistence } from '../types/WarpPersistence.ts';
import type VersionVector from '../crdt/VersionVector.ts';
import type Patch from '../types/Patch.ts';
import type WarpState from '../services/state/WarpState.ts';
import type SnapshotWarpState from '../services/snapshot/SnapshotWarpState.ts';
import type { TickReceipt } from '../types/TickReceipt.ts';
import type {
  RuntimeHostOpenInput as RuntimeHostBootOpenInput,
  RuntimeHostOpenOptions as RuntimeHostBootOpenOptions,
} from './RuntimeHostBoot.ts';
import { openRuntimeHost } from '../RuntimeHost.ts';

export type RuntimeCapabilitySurface =
  QueryCapability &
  PatchCapability &
  RuntimeIndexMaintenanceSurface &
  SyncCapability &
  StrandCapability &
  IntentCapability &
  CheckpointCapability &
  ProvenanceCapability &
  ComparisonCapability &
  SubscriptionCapability;


export type RuntimeGraphHostProduct = RuntimeCapabilitySurface & {
  readonly graphName: string;
  readonly writerId: string;
};

export type RuntimeHostOpenOptions = RuntimeHostBootOpenOptions;
export type RuntimeHostOpenInput = RuntimeHostBootOpenInput;

export type RuntimeForkRequest = {
  from: string;
  at: string;
  forkName?: string;
  forkWriterId?: string;
};

export type RuntimeWormholeRecord = {
  fromSha: string;
  toSha: string;
  writerId: string;
  payload: ProvenancePayload;
  patchCount: number;
};

type RuntimeHostMaterializeReceiptsResult = {
  state: SnapshotWarpState;
  receipts: readonly TickReceipt[];
};

type RuntimeIndexMaintenanceSurface = {
  verifyIndex(options?: { seed?: number; sampleRate?: number }): VerifyResult;
  invalidateIndex(): void;
};

type RuntimeHostAdjacency = {
  outgoing: Map<string, readonly NeighborEdge[]> | ReadonlyMap<string, readonly NeighborEdge[]>;
  incoming: Map<string, readonly NeighborEdge[]> | ReadonlyMap<string, readonly NeighborEdge[]>;
};

export type RuntimeHostMaterializedGraph = {
  state: WarpState;
  stateHash: string;
  adjacency: RuntimeHostAdjacency;
  provider?: BitmapNeighborProvider;
};

type RuntimeHostCheckpointFrontier = Pick<LoadedCheckpoint, 'schema' | 'frontier'>;
type RuntimeHostCoordinateGraphOptions = {
  frontier: Map<string, string> | Record<string, string>;
  ceiling?: number | null;
};
type RuntimeHostStrandGraphOptions = {
  ceiling?: number | null;
};
type RuntimeHostPatchEntry = {
  patch: Patch;
  sha: string;
};
type RuntimeHostBuildViewResult = {
  state: WarpState;
  stateHash: string;
  diff?: PatchDiff | null | undefined;
};

type RuntimeHostTrustAssessment = {
  trust: {
    explanations: ReadonlyArray<{
      trusted: boolean;
      writerId: string;
    }>;
  };
};

export type RuntimeHostProduct = RuntimeGraphHostProduct & {
  readonly traverse: LogicalTraversal;
  readonly persistence: CorePersistence & Partial<RuntimeStorageCapabilityPort>;
  _persistence: CorePersistence & Partial<RuntimeStorageCapabilityPort>;
  readonly onDeleteWithData: 'reject' | 'cascade' | 'warn';
  readonly gcPolicy: GCPolicy;
  readonly seekCache: SeekCachePort | null;
  _seekCache: SeekCachePort | null;
  _cachedState: WarpState | null;
  _stateDirty: boolean;
  _materializedGraph: RuntimeHostMaterializedGraph | null;
  _versionVector: VersionVector;
  _cachedCeiling: number | null;
  _seekCeiling: number | null;
  _cachedViewHash: string | null;
  _lastGCLamport: number;
  _patchesSinceGC: number;
  _patchesSinceCheckpoint: number;
  _maxObservedLamport: number;
  _checkpointPolicy: { every: number } | null;
  _autoMaterialize: boolean;
  _blobStorage: BlobStoragePort | null;
  readonly _viewService: MaterializedViewService;
  readonly _syncController: SyncController;
  readonly provenanceIndex: ProvenanceIndex | null;
  readonly temporal: TemporalQuery;
  setSeekCache(cache: SeekCachePort): void;
  readonly fork: (_request: RuntimeForkRequest) => Promise<RuntimeHostProduct>;
  readonly createWormhole: (_fromSha: string, _toSha: string) => Promise<RuntimeWormholeRecord>;
  materialize(options: { receipts: true; ceiling?: number | null }): Promise<RuntimeHostMaterializeReceiptsResult>;
  materialize(options?: { receipts?: false; ceiling?: number | null }): Promise<SnapshotWarpState>;
  materialize(options?: { receipts?: boolean; ceiling?: number | null }): Promise<SnapshotWarpState | RuntimeHostMaterializeReceiptsResult>;
  materializeCoordinate(
    options: { frontier: Map<string, string> | Record<string, string>; ceiling?: number | null; receipts: true },
  ): Promise<RuntimeHostMaterializeReceiptsResult>;
  materializeCoordinate(
    options: { frontier: Map<string, string> | Record<string, string>; ceiling?: number | null; receipts?: false },
  ): Promise<SnapshotWarpState>;
  materializeCoordinate(
    options: { frontier: Map<string, string> | Record<string, string>; ceiling?: number | null; receipts?: boolean },
  ): Promise<SnapshotWarpState | RuntimeHostMaterializeReceiptsResult>;
  materializeAt(checkpointSha: string): Promise<SnapshotWarpState>;
  _effectPipeline: EffectPipeline | null;
  readonly _crypto: CryptoPort;
  readonly _codec: CodecPort;
  readonly _commitMessageCodec: CommitMessageCodecPort;
  _setMaterializedState(
    state: WarpState,
    optionsOrDiff?: PatchDiff | { diff?: PatchDiff | null },
  ): Promise<RuntimeHostMaterializedGraph>;
  _materializeGraph(options?: { ceiling?: number | null }): Promise<RuntimeHostMaterializedGraph>;
  _materializeCoordinateGraph(options: RuntimeHostCoordinateGraphOptions): Promise<RuntimeHostMaterializedGraph>;
  _materializeStrandGraph(
    strandId: string,
    options?: RuntimeHostStrandGraphOptions,
  ): Promise<RuntimeHostMaterializedGraph>;
  _buildViewFromResult(result: RuntimeHostBuildViewResult): void;
  _loadLatestCheckpoint(): Promise<LoadedCheckpoint | null>;
  _loadPatchesSince(checkpoint: RuntimeHostCheckpointFrontier): Promise<RuntimeHostPatchEntry[]>;
  _readCheckpointSha(): Promise<string | null>;
  _loadPatchChainFromSha(tipSha: string, stopAtSha?: string | null): Promise<RuntimeHostPatchEntry[]>;
  _loadWriterPatches(writerId: string, stopAtSha?: string | null): Promise<RuntimeHostPatchEntry[]>;
  _ensureFreshState(): Promise<void>;
  _maybeRunGC(state: WarpState): void;
  _isAncestor(ancestorSha: string, descendantSha: string): Promise<boolean>;
  _relationToCheckpointHead(ckHead: string, incomingSha: string): Promise<'same' | 'ahead' | 'behind' | 'diverged'>;
  _validatePatchAgainstCheckpoint(
    writerId: string,
    incomingSha: string,
    checkpoint: RuntimeHostCheckpointFrontier | null | undefined,
  ): Promise<void>;
  _extractTrustedWriters(assessment: RuntimeHostTrustAssessment): { trusted: Set<string> };
  _maxLamportFromState(state: WarpState): number;
};

export async function openRuntimeHostProduct(
  options: RuntimeHostOpenInput,
): Promise<RuntimeHostProduct> {
  return await openRuntimeHost(options);
}
