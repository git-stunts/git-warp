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

  abstract pruneEvictable(): Promise<void>;
}
