import type Patch from '../types/Patch.ts';
import type WarpState from '../services/state/WarpState.ts';
import type { ProvenanceIndex } from '../services/provenance/ProvenanceIndex.ts';

/** A patch with its content-addressable SHA. */
export type PatchWithSha = { patch: Patch; sha: string };

/** Checkpoint data returned by loadCheckpoint(). */
export type CheckpointData = {
  state: WarpState;
  frontier: Map<string, string>;
  stateHash: string;
  schema: number;
  provenanceIndex?: ProvenanceIndex | undefined;
  indexShardOids?: Record<string, string> | null | undefined;
};

/**
 * Collects patches for materialization.
 *
 * Abstracts away the patch loading, writer discovery, and checkpoint
 * resolution that MaterializeController needs. The adapter wraps
 * WarpRuntime's internal methods.
 */
export default abstract class PatchCollector {
  /** Discover all writer IDs in the graph. */
  abstract discoverWriters(): Promise<string[]>;

  /** Load all patches for a single writer. */
  abstract loadWriterPatches(_writerId: string): Promise<PatchWithSha[]>;

  /** Load patches for a frontier, filtered by optional ceiling. */
  abstract collectForFrontier(
    _frontier: Map<string, string>,
    _ceiling: number | null,
  ): Promise<PatchWithSha[]>;

  collectForFrontierSinceCoordinate(
    frontier: Map<string, string>,
    ceiling: number | null,
    _baseCoordinate: { frontier: Map<string, string>; ceiling: number | null },
  ): Promise<PatchWithSha[]> {
    return this.collectForFrontier(frontier, ceiling);
  }

  /** Load the latest checkpoint, or null if none. */
  abstract loadCheckpoint(): Promise<CheckpointData | null>;

  /** Load patches since a checkpoint. */
  abstract loadPatchesSince(_checkpoint: CheckpointData): Promise<PatchWithSha[]>;

  /** Load a patch chain between two SHAs. */
  abstract loadPatchChain(_toSha: string, _fromSha?: string | null): Promise<PatchWithSha[]>;

  /** Get the current writer frontier. */
  abstract getFrontier(): Promise<Map<string, string>>;
}
