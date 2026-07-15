import type WarpState from '../domain/services/state/WarpState.ts';

export type WarpStateSnapshotRetention = 'evictable' | 'pinned';
export type WarpStateSnapshotProvenancePosture = 'full' | 'degraded';

export type WarpStateCoordinate = {
  frontier: Map<string, string>;
  ceiling: number | null;
};

export type WarpStateSnapshotRecord = {
  snapshotId: string;
  coordinate: WarpStateCoordinate;
  retention: WarpStateSnapshotRetention;
  /** `full` is valid only when the retained payload includes its provenance index. */
  provenancePosture: WarpStateSnapshotProvenancePosture;
  stateHash: string;
  payloadRef: string;
  createdAt: string;
  lastAccessedAt?: string | undefined;
  indexTreeOid?: string | undefined;
  state?: WarpState | undefined;
};

export default abstract class WarpStateCachePort {
  abstract getExact(_coordinate: WarpStateCoordinate): Promise<WarpStateSnapshotRecord | null>;

  abstract getBestCompatiblePredecessor(
    _coordinate: WarpStateCoordinate,
  ): Promise<WarpStateSnapshotRecord | null>;

  abstract put(_snapshot: WarpStateSnapshotRecord): Promise<WarpStateSnapshotRecord>;

  abstract pin(_snapshotId: string): Promise<WarpStateSnapshotRecord>;

  abstract publishCheckpointHead(_graphName: string, _snapshotId: string): Promise<void>;

  abstract resolveCheckpointHead(_graphName: string): Promise<WarpStateSnapshotRecord | null>;

  abstract pruneEvictable(): Promise<void>;
}
