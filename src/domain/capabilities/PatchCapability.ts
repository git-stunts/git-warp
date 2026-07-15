/**
 * Write operations: patch creation, commit, and CRDT join.
 *
 * 8 methods covering patch building, writer discovery, and state merge.
 */

import type { PatchBuilder } from '../services/PatchBuilder.ts';
import type Patch from '../types/Patch.ts';
import type { Writer } from '../warp/Writer.ts';
import type { WarpState } from '../services/JoinReducer.ts';
import type { PatchCommitResult } from '../types/PatchCommitResult.ts';

/** Receipt from a CRDT state merge (join). */
export type JoinReceipt = {
  nodesAdded: number;
  nodesRemoved: number;
  edgesAdded: number;
  edgesRemoved: number;
  propsChanged: number;
  frontierMerged: boolean;
};

/** Per-writer tick discovery result. */
export type WriterTickInfo = {
  ticks: number[];
  tipSha: string | null;
  tickShas: Record<number, string>;
};

/** Result of discoverTicks(). */
export type TickDiscoveryResult = {
  ticks: number[];
  maxTick: number;
  perWriter: Map<string, WriterTickInfo>;
};

/** Patch with its content-addressable SHA. */
export type PatchWithSha = {
  patch: Patch;
  sha: string;
};

export default abstract class PatchCapability {
  /** Start a mutable patch builder for the current writer. */
  abstract createPatch(): Promise<PatchBuilder>;

  /** Build and commit one patch with the current writer. */
  abstract patch(_build: (_p: PatchBuilder) => void | Promise<void>): Promise<string>;

  /** Build and commit one patch while retaining publication evidence. */
  abstract patchWithEvidence(
    _build: (_p: PatchBuilder) => void | Promise<void>,
  ): Promise<PatchCommitResult>;

  /** Build and commit multiple patches in order. */
  abstract patchMany(..._builds: Array<(_p: PatchBuilder) => void | Promise<void>>): Promise<string[]>;

  /** Return committed patches for a writer, optionally stopping at a SHA. */
  abstract getWriterPatches(_writerId: string, _stopAtSha?: string | null): Promise<PatchWithSha[]>;

  /** Resolve a writer handle by id or return the current writer. */
  abstract writer(_writerId?: string): Promise<Writer>;

  /** Discover writer ids present in the graph. */
  abstract discoverWriters(): Promise<string[]>;

  /** Discover ticks across all writers. */
  abstract discoverTicks(): Promise<TickDiscoveryResult>;

  /** Merge another state into this graph's current CRDT state. */
  abstract join(_otherState: WarpState): { state: WarpState; receipt: JoinReceipt };
}
