import type WarpState from '../domain/services/state/WarpState.ts';
import type VersionVector from '../domain/crdt/VersionVector.ts';
import type { ProvenanceIndex } from '../domain/services/provenance/ProvenanceIndex.ts';

/**
 * Port for checkpoint persistence.
 *
 * A checkpoint is one domain event with multiple persistence artifacts.
 * The port speaks one semantic operation (writeCheckpoint, readCheckpoint),
 * not individual blob writes. The adapter internally fans artifacts out
 * through the stream pipeline.
 *
 * @see CborCheckpointStoreAdapter - Reference implementation
 */

export interface CheckpointRecord {
  state: WarpState;
  frontier: Map<string, string>;
  appliedVV: VersionVector;
  stateHash: string;
  provenanceIndex?: ProvenanceIndex | null;
}

export interface CheckpointWriteResult {
  nodeAliveBlobOid: string;
  edgeAliveBlobOid: string;
  propBlobOid: string;
  observedFrontierBlobOid: string;
  edgeBirthEventBlobOid: string;
  frontierBlobOid: string;
  appliedVVBlobOid: string;
  provenanceIndexBlobOid: string | null;
}

export interface CheckpointData {
  state: WarpState;
  frontier: Map<string, string>;
  appliedVV: VersionVector | null;
  stateHash: string;
  schema: number;
  provenanceIndex?: ProvenanceIndex | null;
  indexShardOids: Record<string, string> | null;
}

/** Port for checkpoint persistence. */
export default abstract class CheckpointStorePort {
  /**
   * Persists a complete checkpoint and returns write results.
   *
   * The adapter internally encodes and writes state, frontier,
   * appliedVV (and optionally provenanceIndex) as separate blobs,
   * assembles a Git tree, and returns the OIDs.
   */
  abstract writeCheckpoint(_record: CheckpointRecord): Promise<CheckpointWriteResult>;

  /** Reads a checkpoint from a tree of OIDs. */
  abstract readCheckpoint(_treeOids: Record<string, string>): Promise<CheckpointData>;
}
