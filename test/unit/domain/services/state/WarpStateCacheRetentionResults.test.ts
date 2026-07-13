import { describe, expect, it } from 'vitest';
import WarpStateCacheRepairResult
  from '../../../../../src/domain/services/state/WarpStateCacheRepairResult.ts';
import WarpStateCacheRetentionReport
  from '../../../../../src/domain/services/state/WarpStateCacheRetentionReport.ts';

const EMPTY_NAME_ERROR = /cannot contain an empty name/;
const EMPTY_ROOT_SET_ERROR = /rootSetError cannot be empty/;
const INVALID_AFTER_REPORT = /requires a retention report for after/;
const INVALID_BEFORE_REPORT = /requires a retention report for before/;

function report(options: {
  readonly rootSetError?: string | null;
  readonly unanchoredSnapshotIds?: readonly string[];
} = {}): WarpStateCacheRetentionReport {
  return new WarpStateCacheRetentionReport({
    liveSnapshotIds: ['snapshot-b', 'snapshot-a', 'snapshot-a'],
    anchoredSnapshotIds: ['snapshot-a'],
    unanchoredSnapshotIds: options.unanchoredSnapshotIds ?? [],
    missingSnapshotIds: [],
    wrongTypeSnapshotIds: [],
    staleRootNames: [],
    mismatchedRootNames: [],
    rootSetError: options.rootSetError ?? null,
  });
}

describe('state-cache retention result values', () => {
  it('normalizes, freezes, and evaluates retention reports', () => {
    const value = report({ unanchoredSnapshotIds: ['snapshot-b'] });

    expect(value.liveSnapshotIds).toEqual(['snapshot-a', 'snapshot-b']);
    expect(Object.isFrozen(value.liveSnapshotIds)).toBe(true);
    expect(Object.isFrozen(value)).toBe(true);
    expect(value.isHealthy()).toBe(false);
    expect(report().isHealthy()).toBe(true);
  });

  it('rejects empty report names and errors', () => {
    expect(() => new WarpStateCacheRetentionReport({
      liveSnapshotIds: [''],
      anchoredSnapshotIds: [],
      unanchoredSnapshotIds: [],
      missingSnapshotIds: [],
      wrongTypeSnapshotIds: [],
      staleRootNames: [],
      mismatchedRootNames: [],
      rootSetError: null,
    })).toThrow(EMPTY_NAME_ERROR);
    expect(() => report({ rootSetError: '' })).toThrow(EMPTY_ROOT_SET_ERROR);
  });

  it('normalizes and freezes repair results', () => {
    const before = report({ unanchoredSnapshotIds: ['snapshot-b'] });
    const after = report();
    const value = new WarpStateCacheRepairResult({
      before,
      after,
      anchoredSnapshotIds: ['snapshot-b', 'snapshot-a', 'snapshot-a'],
      unrecoverableSnapshotIds: [],
      removedStaleRootNames: ['stale-b', 'stale-a'],
    });

    expect(value.anchoredSnapshotIds).toEqual(['snapshot-a', 'snapshot-b']);
    expect(value.removedStaleRootNames).toEqual(['stale-a', 'stale-b']);
    expect(Object.isFrozen(value.anchoredSnapshotIds)).toBe(true);
    expect(Object.isFrozen(value)).toBe(true);
  });

  it('rejects invalid reports and empty repaired names', () => {
    const valid = report();
    const base = {
      before: valid,
      after: valid,
      anchoredSnapshotIds: [],
      unrecoverableSnapshotIds: [],
      removedStaleRootNames: [],
    };

    expect(() => Reflect.construct(WarpStateCacheRepairResult, [
      { ...base, before: {} },
    ])).toThrow(INVALID_BEFORE_REPORT);
    expect(() => Reflect.construct(WarpStateCacheRepairResult, [
      { ...base, after: {} },
    ])).toThrow(INVALID_AFTER_REPORT);
    expect(() => new WarpStateCacheRepairResult({
      ...base,
      anchoredSnapshotIds: [''],
    })).toThrow(EMPTY_NAME_ERROR);
  });
});
