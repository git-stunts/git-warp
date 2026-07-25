export type MaterializationCacheEntryStatus =
  | 'live'
  | 'expired'
  | 'missing'
  | 'malformed';

export type MaterializationCacheCoordinateEvidence = Readonly<{
  ceiling: number | null;
  frontier: ReadonlyArray<Readonly<{
    writerId: string;
    patchSha: string;
  }>>;
}>;

export type MaterializationCacheIssue = Readonly<{
  code: string;
  message: string | null;
}>;

export type MaterializationCacheEntryDiagnostic = Readonly<{
  key: string;
  handle: string;
  status: MaterializationCacheEntryStatus;
  retention: 'evictable' | 'pinned';
  expiresAt: string | null;
  createdAt: string;
  accessedAt: string;
  logicalBytes: number;
  collectible: boolean;
  coordinate: MaterializationCacheCoordinateEvidence | null;
  stateHash: string | null;
  issue: MaterializationCacheIssue | null;
}>;

export type MaterializationCachePolicyEvidence = Readonly<{
  satisfied: boolean;
  entryCount: number;
  logicalBytes: number;
  pinnedEntries: number;
  evictableEntries: number;
  expiredEntries: number;
  maxEntries: number;
  maxBytes: number | null;
  accessResolutionMs: number;
}>;

export type MaterializationCacheInspection = Readonly<{
  namespace: string;
  ref: string;
  generation: string | null;
  healthy: boolean;
  entries: ReadonlyArray<MaterializationCacheEntryDiagnostic>;
  issues: ReadonlyArray<MaterializationCacheIssue>;
  policy: MaterializationCachePolicyEvidence | null;
}>;

export type MaterializationCacheRepair = Readonly<{
  before: MaterializationCacheInspection;
  after: MaterializationCacheInspection;
  removedKeys: ReadonlyArray<string>;
  generation: string;
}>;

/** Delegates physical retained-materialization inspection and repair to git-cas. */
export default interface MaterializationCacheDiagnosticsPort {
  inspectCache(): Promise<MaterializationCacheInspection>;
  repairCache(): Promise<MaterializationCacheRepair>;
}
