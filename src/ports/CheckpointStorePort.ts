import type WarpState from '../domain/services/state/WarpState.ts';
import type VersionVector from '../domain/crdt/VersionVector.ts';
import type { ProvenanceIndex } from '../domain/services/provenance/ProvenanceIndex.ts';
import type AssetHandle from '../domain/storage/AssetHandle.ts';

/** Immutable checkpoint state and optional bounded-read index payloads. */
export interface CheckpointRecord {
  graphName: string;
  state: WarpState;
  frontier: Map<string, string>;
  appliedVV: VersionVector;
  stateHash: string;
  parents: string[];
  provenanceIndex?: ProvenanceIndex | null;
  indexShards?: Readonly<Record<string, Uint8Array>> | null;
}

/** Causal identity returned after a checkpoint is published. */
export interface PublishedCheckpoint {
  checkpointSha: string;
}

/** Complete state loaded from an immutable checkpoint publication. */
export interface CheckpointData {
  state: WarpState;
  frontier: Map<string, string>;
  stateHash: string;
  schema: number;
  appliedVV: VersionVector | null;
  provenanceIndex?: ProvenanceIndex | null;
  indexShardHandles: Readonly<Record<string, AssetHandle>> | null;
}

/** Bounded checkpoint support needed to prepare an optic basis. */
export interface CheckpointBasis {
  checkpointSha: string;
  stateHash: string;
  schema: number;
  frontier: Map<string, string>;
  indexShardHandles: Readonly<Record<string, AssetHandle>>;
}

/** Metadata readable without opening checkpoint state or index payloads. */
export interface CheckpointMetadata {
  checkpointSha: string;
  stateHash: string;
  schema: number;
}

/**
 * Storage-neutral checkpoint lifecycle.
 *
 * Implementations own checkpoint encoding, object layout, causal commit
 * publication, and compatibility reads. Domain services never assemble or
 * traverse the physical storage tree.
 */
export default abstract class CheckpointStorePort {
  abstract publishCheckpoint(_record: CheckpointRecord): Promise<PublishedCheckpoint>;

  abstract resolveHead(_graphName: string): Promise<string | null>;

  abstract loadCheckpoint(_checkpointSha: string): Promise<CheckpointData>;

  abstract readMetadata(_checkpointSha: string): Promise<CheckpointMetadata>;

  abstract loadBasis(_checkpointSha: string): Promise<CheckpointBasis>;

  abstract publishCoverage(_options: {
    graphName: string;
    parents: string[];
  }): Promise<string>;
}
