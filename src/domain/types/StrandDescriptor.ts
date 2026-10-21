/**
 * Type family for strand descriptors and related option shapes.
 *
 * Extracted from _wiredMethods.d.ts to give these types a proper
 * importable home. Will become runtime-backed classes during god kills.
 */

import type Patch from './Patch.ts';

export type StrandReadOverlayDescriptor = {
  strandId: string;
  overlayId: string;
  kind: string;
  headPatchSha: string | null;
  patchCount: number;
};

export type StrandIntentDescriptor = {
  intentId: string;
  enqueuedAt: string;
  patch: Patch;
  reads: string[];
  writes: string[];
  contentAssetHandles: string[];
};

export type StrandTickCounterfactual = {
  intentId: string;
  reason: string;
  conflictsWith: string[];
  reads: string[];
  writes: string[];
};

export type StrandTickRecord = {
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
};

/** One writer's patch chain on a strand (#1014). */
export type StrandWriterChain = {
  writerId: string;
  /** The chain's mint id spelling, `@w.<writer>@s.<strand-id>`. */
  overlayId: string;
  headPatchSha: string;
  patchCount: number;
};

/** The creation occurrence a strand id is the hash of (#1014). */
export type StrandGenesis = {
  lane: string;
  creator: string;
  occurrence: number;
  name: string;
  base: string;
};

export type StrandDescriptor = {
  schemaVersion: number;
  strandId: string;
  name: string;
  genesis: StrandGenesis;
  /** Every writer chain the strand view reads. `overlay` is this runtime writer's own. */
  writers: StrandWriterChain[];
  graphName: string;
  createdAt: string;
  updatedAt: string;
  owner: string | null;
  scope: string | null;
  lease: { expiresAt: string | null };
  baseObservation: {
    coordinateVersion: string;
    frontier: Record<string, string>;
    frontierDigest: string;
    lamportCeiling: number | null;
    checkpointSha?: string | null;
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
};

export type StrandCreateOptions = {
  /** The strand's friendly name. The strand id is derived from its genesis (#1014). */
  name?: string;
  /** Former spelling of `name`; the strand id is never chosen by the caller. */
  strandId?: string;
  /**
   * The creation token a previous `createStrand` returned as
   * `genesis.occurrence`. Retrying with it returns that strand instead of
   * creating another.
   */
  creationToken?: number;
  lamportCeiling?: number | null;
  owner?: string | null;
  scope?: string | null;
  leaseExpiresAt?: string | null;
  /**
   * Internal composition seam for callers that have already captured the
   * exact parent coordinate. Ordinary strand creation omits this field and
   * captures the live frontier.
   */
  baseFrontier?: ReadonlyMap<string, string>;
  /**
   * Internal composition seam paired with `baseFrontier`. Runtime-created
   * strands persist the bounded checkpoint so a later Runtime can reopen the
   * same coordinate without recapturing live state.
   */
  baseCheckpointSha?: string;
};

export type StrandBraidOptions = {
  braidedStrandIds?: string[];
  writable?: boolean | null;
};
