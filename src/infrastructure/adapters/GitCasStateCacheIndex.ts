import WarpStateSnapshotIndex from '../../domain/services/state/WarpStateSnapshotIndex.ts';
import type {
  WarpStateCoordinate,
  WarpStateSnapshotProvenancePosture,
  WarpStateSnapshotRecord,
  WarpStateSnapshotRetention,
} from '../../ports/WarpStateCachePort.ts';

export type GitCasStateCacheEntry = {
  snapshotId: string;
  coordinate: { frontier: Record<string, string>; ceiling: number | null };
  retention: WarpStateSnapshotRetention;
  provenancePosture: WarpStateSnapshotProvenancePosture;
  stateHash: string;
  payloadRef: string;
  createdAt: string;
  lastAccessedAt?: string | undefined;
  indexTreeOid?: string | undefined;
};

export type GitCasStateCacheIndex = {
  schemaVersion: number;
  checkpointHeadId?: string | undefined;
  snapshots: Record<string, GitCasStateCacheEntry>;
};

export type GitCasStateCacheRetentionRoot = {
  payloadRef: string;
  retention: WarpStateSnapshotRetention;
};

export function snapshotRecordToCacheEntry(record: WarpStateSnapshotRecord): GitCasStateCacheEntry {
  const frontier: Record<string, string> = {};
  for (const [writerId, tip] of record.coordinate.frontier) {
    frontier[writerId] = tip;
  }
  return {
    snapshotId: record.snapshotId,
    coordinate: { frontier, ceiling: record.coordinate.ceiling },
    retention: record.retention,
    provenancePosture: record.provenancePosture,
    stateHash: record.stateHash,
    payloadRef: record.payloadRef,
    createdAt: record.createdAt,
    lastAccessedAt: record.lastAccessedAt,
    indexTreeOid: record.indexTreeOid,
  };
}

export function cacheEntryToSnapshotRecord(entry: GitCasStateCacheEntry): WarpStateSnapshotRecord {
  return {
    snapshotId: entry.snapshotId,
    coordinate: {
      frontier: new Map(Object.entries(entry.coordinate.frontier)),
      ceiling: entry.coordinate.ceiling,
    },
    retention: entry.retention,
    provenancePosture: entry.provenancePosture,
    stateHash: entry.stateHash,
    payloadRef: entry.payloadRef,
    createdAt: entry.createdAt,
    lastAccessedAt: entry.lastAccessedAt,
    indexTreeOid: entry.indexTreeOid,
  };
}

export function buildStateSnapshotIndex(
  snapshots: Readonly<Record<string, GitCasStateCacheEntry>>
): WarpStateSnapshotIndex {
  const index = new WarpStateSnapshotIndex({ isCoordinateCompatible });
  for (const entry of Object.values(snapshots)) {
    index.upsert(cacheEntryToSnapshotRecord(entry));
  }
  return index;
}

export function pruneStateCacheIndex(
  index: GitCasStateCacheIndex,
  maxEntries: number
): GitCasStateCacheIndex {
  const snapshotIndex = buildStateSnapshotIndex(index.snapshots);
  snapshotIndex.pruneEvictable({ maxEntries });
  const retained: Record<string, GitCasStateCacheEntry> = {};
  for (const [snapshotId, entry] of Object.entries(index.snapshots)) {
    if (snapshotIndex.findById(snapshotId) !== null) {
      retained[snapshotId] = entry;
    }
  }
  index.snapshots = retained;
  return index;
}

export function stateCacheIndexRecords(index: GitCasStateCacheIndex): WarpStateSnapshotRecord[] {
  return Object.values(index.snapshots).map(cacheEntryToSnapshotRecord);
}

export function stateCacheRetentionRoots(
  index: GitCasStateCacheIndex
): Map<string, GitCasStateCacheRetentionRoot> {
  return new Map(
    Object.values(index.snapshots).map((entry) => [
      entry.snapshotId,
      { payloadRef: entry.payloadRef, retention: entry.retention },
    ])
  );
}

export function stateCacheRetentionRootsEqual(
  left: ReadonlyMap<string, GitCasStateCacheRetentionRoot>,
  right: ReadonlyMap<string, GitCasStateCacheRetentionRoot>
): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const [snapshotId, target] of left) {
    if (!retentionRootEqual(target, right.get(snapshotId))) {
      return false;
    }
  }
  return true;
}

function retentionRootEqual(
  left: GitCasStateCacheRetentionRoot,
  right: GitCasStateCacheRetentionRoot | undefined
): boolean {
  return (
    right !== undefined &&
    right.payloadRef === left.payloadRef &&
    right.retention === left.retention
  );
}

function isCoordinateCompatible(
  candidate: WarpStateCoordinate,
  target: WarpStateCoordinate
): boolean {
  return (
    isCeilingCompatible(candidate.ceiling, target.ceiling) &&
    isFrontierCompatible(candidate.frontier, target.frontier)
  );
}

function isCeilingCompatible(candidate: number | null, target: number | null): boolean {
  return candidate === null || target === null || candidate <= target;
}

function isFrontierCompatible(
  candidate: ReadonlyMap<string, string>,
  target: ReadonlyMap<string, string>
): boolean {
  for (const [writerId, targetTip] of target) {
    const candidateTip = candidate.get(writerId);
    if (candidateTip !== undefined && candidateTip !== targetTip) {
      return false;
    }
  }
  return true;
}
