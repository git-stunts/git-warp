import WarpError from '../../errors/WarpError.ts';
import WarpStateCacheRetentionReport from './WarpStateCacheRetentionReport.ts';

type WarpStateCacheRepairResultOptions = {
  readonly before: WarpStateCacheRetentionReport;
  readonly after: WarpStateCacheRetentionReport;
  readonly anchoredSnapshotIds: readonly string[];
  readonly unrecoverableSnapshotIds: readonly string[];
  readonly removedStaleRootNames: readonly string[];
};

function repairedNames(values: readonly string[], field: string): readonly string[] {
  const names = new Set<string>();
  for (const value of values) {
    if (value.length === 0) {
      throw new WarpError(
        `State-cache repair result ${field} cannot contain an empty name`,
        'E_CACHE_RETENTION_REPAIR_INVALID',
      );
    }
    names.add(value);
  }
  return Object.freeze([...names].sort());
}

export default class WarpStateCacheRepairResult {
  readonly before: WarpStateCacheRetentionReport;
  readonly after: WarpStateCacheRetentionReport;
  readonly anchoredSnapshotIds: readonly string[];
  readonly unrecoverableSnapshotIds: readonly string[];
  readonly removedStaleRootNames: readonly string[];

  constructor(options: WarpStateCacheRepairResultOptions) {
    if (!(options.before instanceof WarpStateCacheRetentionReport)) {
      throw new WarpError(
        'State-cache repair result requires a retention report for before',
        'E_CACHE_RETENTION_REPAIR_INVALID',
      );
    }
    if (!(options.after instanceof WarpStateCacheRetentionReport)) {
      throw new WarpError(
        'State-cache repair result requires a retention report for after',
        'E_CACHE_RETENTION_REPAIR_INVALID',
      );
    }
    this.before = options.before;
    this.after = options.after;
    this.anchoredSnapshotIds = repairedNames(options.anchoredSnapshotIds, 'anchoredSnapshotIds');
    this.unrecoverableSnapshotIds = repairedNames(
      options.unrecoverableSnapshotIds,
      'unrecoverableSnapshotIds',
    );
    this.removedStaleRootNames = repairedNames(options.removedStaleRootNames, 'removedStaleRootNames');
    Object.freeze(this);
  }
}
