/** WARP explanations over git-cas retained-materialization diagnostics. */
import type {
  MaterializationCacheEntryDiagnostic,
  MaterializationCacheInspection,
  MaterializationCacheRepair,
} from '../../../../src/ports/MaterializationCacheDiagnosticsPort.ts';
import type { DoctorFinding, FindingEvidence } from './types.ts';
import { CODES } from './codes.ts';

type MaterializationCacheInspectionContext = {
  readonly materializationCacheDiagnostics: {
    inspectCache(): Promise<MaterializationCacheInspection>;
  } | null;
  readonly writerHeads: ReadonlyArray<{
    writerId: string;
    sha: string | null;
  }>;
};

type EntryGroups = Readonly<{
  live: ReadonlyArray<MaterializationCacheEntryDiagnostic>;
  stale: ReadonlyArray<MaterializationCacheEntryDiagnostic>;
  expired: ReadonlyArray<MaterializationCacheEntryDiagnostic>;
  missing: ReadonlyArray<MaterializationCacheEntryDiagnostic>;
  malformed: ReadonlyArray<MaterializationCacheEntryDiagnostic>;
  collectible: ReadonlyArray<MaterializationCacheEntryDiagnostic>;
}>;

function inspectionEvidence(
  inspection: MaterializationCacheInspection,
  groups: EntryGroups,
): FindingEvidence {
  return {
    namespace: inspection.namespace,
    ref: inspection.ref,
    generation: inspection.generation,
    healthy: inspection.healthy,
    policy: inspection.policy,
    issues: [...inspection.issues],
    liveEntries: [...groups.live],
    staleEntries: [...groups.stale],
    expiredEntries: [...groups.expired],
    missingEntries: [...groups.missing],
    malformedEntries: [...groups.malformed],
    collectibleEntries: [...groups.collectible],
  };
}

export async function checkMaterializationCache(
  ctx: MaterializationCacheInspectionContext,
): Promise<DoctorFinding[]> {
  if (ctx.materializationCacheDiagnostics === null) { return []; }
  const inspection = await ctx.materializationCacheDiagnostics.inspectCache();
  const groups = groupEntries(inspection.entries, ctx.writerHeads);
  return materializationCacheFindings(inspection, groups);
}

function groupEntries(
  entries: ReadonlyArray<MaterializationCacheEntryDiagnostic>,
  writerHeads: MaterializationCacheInspectionContext['writerHeads'],
): EntryGroups {
  const currentFrontier = normalizedFrontier(writerHeads);
  const live = entries.filter((entry) => entry.status === 'live');
  return Object.freeze({
    live,
    stale: live.filter((entry) => (
      entry.coordinate !== null
      && normalizedFrontier(entry.coordinate.frontier) !== currentFrontier
    )),
    expired: entries.filter((entry) => entry.status === 'expired'),
    missing: entries.filter((entry) => entry.status === 'missing'),
    malformed: entries.filter((entry) => entry.status === 'malformed'),
    collectible: entries.filter((entry) => entry.collectible),
  });
}

function normalizedFrontier(
  frontier: ReadonlyArray<{ writerId: string; sha?: string | null; patchSha?: string }>,
): string {
  return frontier
    .flatMap((entry) => {
      const sha = entry.patchSha ?? entry.sha;
      return sha === null || sha === undefined ? [] : [`${entry.writerId}\0${sha}`];
    })
    .sort()
    .join('\n');
}

function materializationCacheFindings(
  inspection: MaterializationCacheInspection,
  groups: EntryGroups,
): DoctorFinding[] {
  const findings: DoctorFinding[] = [];
  const evidence = inspectionEvidence(inspection, groups);
  const candidates = [
    invalidCacheFinding(inspection, evidence),
    brokenEntriesFinding(groups.missing, 'missing', evidence),
    brokenEntriesFinding(groups.malformed, 'malformed', evidence),
    expiredEntriesFinding(groups.expired, evidence),
  ];
  for (const candidate of candidates) {
    if (candidate !== null) { findings.push(candidate); }
  }
  if (findings.length === 0) {
    findings.push(healthyCacheFinding(groups, evidence));
  }
  return findings;
}

function invalidCacheFinding(
  inspection: MaterializationCacheInspection,
  evidence: FindingEvidence,
): DoctorFinding | null {
  if (inspection.healthy || inspection.issues.length === 0) { return null; }
  return {
    id: 'materialization-cache-structure',
    status: 'fail',
    code: CODES.MATERIALIZATION_CACHE_INVALID,
    impact: 'data_integrity',
    message: `git-cas reported ${inspection.issues.length} materialization-cache structural issue(s)`,
    fix: 'Run `git warp doctor --repair-materialization-cache`; repair will remove invalid cache entries but cannot recreate missing bytes',
    evidence,
  };
}

function brokenEntriesFinding(
  entries: ReadonlyArray<MaterializationCacheEntryDiagnostic>,
  status: 'missing' | 'malformed',
  evidence: FindingEvidence,
): DoctorFinding | null {
  if (entries.length === 0) { return null; }
  return {
    id: `materialization-cache-${status}`,
    status: 'fail',
    code: status === 'missing'
      ? CODES.MATERIALIZATION_CACHE_ENTRY_MISSING
      : CODES.MATERIALIZATION_CACHE_ENTRY_MALFORMED,
    impact: 'data_integrity',
    message: `${entries.length} retained materialization cache entr${entries.length === 1 ? 'y is' : 'ies are'} ${status}`,
    fix: 'Run `git warp doctor --repair-materialization-cache`; authoritative WARP history remains the recovery source',
    evidence,
  };
}

function expiredEntriesFinding(
  entries: ReadonlyArray<MaterializationCacheEntryDiagnostic>,
  evidence: FindingEvidence,
): DoctorFinding | null {
  if (entries.length === 0) { return null; }
  return {
    id: 'materialization-cache-expired',
    status: 'warn',
    code: CODES.MATERIALIZATION_CACHE_ENTRY_EXPIRED,
    impact: 'hygiene',
    message: `${entries.length} retained materialization cache entr${entries.length === 1 ? 'y is' : 'ies are'} expired and collectible`,
    fix: 'Run `git warp doctor --repair-materialization-cache` to ask git-cas to sweep expired entries',
    evidence,
  };
}

function healthyCacheFinding(
  groups: EntryGroups,
  evidence: FindingEvidence,
): DoctorFinding {
  return {
    id: 'materialization-cache',
    status: 'ok',
    code: CODES.MATERIALIZATION_CACHE_OK,
    impact: 'data_integrity',
    message: [
      `git-cas validated ${groups.live.length} live retained materialization(s)`,
      `${groups.stale.length} stale coordinate(s)`,
      `${groups.collectible.length} collectible entr${groups.collectible.length === 1 ? 'y' : 'ies'}`,
    ].join('; '),
    evidence,
  };
}

export function materializationCacheRepairFinding(
  result: MaterializationCacheRepair,
): DoctorFinding {
  const partial = repairIsPartial(result.after);
  return {
    id: 'materialization-cache-repair',
    status: partial ? 'warn' : 'ok',
    code: partial
      ? CODES.MATERIALIZATION_CACHE_PARTIAL_REPAIR
      : CODES.MATERIALIZATION_CACHE_REPAIRED,
    impact: 'data_integrity',
    message: repairMessage(partial, result.removedKeys.length),
    evidence: {
      removedKeys: [...result.removedKeys],
      generation: result.generation,
      beforeHealthy: result.before.healthy,
      afterHealthy: result.after.healthy,
      afterIssues: [...result.after.issues],
    },
  };
}

function repairIsPartial(inspection: MaterializationCacheInspection): boolean {
  return !inspection.healthy || inspection.entries.some(
    (entry) => entry.status === 'missing' || entry.status === 'malformed',
  );
}

function repairMessage(partial: boolean, removed: number): string {
  if (partial) {
    return 'git-cas repaired recoverable materialization-cache metadata; unrecoverable entries remain reported';
  }
  return `git-cas repaired the materialization cache and removed ${removed} collectible entr${removed === 1 ? 'y' : 'ies'}`;
}

export function materializationCacheRepairFailureFinding(error: unknown): DoctorFinding {
  return {
    id: 'materialization-cache-repair',
    status: 'fail',
    code: CODES.CHECK_INTERNAL_ERROR,
    impact: 'data_integrity',
    message: `Materialization-cache repair failed: ${error instanceof Error ? error.message : String(error)}`,
    fix: 'Resolve the repository or git-cas error, then rerun `git warp doctor --repair-materialization-cache`',
  };
}
