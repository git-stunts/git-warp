/**
 * ConflictTraceAssembler — groups candidates into traces, filters, and hashes.
 *
 * @module domain/services/strand/ConflictTraceAssembler
 */

import ConflictAnchor from '../../types/conflict/ConflictAnchor.js';
import ConflictParticipant from '../../types/conflict/ConflictParticipant.js';
import ConflictTrace from '../../types/conflict/ConflictTrace.js';
import ConflictWinner from '../../types/conflict/ConflictWinner.js';
import { compareStrings } from '../../types/conflict/validation.js';
import { inferCausalRelation } from './ConflictCandidateCollector.js';
import {
  CONFLICT_ANALYSIS_VERSION,
} from './ConflictFrameLoader.js';



// ── Grouping ────────────────────────────────────────────────────────

/**
 * Builds a deterministic group key for deduplicating conflict candidates.
 *
 * @param {ConflictCandidate} candidate - The candidate to key.
 * @returns {string} Pipe-delimited group key.
 */
function candidateGroupKey(candidate) {
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
 * @typedef {{
 *   target: import('../../types/conflict/ConflictTarget.js').default,
 *   kind: 'supersession'|'eventual_override'|'redundancy',
 *   winner: OpRecord,
 *   losers: OpRecord[],
 *   resolution: import('../../types/conflict/ConflictResolution.js').default,
 *   noteCodes: Set<string>
 * }} GroupedConflict
 */

/**
 * Groups conflict candidates by their deterministic group key.
 *
 * @param {ConflictCandidate[]} candidates - The raw conflict candidates.
 * @returns {Map<string, GroupedConflict>} Grouped conflicts keyed by group key.
 */
export function groupCandidates(candidates) {
  const grouped = new Map();
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
    const group = grouped.get(key);
    group.losers.push(candidate.loser);
    for (const code of candidate.noteCodes) {
      group.noteCodes.add(code);
    }
  }
  return grouped;
}

// ── Winner/loser building ───────────────────────────────────────────

/**
 * Builds the sorted array of ConflictParticipant losers from a grouped conflict.
 *
 * @param {GroupedConflict} group - The grouped conflict.
 * @param {'summary'|'standard'|'full'} evidence - The evidence level.
 * @returns {ConflictParticipant[]}
 */
function buildLosers(group, evidence) {
  return group.losers
    .map((loser) => ConflictParticipant.fromRecord({ winner: group.winner, loser, kind: group.kind, evidence, inferCausalRelation }))
    .sort((a, b) => ConflictAnchor.compare(a.anchor, b.anchor));
}

// ── Trace building ──────────────────────────────────────────────────

/**
 * Builds a receipt reference from an operation record.
 *
 * @param {OpRecord} record
 * @returns {{ patchSha: string, lamport: number, opIndex: number }}
 */
function buildReceiptRef(record) {
  return { patchSha: record.patchSha, lamport: record.lamport, opIndex: record.receiptOpIndex };
}

/**
 * Compares two receipt references for deterministic sorting.
 *
 * @param {{ patchSha: string, opIndex: number }} a
 * @param {{ patchSha: string, opIndex: number }} b
 * @returns {number}
 */
function compareReceiptRefs(a, b) {
  return compareStrings(`${a.patchSha}:${a.opIndex}`, `${b.patchSha}:${b.opIndex}`);
}

/**
 * Builds the evidence section of a conflict trace.
 *
 * @param {GroupedConflict} group
 * @param {'summary'|'standard'|'full'} evidence
 * @returns {{ level: string, patchRefs: string[], receiptRefs: Array<{ patchSha: string, lamport: number, opIndex: number }> }}
 */
function buildTraceEvidence(group, evidence) {
  return {
    level: evidence,
    patchRefs: [...new Set([group.winner.patchSha, ...group.losers.map((loser) => loser.patchSha)])].sort(compareStrings),
    receiptRefs: [buildReceiptRef(group.winner), ...group.losers.map(buildReceiptRef)].sort(compareReceiptRefs),
  };
}

/**
 * Builds the input for the why-fingerprint hash.
 *
 * @param {GroupedConflict} group
 * @param {ConflictParticipant[]} losers
 * @returns {Record<string, unknown>}
 */
function buildWhyFingerprintInput(group, losers) {
  return {
    targetDigest: group.target.targetDigest,
    kind: group.kind,
    reducerId: group.resolution.reducerId,
    basis: group.resolution.basis.code,
    winnerEffectDigest: group.winner.effectDigest,
    loserEffectDigests: losers.map((loser) => loser.effectDigest).sort(compareStrings),
  };
}

/**
 * Builds the input for the conflict ID hash.
 *
 * @param {{ group: GroupedConflict, winner: ConflictWinner, losers: ConflictParticipant[], resolvedCoordinate: unknown }} options
 * @returns {Record<string, unknown>}
 */
function buildConflictIdInput({ group, winner, losers, resolvedCoordinate }) {
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

/**
 * Builds a single ConflictTrace from a grouped conflict.
 *
 * @param {{ _hash: (payload: unknown) => Promise<string> }} service
 * @param {{ group: GroupedConflict, evidence: 'summary'|'standard'|'full', resolvedCoordinate: unknown }} options
 * @returns {Promise<ConflictTrace>}
 */
async function buildConflictTrace(service, { group, evidence, resolvedCoordinate }) {
  const winner = ConflictWinner.fromRecord(group.winner);
  const losers = buildLosers(group, evidence);
  const whyFingerprint = await service._hash(buildWhyFingerprintInput(group, losers));
  const conflictId = await service._hash(buildConflictIdInput({ group, winner, losers, resolvedCoordinate }));
  return new ConflictTrace({
    conflictId,
    kind: group.kind,
    target: group.target,
    winner, losers,
    resolution: group.resolution,
    whyFingerprint,
    classificationNotes: evidence === 'full' ? [...group.noteCodes].sort(compareStrings) : undefined,
    evidence: buildTraceEvidence(group, evidence),
  });
}

/**
 * Transforms grouped conflicts into sorted, finalized ConflictTrace records.
 *
 * @param {{ _hash: (payload: unknown) => Promise<string> }} service
 * @param {{ grouped: Iterable<GroupedConflict>, evidence: 'summary'|'standard'|'full', resolvedCoordinate: unknown }} options
 * @returns {Promise<ConflictTrace[]>}
 */
export async function buildConflictTraces(service, { grouped, evidence, resolvedCoordinate }) {
  const traces = [];
  for (const group of grouped) {
    traces.push(await buildConflictTrace(service, { group, evidence, resolvedCoordinate }));
  }
  traces.sort((a, b) => ConflictTrace.compare(a, b));
  return traces;
}

// ── Filtering ───────────────────────────────────────────────────────

/**
 * Filters an array of conflict traces against analysis options.
 *
 * @param {ConflictTrace[]} traces
 * @param {import('./ConflictAnalysisRequest.js').default} request
 * @returns {ConflictTrace[]}
 */
export function filterTraces(traces, request) {
  return traces.filter((trace) => request.matchesTrace(trace));
}

// ── Snapshot hashing ────────────────────────────────────────────────

/**
 * Extracts sorted diagnostic codes for inclusion in hashes.
 *
 * @param {import('../../types/conflict/ConflictDiagnostic.js').default[]} diagnostics
 * @returns {string[]}
 */
function diagnosticCodes(diagnostics) {
  return diagnostics.map((d) => d.code).sort(compareStrings);
}

/**
 * Computes a snapshot hash over the entire analysis result.
 *
 * @param {{ _hash: (payload: unknown) => Promise<string> }} service
 * @param {{
 *   resolvedCoordinate: unknown,
 *   request: import('./ConflictAnalysisRequest.js').default,
 *   truncated: boolean,
 *   diagnostics: import('../../types/conflict/ConflictDiagnostic.js').default[],
 *   traces: ConflictTrace[]
 * }} options
 * @returns {Promise<string>}
 */
export async function buildAnalysisSnapshotHash(service, { resolvedCoordinate, request, truncated, diagnostics, traces }) {
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
 *
 * @param {{ _hash: (payload: unknown) => Promise<string> }} service
 * @param {{ resolvedCoordinate: unknown, request: import('./ConflictAnalysisRequest.js').default }} options
 * @returns {Promise<string>}
 */
export async function buildEmptySnapshotHash(service, { resolvedCoordinate, request }) {
  return await service._hash({
    analysisVersion: CONFLICT_ANALYSIS_VERSION,
    resolvedCoordinate,
    filters: request.toSnapshotFilterRecord(),
    truncation: false,
    conflictIds: [],
    diagnosticCodes: [],
  });
}
