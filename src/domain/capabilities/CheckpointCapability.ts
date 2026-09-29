/**
 * Checkpoint and garbage collection operations.
 *
 * 5 methods covering checkpoint creation, coverage sync, and GC.
 */

import type DomainGCExecuteResult from '../services/GCExecuteResult.ts';

/** GC execution result: the value object executeGC produces, not a copy of its shape. */
export type GCExecuteResult = DomainGCExecuteResult;

/** GC metrics for the current state. */
export type GCMetrics = {
  nodeCount: number;
  edgeCount: number;
  tombstoneCount: number;
  tombstoneRatio: number;
  patchesSinceCompaction: number;
  lastCompactionLamport: number;
};

/** Result of maybeRunGC(). */
export type MaybeGCResult = {
  ran: boolean;
  result: GCExecuteResult | null;
  reasons: string[];
};

export default abstract class CheckpointCapability {
  /** Create a checkpoint commit for the current graph state. */
  abstract createCheckpoint(): Promise<string>;

  /** Synchronize checkpoint coverage metadata with persisted state. */
  abstract syncCoverage(): Promise<void>;

  /** Run garbage collection only when the configured policy says it is due. */
  abstract maybeRunGC(): MaybeGCResult;

  /** Force an immediate garbage-collection pass. */
  abstract runGC(): GCExecuteResult;

  /** Return current garbage-collection metrics, or null when unavailable. */
  abstract getGCMetrics(): GCMetrics | null;
}
