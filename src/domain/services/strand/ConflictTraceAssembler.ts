/**
 * ConflictTraceAssembler — groups candidates into traces, filters, and hashes.
 *
 * @module domain/services/strand/ConflictTraceAssembler
 */

import ConflictAnchor from '../../types/conflict/ConflictAnchor.ts';
import ConflictParticipant from '../../types/conflict/ConflictParticipant.ts';
import ConflictReceiptRef from '../../types/conflict/ConflictReceiptRef.ts';
import ConflictTrace from '../../types/conflict/ConflictTrace.ts';
import ConflictWinner from '../../types/conflict/ConflictWinner.ts';
import { compareStrings } from '../../types/conflict/validation.ts';
import { inferCausalRelation } from './ConflictCandidateCollector.ts';
import { CONFLICT_ANALYSIS_VERSION } from './ConflictFrameLoader.ts';
import type ConflictCandidate from './ConflictCandidate.ts';
import type OpRecord from './OpRecord.ts';
import type ConflictTarget from '../../types/conflict/ConflictTarget.ts';
import type ConflictResolution from '../../types/conflict/ConflictResolution.ts';
import type ConflictDiagnostic from '../../types/conflict/ConflictDiagnostic.ts';
import type ConflictResolvedCoordinate from '../../types/conflict/ConflictResolvedCoordinate.ts';
import type { HashablePayload } from '../../types/conflict/HashablePayload.ts';
import type ConflictAnalysisRequest from './ConflictAnalysisRequest.ts';

type HashingService = {
  _hash(payload: HashablePayload): Promise<string>;
};

type ConflictKind = 'supersession' | 'redundancy' | 'eventual_override';

type GroupedConflict = {
  target: ConflictTarget;
  kind: ConflictKind;
  winner: OpRecord;
  losers: OpRecord[];
  resolution: ConflictResolution;
  noteCodes: Set<string>;
};

// ── Grouping ────────────────────────────────────────────────────────

function candidateGroupKey(candidate: ConflictCandidate): string {
  return [
    candidate.kind,
    candidate.target.targetDigest,
    new ConflictAnchor({
      patchSha: candidate.winner.patchSha,
      writerId: candidate.winner.writerId,
      lamport: candidate.winner.lamport,
      opIndex: candidate.winner.opIndex,
    }).toString(),
    candidate.resolution.reducerId,
    candidate.resolution.basis.code,
    candidate.resolution.winnerMode,
  ].join('|');
}

/**
 * Groups conflict candidates by their deterministic group key.
 */
export function groupCandidates(candidates: ConflictCandidate[]): Map<string, GroupedConflict> {
  const grouped = new Map<string, GroupedConflict>();
  for (const candidate of candidates) {
    const key = candidateGroupKey(candidate);
    if (!grouped.has(key)) {
      grouped.set(key, {
        target: candidate.target,
        kind: candidate.kind,
        winner: candidate.winner,
        losers: [],
        resolution: candidate.resolution,
        noteCodes: new Set(),
      });
    }
    const group = grouped.get(key)!;
    group.losers.push(candidate.loser);
    for (const code of candidate.noteCodes) {
      group.noteCodes.add(code);
    }
  }
  return grouped;
}

// ── Winner/loser building ───────────────────────────────────────────

function buildLosers(
  group: GroupedConflict,
  evidence: 'summary' | 'standard' | 'full',
): ConflictParticipant[] {
  return group.losers
    .map((loser) => ConflictParticipant.fromRecord({ winner: group.winner, loser, kind: group.kind, evidence, inferCausalRelation: (w, l) => inferCausalRelation(w as OpRecord, l as OpRecord) }))
    .sort((a, b) => ConflictAnchor.compare(a.anchor, b.anchor));
}

// ── Trace building ──────────────────────────────────────────────────

function buildReceiptRef(record: OpRecord): ConflictReceiptRef {
  return new ConflictReceiptRef({
    patchSha: record.patchSha,
    lamport: record.lamport,
    opIndex: record.receiptOpIndex,
  });
}

function buildTraceEvidence(
  group: GroupedConflict,
  evidence: 'summary' | 'standard' | 'full',
): { level: string; patchRefs: string[]; receiptRefs: ConflictReceiptRef[] } {
  return {
    level: evidence,
    patchRefs: [...new Set([group.winner.patchSha, ...group.losers.map((loser) => loser.patchSha)])].sort(compareStrings),
    receiptRefs: [buildReceiptRef(group.winner), ...group.losers.map(buildReceiptRef)].sort((a, b) => ConflictReceiptRef.compare(a, b)),
  };
}

type WhyFingerprintInput = {
  readonly targetDigest: string;
  readonly kind: string;
  readonly reducerId: string;
  readonly basis: string;
  readonly winnerEffectDigest: string;
  readonly loserEffectDigests: readonly string[];
};

function buildWhyFingerprintInput(group: GroupedConflict, losers: ConflictParticipant[]): WhyFingerprintInput {
  return {
    targetDigest: group.target.targetDigest,
    kind: group.kind,
    reducerId: group.resolution.reducerId,
    basis: group.resolution.basis.code,
    winnerEffectDigest: group.winner.effectDigest,
    loserEffectDigests: losers.map((loser) => loser.effectDigest).sort(compareStrings),
  };
}

type ConflictIdInput = {
  readonly analysisVersion: string;
  readonly resolvedCoordinate: ConflictResolvedCoordinate;
  readonly kind: string;
  readonly targetDigest: string;
  readonly reducerId: string;
  readonly winnerAnchor: string;
  readonly loserAnchors: readonly string[];
};

function buildConflictIdInput({
  group,
  winner,
  losers,
  resolvedCoordinate,
}: {
  group: GroupedConflict;
  winner: ConflictWinner;
  losers: ConflictParticipant[];
  resolvedCoordinate: ConflictResolvedCoordinate;
}): ConflictIdInput {
  return {
    analysisVersion: CONFLICT_ANALYSIS_VERSION,
    resolvedCoordinate,
    kind: group.kind,
    targetDigest: group.target.targetDigest,
    reducerId: group.resolution.reducerId,
    winnerAnchor: winner.anchor.toString(),
    loserAnchors: losers.map((loser) => loser.anchor.toString()),
  };
}

async function buildConflictTrace(
  service: HashingService,
  {
    group,
    evidence,
    resolvedCoordinate,
  }: {
    group: GroupedConflict;
    evidence: 'summary' | 'standard' | 'full';
    resolvedCoordinate: ConflictResolvedCoordinate;
  },
): Promise<ConflictTrace> {
  const winner = ConflictWinner.fromRecord(group.winner);
  const losers = buildLosers(group, evidence);
  const whyFingerprint = await service._hash(buildWhyFingerprintInput(group, losers));
  const conflictId = await service._hash(buildConflictIdInput({ group, winner, losers, resolvedCoordinate }));
  const classificationNotes = evidence === 'full' ? [...group.noteCodes].sort(compareStrings) : undefined;
  return new ConflictTrace({
    conflictId,
    kind: group.kind,
    target: group.target,
    winner,
    losers,
    resolution: group.resolution,
    whyFingerprint,
    ...(classificationNotes !== undefined ? { classificationNotes } : {}),
    evidence: buildTraceEvidence(group, evidence),
  });
}

/**
 * Transforms grouped conflicts into sorted, finalized ConflictTrace records.
 */
export async function buildConflictTraces(
  service: HashingService,
  {
    grouped,
    evidence,
    resolvedCoordinate,
  }: {
    grouped: Iterable<GroupedConflict>;
    evidence: 'summary' | 'standard' | 'full';
    resolvedCoordinate: ConflictResolvedCoordinate;
  },
): Promise<ConflictTrace[]> {
  const traces: ConflictTrace[] = [];
  for (const group of grouped) {
    traces.push(await buildConflictTrace(service, { group, evidence, resolvedCoordinate }));
  }
  traces.sort((a, b) => ConflictTrace.compare(a, b));
  return traces;
}

// ── Filtering ───────────────────────────────────────────────────────

/**
 * Filters an array of conflict traces against analysis options.
 */
export function filterTraces(traces: ConflictTrace[], request: ConflictAnalysisRequest): ConflictTrace[] {
  return traces.filter((trace) => request.matchesTrace(trace));
}

// ── Snapshot hashing ────────────────────────────────────────────────

function diagnosticCodes(diagnostics: ConflictDiagnostic[]): string[] {
  return diagnostics.map((d) => d.code).sort(compareStrings);
}

/**
 * Computes a snapshot hash over the entire analysis result.
 */
export async function buildAnalysisSnapshotHash(
  service: HashingService,
  {
    resolvedCoordinate,
    request,
    truncated,
    diagnostics,
    traces,
  }: {
    resolvedCoordinate: ConflictResolvedCoordinate;
    request: ConflictAnalysisRequest;
    truncated: boolean;
    diagnostics: ConflictDiagnostic[];
    traces: ConflictTrace[];
  },
): Promise<string> {
  return await service._hash({
    analysisVersion: CONFLICT_ANALYSIS_VERSION,
    resolvedCoordinate,
    filters: request.toSnapshotFilterRecord(),
    truncation: truncated,
    conflictIds: traces.map((t) => t.conflictId).sort(compareStrings),
    diagnosticCodes: diagnosticCodes(diagnostics),
  });
}

/**
 * Computes a snapshot hash for an analysis that found zero conflicts.
 */
export async function buildEmptySnapshotHash(
  service: HashingService,
  {
    resolvedCoordinate,
    request,
  }: {
    resolvedCoordinate: ConflictResolvedCoordinate;
    request: ConflictAnalysisRequest;
  },
): Promise<string> {
  return await service._hash({
    analysisVersion: CONFLICT_ANALYSIS_VERSION,
    resolvedCoordinate,
    filters: request.toSnapshotFilterRecord(),
    truncation: false,
    conflictIds: [],
    diagnosticCodes: [],
  });
}
