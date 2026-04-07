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

import ConflictCandidate from './ConflictCandidate.js';
import OpRecord from './OpRecord.js';

const CLASSIFICATION_NOTES = Object.freeze({
  RECEIPT_SUPERSEDED: 'receipt_superseded',
  RECEIPT_REDUNDANT: 'receipt_redundant',
  SAME_TARGET: 'same_target',
  DIFFERENT_WRITER: 'different_writer',
  DIGEST_DIFFERS: 'digest_differs',
  EFFECTIVE_THEN_LOST: 'effective_then_lost',
  REPLAY_EQUIVALENT_EFFECT: 'replay_equivalent_effect',
  CONCURRENT_TO_WINNER: 'concurrent_to_winner',
  ORDERED_BEFORE_WINNER: 'ordered_before_winner',
});

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
 * Wraps a winning OpRecord into a ConflictWinner.
 *
 * @param {OpRecord} winner - The winning operation record.
 * @returns {ConflictWinner}
 */
function buildWinner(winner) {
  return new ConflictWinner({
    anchor: ConflictAnchor.fromRecord(winner),
    effectDigest: winner.effectDigest,
  });
}

/**
 * Builds a ConflictParticipant for a single loser.
 *
 * @param {OpRecord} winner - The winning operation record.
 * @param {OpRecord} loser - The losing operation record.
 * @param {'supersession'|'eventual_override'|'redundancy'} kind - The conflict kind.
 * @param {'summary'|'standard'|'full'} evidence - The evidence level.
 * @returns {ConflictParticipant}
 */
function buildLoserParticipant(winner, loser, kind, evidence) {
  const relation = inferCausalRelation(winner, loser);
  const notes = evidence === 'full' ? buildLoserNotes(winner, loser, kind, relation) : undefined;
  return new ConflictParticipant({
    anchor: ConflictAnchor.fromRecord(loser),
    effectDigest: loser.effectDigest,
    causalRelationToWinner: relation,
    structurallyDistinctAlternative: loser.effectDigest !== winner.effectDigest,
    replayableFromAnchors: true,
    notes,
  });
}

/**
 * Builds the sorted array of ConflictParticipant losers from a grouped conflict.
 *
 * @param {GroupedConflict} group - The grouped conflict.
 * @param {'summary'|'standard'|'full'} evidence - The evidence level.
 * @returns {ConflictParticipant[]}
 */
function buildLosers(group, evidence) {
  return group.losers
    .map((loser) => buildLoserParticipant(group.winner, loser, group.kind, evidence))
    .sort((a, b) => ConflictAnchor.compare(a.anchor, b.anchor));
}

/**
 * Builds detailed classification notes for a loser participant.
 *
 * @param {OpRecord} winner
 * @param {OpRecord} loser
 * @param {'supersession'|'eventual_override'|'redundancy'} kind
 * @param {ConflictParticipant['causalRelationToWinner']} relation
 * @returns {string[]}
 */
function buildLoserNotes(winner, loser, kind, relation) {
  const notes = [CLASSIFICATION_NOTES.SAME_TARGET];
  appendKindNotes(notes, kind);
  appendRelationNotes(notes, relation);
  if (loser.writerId !== winner.writerId) {
    notes.push(CLASSIFICATION_NOTES.DIFFERENT_WRITER);
  }
  return [...new Set(notes)].sort(compareStrings);
}

/**
 * Appends kind-specific classification notes.
 *
 * @param {string[]} notes
 * @param {'supersession'|'eventual_override'|'redundancy'} kind
 */
function appendKindNotes(notes, kind) {
  if (kind === 'supersession') {
    notes.push(CLASSIFICATION_NOTES.RECEIPT_SUPERSEDED);
  }
  if (kind === 'redundancy') {
    notes.push(CLASSIFICATION_NOTES.RECEIPT_REDUNDANT, CLASSIFICATION_NOTES.REPLAY_EQUIVALENT_EFFECT);
  }
  if (kind === 'eventual_override') {
    notes.push(CLASSIFICATION_NOTES.EFFECTIVE_THEN_LOST, CLASSIFICATION_NOTES.DIGEST_DIFFERS);
  }
}

/**
 * Appends causal-relation classification notes.
 *
 * @param {string[]} notes
 * @param {ConflictParticipant['causalRelationToWinner']} relation
 */
function appendRelationNotes(notes, relation) {
  if (relation === 'concurrent') {
    notes.push(CLASSIFICATION_NOTES.CONCURRENT_TO_WINNER);
  }
  if (relation === 'ordered') {
    notes.push(CLASSIFICATION_NOTES.ORDERED_BEFORE_WINNER);
  }
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
  const winner = buildWinner(group.winner);
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
  return traces.filter((trace) => {
    if (request.kinds !== null && !request.kinds.includes(trace.kind)) {
      return false;
    }
    if (typeof request.entityId === 'string' && request.entityId.length > 0 && !trace.target.touchesEntity(request.entityId)) {
      return false;
    }
    if (request.target !== null && request.target !== undefined && !trace.target.matchesSelector(request.target)) {
      return false;
    }
    if (typeof request.writerId === 'string' && request.writerId.length > 0 && !trace.touchesWriter(request.writerId)) {
      return false;
    }
    return true;
  });
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
