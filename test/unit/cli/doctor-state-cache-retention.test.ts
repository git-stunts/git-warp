import { describe, expect, it } from 'vitest';
import {
  checkStateCacheRetention,
  stateCacheRepairFailureFinding,
  stateCacheRepairFinding,
} from '../../../bin/cli/commands/doctor/checksStateCache.ts';
import { CODES } from '../../../bin/cli/commands/doctor/codes.ts';
import WarpStateCacheRetentionReport from '../../../src/domain/services/state/WarpStateCacheRetentionReport.ts';
import WarpStateCacheRepairResult from '../../../src/domain/services/state/WarpStateCacheRepairResult.ts';

function report(options: {
  anchored?: readonly string[];
  unanchored?: readonly string[];
  missing?: readonly string[];
  wrongType?: readonly string[];
  stale?: readonly string[];
  mismatched?: readonly string[];
  rootSetError?: string | null;
} = {}): WarpStateCacheRetentionReport {
  const liveSnapshotIds = [
    ...(options.anchored ?? []),
    ...(options.unanchored ?? []),
    ...(options.missing ?? []),
    ...(options.wrongType ?? []),
  ];
  return new WarpStateCacheRetentionReport({
    liveSnapshotIds,
    anchoredSnapshotIds: options.anchored ?? [],
    unanchoredSnapshotIds: options.unanchored ?? [],
    missingSnapshotIds: options.missing ?? [],
    wrongTypeSnapshotIds: options.wrongType ?? [],
    staleRootNames: options.stale ?? [],
    mismatchedRootNames: options.mismatched ?? [],
    rootSetError: options.rootSetError ?? null,
  });
}

function contextWithReport(retentionReport: WarpStateCacheRetentionReport) {
  return {
    stateCache: {
      inspectRetention: async () => retentionReport,
    },
  };
}

describe('state-cache retention doctor check', () => {
  it('reports a healthy anchored cache', async () => {
    const findings = await checkStateCacheRetention(
      contextWithReport(report({ anchored: ['snapshot-a'] })),
    );

    expect(findings).toEqual([
      expect.objectContaining({ status: 'ok', code: CODES.STATE_CACHE_RETENTION_OK }),
    ]);
  });

  it('separates unanchored, missing, wrong-type, stale, and root-set failures', async () => {
    const findings = await checkStateCacheRetention(contextWithReport(report({
      unanchored: ['snapshot-a'],
      missing: ['snapshot-b'],
      wrongType: ['snapshot-c'],
      stale: ['stale-root'],
      mismatched: ['snapshot-a'],
      rootSetError: 'malformed metadata',
    })));
    const codes = findings.map((finding) => finding.code);

    expect(codes).toEqual([
      CODES.STATE_CACHE_ROOT_SET_INVALID,
      CODES.STATE_CACHE_PAYLOAD_MISSING,
      CODES.STATE_CACHE_PAYLOAD_WRONG_TYPE,
      CODES.STATE_CACHE_PAYLOAD_UNANCHORED,
      CODES.STATE_CACHE_STALE_ROOTS,
    ]);
  });

  it('reports partial repair when already-pruned snapshots are unrecoverable', () => {
    const before = report({ unanchored: ['snapshot-a'], missing: ['snapshot-b'] });
    const after = report({ anchored: ['snapshot-a'], missing: ['snapshot-b'] });
    const result = new WarpStateCacheRepairResult({
      before,
      after,
      anchoredSnapshotIds: ['snapshot-a'],
      unrecoverableSnapshotIds: ['snapshot-b'],
      removedStaleRootNames: [],
    });

    expect(stateCacheRepairFinding(result)).toEqual(expect.objectContaining({
      status: 'warn',
      code: CODES.STATE_CACHE_RETENTION_PARTIAL_REPAIR,
      evidence: expect.objectContaining({ unrecoverableSnapshotIds: ['snapshot-b'] }),
    }));
  });

  it('settles repair failures as doctor findings', () => {
    expect(stateCacheRepairFailureFinding(new Error('root set unavailable'))).toEqual(
      expect.objectContaining({
        id: 'state-cache-retention-repair',
        status: 'fail',
        code: CODES.CHECK_INTERNAL_ERROR,
        message: 'State-cache retention repair failed: root set unavailable',
      }),
    );
  });
});
