/**
 * Write operations: patch creation, commit, and CRDT join.
 *
 * 8 methods covering patch building, writer discovery, and state merge.
 */

import type { PatchBuilder } from '../services/PatchBuilder.ts';
import type Patch from '../types/Patch.ts';
import type { Writer } from '../warp/Writer.ts';
import type { WarpState } from '../services/JoinReducer.ts';

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
  abstract createPatch(): Promise<PatchBuilder>;
  abstract patch(_build: (_p: PatchBuilder) => void | Promise<void>): Promise<string>;
  abstract patchMany(..._builds: Array<(_p: PatchBuilder) => void | Promise<void>>): Promise<string[]>;
  abstract getWriterPatches(_writerId: string, _stopAtSha?: string | null): Promise<PatchWithSha[]>;
  abstract writer(_writerId?: string): Promise<Writer>;
  abstract discoverWriters(): Promise<string[]>;
  abstract discoverTicks(): Promise<TickDiscoveryResult>;
  abstract join(_otherState: WarpState): { state: WarpState; receipt: JoinReceipt };
}
