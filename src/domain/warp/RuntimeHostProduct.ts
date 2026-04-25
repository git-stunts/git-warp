import type SeekCachePort from '../../ports/SeekCachePort.ts';
import type CryptoPort from '../../ports/CryptoPort.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import type RuntimeStorageCapabilityPort from '../../ports/RuntimeStorageCapabilityPort.ts';
import type QueryCapability from '../capabilities/QueryCapability.ts';
import type PatchCapability from '../capabilities/PatchCapability.ts';
import type MaterializeCapability from '../capabilities/MaterializeCapability.ts';
import type SyncCapability from '../capabilities/SyncCapability.ts';
import type StrandCapability from '../capabilities/StrandCapability.ts';
import type CheckpointCapability from '../capabilities/CheckpointCapability.ts';
import type ProvenanceCapability from '../capabilities/ProvenanceCapability.ts';
import type ComparisonCapability from '../capabilities/ComparisonCapability.ts';
import type SubscriptionCapability from '../capabilities/SubscriptionCapability.ts';
import type { EffectPipeline } from '../services/EffectPipeline.ts';
import type GCPolicy from '../services/GCPolicy.ts';
import type LogicalTraversal from '../services/query/LogicalTraversal.ts';
import type ProvenancePayload from '../services/provenance/ProvenancePayload.ts';
import type { CorePersistence } from '../types/WarpPersistence.ts';
import type { WarpRuntimeOpenOptions } from './WarpRuntimeBoot.ts';

export type RuntimeCapabilitySurface =
  QueryCapability &
  PatchCapability &
  MaterializeCapability &
  SyncCapability &
  StrandCapability &
  CheckpointCapability &
  ProvenanceCapability &
  ComparisonCapability &
  SubscriptionCapability;

export type RuntimeGraphHostProduct = RuntimeCapabilitySurface & {
  readonly graphName: string;
  readonly writerId: string;
};

export type RuntimeHostOpenOptions = WarpRuntimeOpenOptions;

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

export type RuntimeHostProduct = RuntimeGraphHostProduct & {
  readonly traverse: LogicalTraversal;
  readonly persistence: CorePersistence & Partial<RuntimeStorageCapabilityPort>;
  readonly onDeleteWithData: 'reject' | 'cascade' | 'warn';
  readonly gcPolicy: GCPolicy;
  readonly seekCache: SeekCachePort | null;
  _seekCache: SeekCachePort | null;
  setSeekCache(cache: SeekCachePort): void;
  readonly fork: (_request: RuntimeForkRequest) => Promise<RuntimeHostProduct>;
  readonly createWormhole: (_fromSha: string, _toSha: string) => Promise<RuntimeWormholeRecord>;
  _effectPipeline: EffectPipeline | null;
  readonly _crypto: CryptoPort;
  readonly _codec: CodecPort;
};

export async function openRuntimeHostProduct(
  options: RuntimeHostOpenOptions,
): Promise<RuntimeHostProduct> {
  const runtimeModule = await import('../WarpRuntime.ts');
  return await runtimeModule.openWarpRuntime(options);
}
