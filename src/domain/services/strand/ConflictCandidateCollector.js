/**
 * ConflictCandidateCollector — builds op records and classifies conflict candidates.
 *
 * Owns the per-frame analysis pipeline: raw op → canonical op → target identity →
 * effect digest → OpRecord → immediate/eventual candidate classification.
 *
 * @module domain/services/strand/ConflictCandidateCollector
 */

import { normalizeRawOp, OP_STRATEGIES } from '../JoinReducer.js';
import { createEventId } from '../../utils/EventId.js';
import { decodeEdgeKey } from '../KeyCodec.js';
import ConflictDiagnostic from '../../types/conflict/ConflictDiagnostic.js';
import ConflictResolution from '../../types/conflict/ConflictResolution.js';
import ConflictTarget from '../../types/conflict/ConflictTarget.js';
import { compareStrings } from '../../types/conflict/validation.js';
import ConflictCandidate from './ConflictCandidate.js';
import OpRecord from './OpRecord.js';

export const CONFLICT_REDUCER_ID = 'join-reducer-v5';

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

// ── Shared helpers ──────────────────────────────────────────────────

/**
 * Resolves a canonical op type to its TickReceipt-compatible name.
 *
 * @param {string} opType - The canonical op type.
 * @returns {string|undefined} The receipt name, or undefined for unknown types.
 */
function receiptNameForOp(opType) {
  const strategy = OP_STRATEGIES.get(opType);
  return strategy !== undefined ? strategy.receiptName : undefined;
}

/**
 * Shallow-clones a raw object.
 *
 * @param {Record<string, unknown>} raw - The object to clone.
 * @returns {Record<string, unknown>} A shallow copy.
 */
function cloneObject(raw) {
  return /** @type {Record<string, unknown>} */ ({ ...raw });
}

/**
 * Composite key from target digest and effect digest.
 *
 * @param {ConflictTarget} target - The conflict target.
 * @param {string} effectDigest - The effect digest.
 * @returns {string} Composite lookup key.
 */
function effectKey(target, effectDigest) {
  return `${target.targetDigest}:${effectDigest}`;
}

/**
 * Wraps a normalized effect payload with target and op-type metadata for hashing.
 *
 * @param {ConflictTarget} target - The conflict target.
 * @param {string} opType - The operation type name.
 * @param {Record<string, unknown>} payload - The normalized effect payload.
 * @returns {Record<string, unknown>} Wrapped effect record.
 */
function buildEffectPayload(target, opType, payload) {
  return { targetKind: target.targetKind, targetDigest: target.targetDigest, opType, payload };
}

/**
 * Deduplicates and sorts classification note codes.
 *
 * @param {string[]} noteCodes - Raw note codes.
 * @returns {string[]} Sorted deduplicated note codes.
 */
function normalizeNoteCodes(noteCodes) {
  return [...new Set(noteCodes)].sort(compareStrings);
}

/**
 * Appends a diagnostic to the accumulator.
 *
 * @param {ConflictDiagnostic[]} diagnostics - The diagnostics accumulator.
 * @param {{ code: string, message: string, severity?: 'warning'|'error', data?: Record<string, unknown> }} options
 */
function pushDiagnostic(diagnostics, { code, message, severity = 'warning', data }) {
  diagnostics.push(new ConflictDiagnostic({ code, severity, message, data }));
}

// ── Causal relation ─────────────────────────────────────────────────

/**
 * Determines the causal relationship between a winning and losing op record.
 *
 * @param {OpRecord} winner - The winning operation record.
 * @param {OpRecord} loser - The losing operation record.
 * @returns {'concurrent'|'ordered'|'replay_equivalent'|'reducer_collapsed'|undefined} Causal relation.
 */
export function inferCausalRelation(winner, loser) {
  if (winner.effectDigest === loser.effectDigest) {
    return 'replay_equivalent';
  }
  return isCausallyOrdered(winner, loser) ? 'ordered' : 'concurrent';
}

/**
 * Checks whether either record causally observes the other.
 *
 * @param {OpRecord} winner - The winning operation record.
 * @param {OpRecord} loser - The losing operation record.
 * @returns {boolean} True if one record causally precedes the other.
 */
function isCausallyOrdered(winner, loser) {
  if ((winner.context.get(loser.writerId) ?? -1) >= loser.lamport) {
    return true;
  }
  return (loser.context.get(winner.writerId) ?? -1) >= winner.lamport;
}

// ── Effect normalization ────────────────────────────────────────────

/**
 * Normalizes observed dots into a sorted array of strings.
 *
 * @param {unknown} observedDots - Raw observed dots value.
 * @returns {string[]} Sorted array of dot strings.
 */
function normalizeObservedDots(observedDots) {
  if (observedDots === null || observedDots === undefined) {
    return [];
  }
  return [.../** @type {Iterable<string>} */ (observedDots)].sort(compareStrings);
}

/**
 * Extracts the normalized effect payload for a given op type.
 *
 * @param {ConflictTarget} _target - Unused (signature consistency).
 * @param {string} opType - The receipt operation type name.
 * @param {Record<string, unknown>} canonOp - The canonical operation record.
 * @returns {Record<string, unknown>|null} Normalized effect payload or null.
 */
function normalizeEffectPayload(_target, opType, canonOp) {
  const effectFactories = {
    /** Extracts the dot from a NodeAdd. */
    NodeAdd: () => ({ dot: canonOp['dot'] ?? null }),
    /** Extracts observed dots from a NodeTombstone. */
    NodeTombstone: () => ({ observedDots: normalizeObservedDots(canonOp['observedDots']) }),
    /** Extracts the dot from an EdgeAdd. */
    EdgeAdd: () => ({ dot: canonOp['dot'] ?? null }),
    /** Extracts observed dots from an EdgeTombstone. */
    EdgeTombstone: () => ({ observedDots: normalizeObservedDots(canonOp['observedDots']) }),
    /** Extracts the value from a PropSet (legacy). */
    PropSet: () => ({ value: canonOp['value'] ?? null }),
    /** Extracts the value from a NodePropSet. */
    NodePropSet: () => ({ value: canonOp['value'] ?? null }),
    /** Extracts the value from an EdgePropSet. */
    EdgePropSet: () => ({ value: canonOp['value'] ?? null }),
    /** Extracts the oid from a BlobValue. */
    BlobValue: () => ({ oid: canonOp['oid'] ?? null }),
  };
  const factory = effectFactories[opType];
  return factory !== undefined ? factory() : null;
}

// ── Target identity ─────────────────────────────────────────────────

/**
 * Builds a node-level target identity.
 *
 * @param {Record<string, unknown>} canonOp - The canonical operation record.
 * @param {string} receiptTarget - The receipt target string.
 * @returns {{ targetKind: string, entityId?: string }|null}
 */
function buildNodeTargetIdentity(canonOp, receiptTarget) {
  const nodeVal = canonOp['node'];
  const entityId = typeof nodeVal === 'string' && nodeVal.length > 0
    ? nodeVal
    : (receiptTarget !== '*' ? receiptTarget : null);
  return entityId !== null ? { targetKind: 'node', entityId } : null;
}

/**
 * Builds an edge target from canonical op fields.
 *
 * @param {Record<string, unknown>} canonOp - The canonical operation record.
 * @returns {{ targetKind: string, from: string, to: string, label: string, edgeKey: string }|null}
 */
function buildEdgeTargetFromOp(canonOp) {
  const fromVal = canonOp['from'];
  const toVal = canonOp['to'];
  const labelVal = canonOp['label'];
  if (typeof fromVal === 'string' && typeof toVal === 'string' && typeof labelVal === 'string') {
    return { targetKind: 'edge', from: fromVal, to: toVal, label: labelVal, edgeKey: `${fromVal}\0${toVal}\0${labelVal}` };
  }
  return null;
}

/**
 * Builds an edge target by decoding the receipt target string.
 *
 * @param {string} receiptTarget - The receipt target string.
 * @returns {{ targetKind: string, from: string, to: string, label: string, edgeKey: string }|null}
 */
function buildEdgeTargetFromReceipt(receiptTarget) {
  if (receiptTarget === '*') {
    return null;
  }
  const decoded = decodeEdgeKey(receiptTarget);
  if (!decoded.from || !decoded.to || !decoded.label) {
    return null;
  }
  return { targetKind: 'edge', from: decoded.from, to: decoded.to, label: decoded.label, edgeKey: receiptTarget };
}

/**
 * Builds an edge-level target identity.
 *
 * @param {Record<string, unknown>} canonOp - The canonical operation record.
 * @param {string} receiptTarget - The receipt target string.
 * @returns {{ targetKind: string, [k: string]: unknown }|null}
 */
function buildEdgeTargetIdentity(canonOp, receiptTarget) {
  return buildEdgeTargetFromOp(canonOp) ?? buildEdgeTargetFromReceipt(receiptTarget);
}

/**
 * Builds a node-property target identity.
 *
 * @param {Record<string, unknown>} canonOp - The canonical operation record.
 * @returns {{ targetKind: string, entityId: string, propertyKey: string }|null}
 */
function buildNodePropertyTargetIdentity(canonOp) {
  const nodeVal = canonOp['node'];
  const keyVal = canonOp['key'];
  if (typeof nodeVal !== 'string' || typeof keyVal !== 'string') {
    return null;
  }
  return { targetKind: 'node_property', entityId: nodeVal, propertyKey: keyVal };
}

/**
 * Builds an edge-property target identity.
 *
 * @param {Record<string, unknown>} canonOp - The canonical operation record.
 * @returns {{ targetKind: string, from: string, to: string, label: string, edgeKey: string, propertyKey: string }|null}
 */
function buildEdgePropertyTargetIdentity(canonOp) {
  const fromVal = canonOp['from'];
  const toVal = canonOp['to'];
  const labelVal = canonOp['label'];
  const keyVal = canonOp['key'];
  if (typeof fromVal !== 'string' || typeof toVal !== 'string' || typeof labelVal !== 'string' || typeof keyVal !== 'string') {
    return null;
  }
  return {
    targetKind: 'edge_property', from: fromVal, to: toVal, label: labelVal,
    edgeKey: `${fromVal}\0${toVal}\0${labelVal}`, propertyKey: keyVal,
  };
}

/**
 * Dispatches to the appropriate target identity builder.
 *
 * @param {Record<string, unknown>} canonOp - The canonical operation record.
 * @param {string} receiptTarget - The receipt target string.
 * @returns {{ targetKind: string, [k: string]: unknown }|null}
 */
function buildTargetIdentity(canonOp, receiptTarget) {
  const targetBuilders = {
    /** Builds target identity for NodeAdd. */
    NodeAdd: () => buildNodeTargetIdentity(canonOp, receiptTarget),
    /** Builds target identity for NodeRemove. */
    NodeRemove: () => buildNodeTargetIdentity(canonOp, receiptTarget),
    /** Builds target identity for EdgeAdd. */
    EdgeAdd: () => buildEdgeTargetIdentity(canonOp, receiptTarget),
    /** Builds target identity for EdgeRemove. */
    EdgeRemove: () => buildEdgeTargetIdentity(canonOp, receiptTarget),
    /** Builds target identity for PropSet (legacy). */
    PropSet: () => buildNodePropertyTargetIdentity(canonOp),
    /** Builds target identity for NodePropSet. */
    NodePropSet: () => buildNodePropertyTargetIdentity(canonOp),
    /** Builds target identity for EdgePropSet. */
    EdgePropSet: () => buildEdgePropertyTargetIdentity(canonOp),
  };
  const builder = targetBuilders[/** @type {string} */ (canonOp['type'])];
  return builder !== undefined ? builder() : null;
}

// ── Record building ─────────────────────────────────────────────────

/**
 * Builds a ConflictTarget by computing a target identity and hashing it.
 *
 * @param {{ _hash: (payload: unknown) => Promise<string> }} service - Hashing service.
 * @param {{ canonOp: Record<string, unknown>, receiptTarget: string }} options
 * @returns {Promise<ConflictTarget|null>}
 */
async function buildConflictTarget(service, { canonOp, receiptTarget }) {
  const targetIdentity = buildTargetIdentity(canonOp, receiptTarget);
  if (targetIdentity === null || targetIdentity === undefined) {
    return null;
  }
  return new ConflictTarget({ ...targetIdentity, targetDigest: await service._hash(targetIdentity) });
}

/**
 * Computes the effect digest by normalizing the effect payload and hashing it.
 *
 * @param {{ _hash: (payload: unknown) => Promise<string> }} service - Hashing service.
 * @param {{ target: ConflictTarget, receiptOpType: string, canonOp: Record<string, unknown> }} options
 * @returns {Promise<string|null>}
 */
async function buildEffectDigest(service, { target, receiptOpType, canonOp }) {
  const effectPayload = normalizeEffectPayload(target, receiptOpType, canonOp);
  if (effectPayload === null || effectPayload === undefined) {
    return null;
  }
  return await service._hash(buildEffectPayload(target, receiptOpType, effectPayload));
}

/**
 * Pushes a diagnostic for a record that could not be fully constructed.
 *
 * @param {ConflictDiagnostic[]} diagnostics
 * @param {string} code
 * @param {string} messagePrefix
 * @param {import('./ConflictFrameLoader.js').PatchFrame} frame
 * @param {number} opIndex
 */
function pushRecordDiagnostic(diagnostics, { code, messagePrefix, frame, opIndex }) {
  pushDiagnostic(diagnostics, {
    code,
    message: `${messagePrefix} for ${frame.patch.writer}@${frame.patch.lamport}#${opIndex}`,
    severity: 'warning',
    data: { patchSha: frame.sha, writerId: frame.patch.writer, lamport: frame.patch.lamport, opIndex },
  });
}

/**
 * Builds a full OpRecord from a canonical op, its receipt outcome, and frame context.
 *
 * @param {{ _hash: (payload: unknown) => Promise<string> }} service
 * @param {{
 *   frame: import('./ConflictFrameLoader.js').PatchFrame,
 *   opIndex: number, receiptOpIndex: number,
 *   canonOp: Record<string, unknown>,
 *   receiptOutcome: { result: string, reason?: string, target: string },
 *   receiptOpType: string,
 *   diagnostics: ConflictDiagnostic[]
 * }} options
 * @returns {Promise<OpRecord|null>}
 */
async function buildOpRecord(service, { frame, opIndex, receiptOpIndex, canonOp, receiptOutcome, receiptOpType, diagnostics }) {
  const target = await buildConflictTarget(service, { canonOp, receiptTarget: receiptOutcome.target });
  if (target === null) {
    pushRecordDiagnostic(diagnostics, { code: 'anchor_incomplete', messagePrefix: 'Target identity unavailable', frame, opIndex });
    return null;
  }
  const effectDigest = await buildEffectDigest(service, { target, receiptOpType, canonOp });
  if (typeof effectDigest !== 'string' || effectDigest.length === 0) {
    pushRecordDiagnostic(diagnostics, { code: 'digest_unavailable', messagePrefix: 'Effect payload unavailable', frame, opIndex });
    return null;
  }
  const { patch, sha, context, patchOrder } = frame;
  return new OpRecord({
    target, patchSha: sha, writerId: patch.writer, lamport: patch.lamport,
    opIndex, receiptOpIndex, opType: receiptOpType, receiptResult: receiptOutcome.result,
    receiptReason: receiptOutcome.reason, effectDigest,
    eventId: createEventId(patch.lamport, patch.writer, sha, opIndex), context, patchOrder,
  });
}

// ── Single-op analysis ──────────────────────────────────────────────

/**
 * Analyzes a single operation within a frame.
 *
 * @param {{ _hash: (payload: unknown) => Promise<string> }} service
 * @param {{
 *   frame: import('./ConflictFrameLoader.js').PatchFrame,
 *   opIndex: number, receiptOpIndex: number,
 *   receipt: import('../../types/TickReceipt.js').TickReceipt,
 *   diagnostics: ConflictDiagnostic[]
 * }} options
 * @returns {Promise<{ record: OpRecord|null, nextReceiptOpIndex: number }|null>}
 */
async function analyzeOneOp(service, { frame, opIndex, receiptOpIndex, receipt, diagnostics }) {
  const rawOp = frame.patch.ops[opIndex];
  const canonOp = cloneObject(/** @type {Record<string, unknown>} */ (normalizeRawOp(rawOp)));
  const receiptOpType = receiptNameForOp(/** @type {string} */ (canonOp['type']));
  if (typeof receiptOpType !== 'string' || receiptOpType.length === 0) {
    return null;
  }
  const receiptOutcome = receipt.ops[receiptOpIndex];
  if (receiptOutcome === undefined || receiptOutcome === null) {
    pushDiagnostic(diagnostics, {
      code: 'receipt_unavailable',
      message: `Receipt outcome missing for ${frame.patch.writer}@${frame.patch.lamport}#${opIndex}`,
      severity: 'warning',
      data: { patchSha: frame.sha, writerId: frame.patch.writer, lamport: frame.patch.lamport, opIndex },
    });
    return { record: null, nextReceiptOpIndex: receiptOpIndex + 1 };
  }
  const record = await buildOpRecord(service, { frame, opIndex, receiptOpIndex, canonOp, receiptOutcome, receiptOpType, diagnostics });
  return { record, nextReceiptOpIndex: receiptOpIndex + 1 };
}

// ── Resolution building ─────────────────────────────────────────────

/**
 * Builds a ConflictResolution from candidate parameters via the class factory.
 *
 * @param {{ kind: string, code: string, winner: OpRecord, loser: OpRecord }} options
 * @returns {ConflictResolution}
 */
function buildResolution({ kind, code, winner, loser }) {
  return ConflictResolution.fromCandidate({ reducerId: CONFLICT_REDUCER_ID, kind, code, winner, loser });
}

/**
 * Infers a classification note describing the causal relation between winner and loser.
 *
 * @param {OpRecord} winner - The winning operation record.
 * @param {OpRecord} loser - The losing operation record.
 * @returns {string} The appropriate classification note code.
 */
function inferRelationNote(winner, loser) {
  return inferCausalRelation(winner, loser) === 'concurrent'
    ? CLASSIFICATION_NOTES.CONCURRENT_TO_WINNER
    : CLASSIFICATION_NOTES.ORDERED_BEFORE_WINNER;
}

// ── Candidate classification ────────────────────────────────────────

/**
 * Adds a supersession candidate if the record was superseded.
 *
 * @param {ConflictCandidateCollector} collector
 * @param {OpRecord} record
 * @param {OpRecord|null} currentPropertyWinner
 */
function maybeAddSupersessionCandidate(collector, record, currentPropertyWinner) {
  if (!record.isPropertySet() || record.receiptResult !== 'superseded' || currentPropertyWinner === null) {
    return;
  }
  collector.candidates.push(new ConflictCandidate({
    kind: 'supersession',
    target: record.target, winner: currentPropertyWinner, loser: record,
    resolution: buildResolution({ kind: 'supersession', code: 'receipt_superseded', winner: currentPropertyWinner, loser: record }),
    noteCodes: normalizeNoteCodes([
      CLASSIFICATION_NOTES.RECEIPT_SUPERSEDED, CLASSIFICATION_NOTES.SAME_TARGET,
      record.writerId !== currentPropertyWinner.writerId ? CLASSIFICATION_NOTES.DIFFERENT_WRITER : '',
      inferRelationNote(currentPropertyWinner, record),
    ].filter(Boolean)),
  }));
}

/**
 * Adds a redundancy candidate if the record was redundant.
 *
 * @param {ConflictCandidateCollector} collector
 * @param {OpRecord} record
 * @param {OpRecord|null} priorEquivalent
 */
function maybeAddRedundancyCandidate(collector, record, priorEquivalent) {
  if (record.receiptResult !== 'redundant' || priorEquivalent === null) {
    return;
  }
  collector.candidates.push(new ConflictCandidate({
    kind: 'redundancy',
    target: record.target, winner: priorEquivalent, loser: record,
    resolution: buildResolution({ kind: 'redundancy', code: 'receipt_redundant', winner: priorEquivalent, loser: record }),
    noteCodes: normalizeNoteCodes([
      CLASSIFICATION_NOTES.RECEIPT_REDUNDANT, CLASSIFICATION_NOTES.SAME_TARGET,
      CLASSIFICATION_NOTES.REPLAY_EQUIVALENT_EFFECT,
    ]),
  }));
}

/**
 * Tracks an applied record in the collector for property winner and equivalent effect lookups.
 *
 * @param {ConflictCandidateCollector} collector
 * @param {OpRecord} record
 */
function trackAppliedRecord(collector, record) {
  if (record.receiptResult !== 'applied') {
    return;
  }
  collector.equivalentWinnerByTargetEffect.set(effectKey(record.target, record.effectDigest), record);
  if (!record.isPropertySet()) {
    return;
  }
  const history = collector.propertyAppliedHistory.get(record.targetKey) ?? [];
  history.push(record);
  collector.propertyAppliedHistory.set(record.targetKey, history);
  collector.propertyWinnerByTarget.set(record.targetKey, record);
}

/**
 * Determines whether a record qualifies as an eventual-override loser.
 *
 * @param {OpRecord} loser
 * @param {OpRecord} finalWinner
 * @param {Set<string>} scannedPatchShas
 * @returns {boolean}
 */
function isEventualOverrideLoser(loser, finalWinner, scannedPatchShas) {
  if (loser.equals(finalWinner)) {
    return false;
  }
  if (loser.writerId === finalWinner.writerId) {
    return false;
  }
  if (loser.effectDigest === finalWinner.effectDigest) {
    return false;
  }
  return scannedPatchShas.has(loser.patchSha);
}

/**
 * Emits eventual override candidates for a single target's applied history.
 *
 * @param {ConflictCandidateCollector} collector
 * @param {OpRecord[]} history
 * @param {OpRecord} finalWinner
 * @param {Set<string>} scannedPatchShas
 */
function emitEventualOverridesForTarget(collector, { history, finalWinner, scannedPatchShas }) {
  for (const loser of history) {
    if (!isEventualOverrideLoser(loser, finalWinner, scannedPatchShas)) {
      continue;
    }
    const relation = inferCausalRelation(finalWinner, loser);
    collector.candidates.push(new ConflictCandidate({
      kind: 'eventual_override',
      target: finalWinner.target, winner: finalWinner, loser,
      resolution: buildResolution({ kind: 'eventual_override', code: 'effective_state_override', winner: finalWinner, loser }),
      noteCodes: normalizeNoteCodes([
        CLASSIFICATION_NOTES.SAME_TARGET, CLASSIFICATION_NOTES.DIFFERENT_WRITER,
        CLASSIFICATION_NOTES.DIGEST_DIFFERS, CLASSIFICATION_NOTES.EFFECTIVE_THEN_LOST,
        relation === 'concurrent' ? CLASSIFICATION_NOTES.CONCURRENT_TO_WINNER : CLASSIFICATION_NOTES.ORDERED_BEFORE_WINNER,
      ]),
    }));
  }
}

/**
 * Scans applied property history for eventual-override candidates.
 *
 * @param {ConflictCandidateCollector} collector
 * @param {Set<string>} scannedPatchShas
 */
function addEventualOverrideCandidates(collector, scannedPatchShas) {
  for (const [targetDigest, history] of collector.propertyAppliedHistory) {
    const finalWinner = collector.propertyWinnerByTarget.get(targetDigest);
    if (finalWinner === undefined) {
      continue;
    }
    emitEventualOverridesForTarget(collector, { history, finalWinner, scannedPatchShas });
  }
}

/**
 * Processes an analyzed record: checks for immediate candidates and tracks applied records.
 *
 * @param {ConflictCandidateCollector} collector
 * @param {OpRecord} record
 * @param {string} sha
 * @param {Set<string>} scannedPatchShas
 */
function processAnalyzedRecord(collector, { record, sha, scannedPatchShas }) {
  const currentPropertyWinner = collector.propertyWinnerByTarget.get(record.targetKey) ?? null;
  const priorEquivalent = collector.equivalentWinnerByTargetEffect.get(effectKey(record.target, record.effectDigest)) ?? null;
  if (scannedPatchShas.has(sha)) {
    maybeAddSupersessionCandidate(collector, record, currentPropertyWinner);
    maybeAddRedundancyCandidate(collector, record, priorEquivalent);
  }
  trackAppliedRecord(collector, record);
}

// ── Frame analysis ──────────────────────────────────────────────────

/**
 * Analyzes all operations in a single patch frame.
 *
 * @param {{ _hash: (payload: unknown) => Promise<string> }} service
 * @param {import('./ConflictFrameLoader.js').PatchFrame} frame
 * @param {Set<string>} scannedPatchShas
 * @param {ConflictDiagnostic[]} diagnostics
 * @param {ConflictCandidateCollector} collector
 * @returns {Promise<void>}
 */
async function analyzeFrameOps(service, { frame, scannedPatchShas, diagnostics, collector }) {
  const { patch, receipt, sha } = frame;
  let receiptOpIndex = 0;
  for (let opIndex = 0; opIndex < patch.ops.length; opIndex++) {
    const result = await analyzeOneOp(service, { frame, opIndex, receiptOpIndex, receipt, diagnostics });
    if (result === null) {
      continue;
    }
    receiptOpIndex = result.nextReceiptOpIndex;
    if (result.record === null) {
      continue;
    }
    processAnalyzedRecord(collector, { record: result.record, sha, scannedPatchShas });
  }
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Mutable accumulator for conflict candidates during frame analysis.
 *
 * Use the static `collect` factory to build a fully populated instance.
 */
export class ConflictCandidateCollector {
  /**
   * Creates an empty collector. Use `ConflictCandidateCollector.collect()` to populate.
   */
  constructor() {
    this.propertyWinnerByTarget = new Map();
    this.propertyAppliedHistory = new Map();
    this.equivalentWinnerByTargetEffect = new Map();
    this.candidates = [];
  }

  /**
   * Walks all patch frames, builds op records, and classifies conflict candidates.
   *
   * @param {{ _hash: (payload: unknown) => Promise<string> }} service - Hashing service.
   * @param {{
   *   patchFrames: import('./ConflictFrameLoader.js').PatchFrame[],
   *   scannedPatchShas: Set<string>,
   *   diagnostics: ConflictDiagnostic[]
   * }} options - Collection parameters.
   * @returns {Promise<ConflictCandidateCollector>} The populated collector.
   */
  static async collect(service, { patchFrames, scannedPatchShas, diagnostics }) {
    const collector = new ConflictCandidateCollector();
    for (const frame of patchFrames) {
      await analyzeFrameOps(service, { frame, scannedPatchShas, diagnostics, collector });
    }
    addEventualOverrideCandidates(collector, scannedPatchShas);
    return collector;
  }
}
