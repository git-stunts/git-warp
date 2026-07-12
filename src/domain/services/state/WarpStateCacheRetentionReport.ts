import WarpError from '../../errors/WarpError.ts';

type WarpStateCacheRetentionReportOptions = {
  readonly liveSnapshotIds: readonly string[];
  readonly anchoredSnapshotIds: readonly string[];
  readonly unanchoredSnapshotIds: readonly string[];
  readonly missingSnapshotIds: readonly string[];
  readonly wrongTypeSnapshotIds: readonly string[];
  readonly staleRootNames: readonly string[];
  readonly mismatchedRootNames: readonly string[];
  readonly rootSetError: string | null;
};

function normalizedNames(values: readonly string[], field: string): readonly string[] {
  const names = new Set<string>();
  for (const value of values) {
    if (value.length === 0) {
      throw new WarpError(
        `State-cache retention report ${field} cannot contain an empty name`,
        'E_CACHE_RETENTION_REPORT_INVALID',
      );
    }
    names.add(value);
  }
  return Object.freeze([...names].sort());
}

export default class WarpStateCacheRetentionReport {
  readonly liveSnapshotIds: readonly string[];
  readonly anchoredSnapshotIds: readonly string[];
  readonly unanchoredSnapshotIds: readonly string[];
  readonly missingSnapshotIds: readonly string[];
  readonly wrongTypeSnapshotIds: readonly string[];
  readonly staleRootNames: readonly string[];
  readonly mismatchedRootNames: readonly string[];
  readonly rootSetError: string | null;

  constructor(options: WarpStateCacheRetentionReportOptions) {
    if (options.rootSetError !== null && options.rootSetError.length === 0) {
      throw new WarpError(
        'State-cache retention report rootSetError cannot be empty',
        'E_CACHE_RETENTION_REPORT_INVALID',
      );
    }
    this.liveSnapshotIds = normalizedNames(options.liveSnapshotIds, 'liveSnapshotIds');
    this.anchoredSnapshotIds = normalizedNames(options.anchoredSnapshotIds, 'anchoredSnapshotIds');
    this.unanchoredSnapshotIds = normalizedNames(options.unanchoredSnapshotIds, 'unanchoredSnapshotIds');
    this.missingSnapshotIds = normalizedNames(options.missingSnapshotIds, 'missingSnapshotIds');
    this.wrongTypeSnapshotIds = normalizedNames(options.wrongTypeSnapshotIds, 'wrongTypeSnapshotIds');
    this.staleRootNames = normalizedNames(options.staleRootNames, 'staleRootNames');
    this.mismatchedRootNames = normalizedNames(options.mismatchedRootNames, 'mismatchedRootNames');
    this.rootSetError = options.rootSetError;
    Object.freeze(this);
  }

  isHealthy(): boolean {
    const issueCount = this.unanchoredSnapshotIds.length
      + this.missingSnapshotIds.length
      + this.wrongTypeSnapshotIds.length
      + this.staleRootNames.length
      + this.mismatchedRootNames.length
      + Number(this.rootSetError !== null);
    return issueCount === 0;
  }
}
