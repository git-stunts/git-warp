import WarpRuntime from '../WarpRuntime.ts';

import type QueryCapability from '../capabilities/QueryCapability.ts';
import type PatchCapability from '../capabilities/PatchCapability.ts';
import type MaterializeCapability from '../capabilities/MaterializeCapability.ts';
import type SyncCapability from '../capabilities/SyncCapability.ts';
import type StrandCapability from '../capabilities/StrandCapability.ts';
import type CheckpointCapability from '../capabilities/CheckpointCapability.ts';
import type ProvenanceCapability from '../capabilities/ProvenanceCapability.ts';
import type ComparisonCapability from '../capabilities/ComparisonCapability.ts';
import type SubscriptionCapability from '../capabilities/SubscriptionCapability.ts';

type RuntimeCapabilitySurface =
  QueryCapability &
  PatchCapability &
  MaterializeCapability &
  SyncCapability &
  StrandCapability &
  CheckpointCapability &
  ProvenanceCapability &
  ComparisonCapability &
  SubscriptionCapability;

export type WarpGraphRuntimeOpenOptions = Parameters<typeof WarpRuntime.open>[0];

export type WarpGraphRuntimeSurface = RuntimeCapabilitySurface & {
  readonly graphName: string;
  readonly writerId: string;
};

export async function openWarpGraphRuntime(
  options: WarpGraphRuntimeOpenOptions,
): Promise<WarpGraphRuntimeSurface> {
  return await WarpRuntime.open(options);
}
