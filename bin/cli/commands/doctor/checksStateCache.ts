import type WarpStateCacheRetentionReport from '../../../../src/domain/services/state/WarpStateCacheRetentionReport.ts';
import type WarpStateCacheRepairResult from '../../../../src/domain/services/state/WarpStateCacheRepairResult.ts';
import type { DoctorFinding, FindingEvidence } from './types.ts';
import { CODES } from './codes.ts';

type StateCacheInspectionContext = {
  readonly stateCache: {
    inspectRetention(): Promise<WarpStateCacheRetentionReport>;
  } | null;
};

function retentionEvidence(report: WarpStateCacheRetentionReport) {
  return {
    liveSnapshotIds: [...report.liveSnapshotIds],
    anchoredSnapshotIds: [...report.anchoredSnapshotIds],
    unanchoredSnapshotIds: [...report.unanchoredSnapshotIds],
    missingSnapshotIds: [...report.missingSnapshotIds],
    wrongTypeSnapshotIds: [...report.wrongTypeSnapshotIds],
    staleRootNames: [...report.staleRootNames],
    mismatchedRootNames: [...report.mismatchedRootNames],
    rootSetError: report.rootSetError,
  };
}

export async function checkStateCacheRetention(
  ctx: StateCacheInspectionContext,
): Promise<DoctorFinding[]> {
  if (ctx.stateCache === null) { return []; }
  const report = await ctx.stateCache.inspectRetention();
  return retentionFindings(report);
}

function retentionFindings(report: WarpStateCacheRetentionReport): DoctorFinding[] {
  const findings: DoctorFinding[] = [];
  const evidence = retentionEvidence(report);
  const candidates = [
    invalidRootSetFinding(report, evidence),
    missingPayloadFinding(report, evidence),
    wrongTypeFinding(report, evidence),
    unanchoredPayloadFinding(report, evidence),
    staleRootFinding(report, evidence),
  ];
  for (const candidate of candidates) {
    if (candidate !== null) { findings.push(candidate); }
  }
  if (findings.length === 0) { findings.push(healthyRetentionFinding(report, evidence)); }
  return findings;
}

function invalidRootSetFinding(
  report: WarpStateCacheRetentionReport,
  evidence: FindingEvidence,
): DoctorFinding | null {
  if (report.rootSetError === null) { return null; }
  return {
    id: 'state-cache-root-set', status: 'fail', code: CODES.STATE_CACHE_ROOT_SET_INVALID,
    impact: 'data_integrity', message: `State-cache RootSet is invalid: ${report.rootSetError}`,
    fix: 'Run `git warp doctor --repair-state-cache` after confirming the state-cache index is authoritative', evidence,
  };
}

function missingPayloadFinding(
  report: WarpStateCacheRetentionReport,
  evidence: FindingEvidence,
): DoctorFinding | null {
  if (report.missingSnapshotIds.length === 0) { return null; }
  return {
    id: 'state-cache-missing-payloads', status: 'fail', code: CODES.STATE_CACHE_PAYLOAD_MISSING,
    impact: 'data_integrity', message: `${report.missingSnapshotIds.length} state-cache payload(s) no longer exist in Git`,
    fix: 'Run `git warp doctor --repair-state-cache`; missing payload bytes cannot be recovered', evidence,
  };
}

function wrongTypeFinding(
  report: WarpStateCacheRetentionReport,
  evidence: FindingEvidence,
): DoctorFinding | null {
  if (report.wrongTypeSnapshotIds.length === 0) { return null; }
  return {
    id: 'state-cache-wrong-type', status: 'fail', code: CODES.STATE_CACHE_PAYLOAD_WRONG_TYPE,
    impact: 'data_integrity', message: `${report.wrongTypeSnapshotIds.length} state-cache payload ref(s) do not identify Git trees`,
    fix: 'Rebuild the affected state-cache snapshots from authoritative WARP history', evidence,
  };
}

function unanchoredPayloadFinding(
  report: WarpStateCacheRetentionReport,
  evidence: FindingEvidence,
): DoctorFinding | null {
  if (report.unanchoredSnapshotIds.length === 0) { return null; }
  return {
    id: 'state-cache-unanchored-payloads', status: 'fail', code: CODES.STATE_CACHE_PAYLOAD_UNANCHORED,
    impact: 'data_integrity', message: `${report.unanchoredSnapshotIds.length} live state-cache payload(s) are not protected from Git GC`,
    fix: 'Run `git warp doctor --repair-state-cache` before any repository cleanup', evidence,
  };
}

function staleRootFinding(
  report: WarpStateCacheRetentionReport,
  evidence: FindingEvidence,
): DoctorFinding | null {
  if (report.staleRootNames.length === 0) { return null; }
  return {
    id: 'state-cache-stale-roots', status: 'warn', code: CODES.STATE_CACHE_STALE_ROOTS,
    impact: 'hygiene', message: `${report.staleRootNames.length} stale state-cache RootSet entry or entries retain evicted payloads`,
    fix: 'Run `git warp doctor --repair-state-cache` to release stale roots', evidence,
  };
}

function healthyRetentionFinding(
  report: WarpStateCacheRetentionReport,
  evidence: FindingEvidence,
): DoctorFinding {
  return {
    id: 'state-cache-retention', status: 'ok', code: CODES.STATE_CACHE_RETENTION_OK,
    impact: 'data_integrity',
    message: `All ${report.liveSnapshotIds.length} live state-cache payload(s) are Git-anchored`,
    evidence,
  };
}

export function stateCacheRepairFinding(result: WarpStateCacheRepairResult): DoctorFinding {
  const partial = result.unrecoverableSnapshotIds.length > 0;
  return {
    id: 'state-cache-retention-repair',
    status: partial ? 'warn' : 'ok',
    code: partial
      ? CODES.STATE_CACHE_RETENTION_PARTIAL_REPAIR
      : CODES.STATE_CACHE_RETENTION_REPAIRED,
    impact: 'data_integrity',
    message: partial
      ? 'State-cache retention repair anchored every recoverable payload; some payloads were already missing'
      : 'State-cache retention repair anchored the live index and released stale roots',
    evidence: {
      anchoredSnapshotIds: [...result.anchoredSnapshotIds],
      unrecoverableSnapshotIds: [...result.unrecoverableSnapshotIds],
      removedStaleRootNames: [...result.removedStaleRootNames],
    },
  };
}

export function stateCacheRepairFailureFinding(error: unknown): DoctorFinding {
  return {
    id: 'state-cache-retention-repair',
    status: 'fail',
    code: CODES.CHECK_INTERNAL_ERROR,
    impact: 'data_integrity',
    message: `State-cache retention repair failed: ${error instanceof Error ? error.message : String(error)}`,
    fix: 'Resolve the repository or RootSet error, then rerun `git warp doctor --repair-state-cache`',
  };
}
