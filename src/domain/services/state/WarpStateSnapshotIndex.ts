import WarpError from '../../errors/WarpError.ts';
import type {
  WarpStateCoordinate,
  WarpStateSnapshotRecord,
} from '../../../ports/WarpStateCachePort.ts';

type CompatibilityPredicate = (
  candidate: WarpStateCoordinate,
  target: WarpStateCoordinate,
) => boolean;

type WarpStateSnapshotIndexOptions = {
  isCoordinateCompatible: CompatibilityPredicate;
};

function coordinateKey(coordinate: WarpStateCoordinate): string {
  const parts = [...coordinate.frontier.entries()]
    .sort(([leftWriter], [rightWriter]) =>
      leftWriter < rightWriter ? -1 : leftWriter > rightWriter ? 1 : 0)
    .map(([writerId, tipSha]) => `${writerId}:${tipSha}`);
  const ceiling = coordinate.ceiling === null ? 'null' : String(coordinate.ceiling);
  return `${ceiling}|${parts.join('|')}`;
}

function candidateRank(candidate: WarpStateSnapshotRecord): number {
  return candidate.coordinate.ceiling ?? Number.MIN_SAFE_INTEGER;
}

function recencyTimestamp(candidate: WarpStateSnapshotRecord): string {
  return candidate.lastAccessedAt ?? candidate.createdAt;
}

export default class WarpStateSnapshotIndex {
  private readonly _isCoordinateCompatible: CompatibilityPredicate;
  private readonly _byId: Map<string, WarpStateSnapshotRecord>;
  private readonly _byCoordinateKey: Map<string, string>;

  constructor(options: WarpStateSnapshotIndexOptions) {
    if (typeof options.isCoordinateCompatible !== 'function') {
      throw new WarpError('WarpStateSnapshotIndex requires a compatibility predicate', 'E_SNAPSHOT_INDEX_COMPATIBILITY');
    }
    this._isCoordinateCompatible = options.isCoordinateCompatible;
    this._byId = new Map();
    this._byCoordinateKey = new Map();
  }

  upsert(snapshot: WarpStateSnapshotRecord): void {
    this._byId.set(snapshot.snapshotId, snapshot);
    this._byCoordinateKey.set(coordinateKey(snapshot.coordinate), snapshot.snapshotId);
  }

  findExact(coordinate: WarpStateCoordinate): WarpStateSnapshotRecord | null {
    const snapshotId = this._byCoordinateKey.get(coordinateKey(coordinate));
    if (snapshotId === undefined) {
      return null;
    }
    return this._byId.get(snapshotId) ?? null;
  }

  findBestCompatiblePredecessor(coordinate: WarpStateCoordinate): WarpStateSnapshotRecord | null {
    let best: WarpStateSnapshotRecord | null = null;
    for (const candidate of this._byId.values()) {
      if (!this._isCoordinateCompatible(candidate.coordinate, coordinate)) {
        continue;
      }
      if (best === null) {
        best = candidate;
        continue;
      }
      const bestRank = candidateRank(best);
      const candidateValue = candidateRank(candidate);
      if (candidateValue > bestRank) {
        best = candidate;
        continue;
      }
      if (candidateValue < bestRank) {
        continue;
      }
      if (recencyTimestamp(candidate) > recencyTimestamp(best)) {
        best = candidate;
      }
    }
    return best;
  }

  findById(snapshotId: string): WarpStateSnapshotRecord | null {
    return this._byId.get(snapshotId) ?? null;
  }

  pruneEvictable(options: { maxEntries: number }): void {
    const evictable = [...this._byId.values()]
      .filter((snapshot) => snapshot.retention === 'evictable')
      .sort((left, right) => {
        const leftTimestamp = recencyTimestamp(left);
        const rightTimestamp = recencyTimestamp(right);
        if (leftTimestamp < rightTimestamp) { return -1; }
        if (leftTimestamp > rightTimestamp) { return 1; }
        return left.snapshotId < right.snapshotId ? -1 : left.snapshotId > right.snapshotId ? 1 : 0;
      });

    if (evictable.length <= options.maxEntries) {
      return;
    }

    const toRemove = evictable.slice(0, evictable.length - options.maxEntries);
    for (const snapshot of toRemove) {
      this._byId.delete(snapshot.snapshotId);
      this._byCoordinateKey.delete(coordinateKey(snapshot.coordinate));
    }
  }
}
