/**
 * Checkpoint and garbage collection operations.
 *
 * 5 methods covering checkpoint creation, coverage sync, and GC.
 */

/** GC execution result. */
export type GCExecuteResult = {
  nodesCompacted: number;
  edgesCompacted: number;
  tombstonesRemoved: number;
  durationMs: number;
};

/** GC metrics for the current state. */
export type GCMetrics = {
  nodeCount: number;
  edgeCount: number;
  tombstoneCount: number;
  tombstoneRatio: number;
  patchesSinceCompaction: number;
  lastCompactionTime: number;
};

/** Result of maybeRunGC(). */
export type MaybeGCResult = {
  ran: boolean;
  result: GCExecuteResult | null;
  reasons: string[];
};

export default abstract class CheckpointCapability {
  abstract createCheckpoint(): Promise<string>;
  abstract syncCoverage(): Promise<void>;
  abstract maybeRunGC(): MaybeGCResult;
  abstract runGC(): GCExecuteResult;
  abstract getGCMetrics(): GCMetrics | null;
}
