/**
 * ConflictAnalyzerService — read-only conflict provenance analysis over patch history.
 *
 * This service computes deterministic conflict traces from patch history,
 * reducer receipts, and current resolved state without mutating graph state,
 * checkpoints, caches, or other durable storage.
 *
 * @module domain/services/strand/ConflictAnalyzerService
 */

import VersionVector from '../../crdt/VersionVector.js';
import { reduceV5, normalizeRawOp, OP_STRATEGIES } from '../JoinReducer.js';
import { canonicalStringify } from '../../utils/canonicalStringify.js';
import { createEventId } from '../../utils/EventId.js';
import { decodeEdgeKey } from '../KeyCodec.js';
import ConflictAnalysisRequest from './ConflictAnalysisRequest.js';
import StrandService from './StrandService.js';


/** @import { PatchV2 } from '../../types/WarpTypesV2.js' */
/** @typedef {import('../../WarpRuntime.js').default} WarpRuntime */
/** @typedef {import('./ConflictAnalysisRequest.js').ConflictAnalyzeOptions} ConflictAnalyzeOptions */

/** @typedef {import('../../types/TickReceipt.js').TickReceipt} TickReceipt */
/** @typedef {import('../../utils/EventId.js').EventId} EventId */

export const CONFLICT_ANALYSIS_VERSION = 'conflict-analyzer/v2';
export const CONFLICT_TRAVERSAL_ORDER = 'lamport_desc_writer_desc_patch_desc';
export const CONFLICT_TRUNCATION_POLICY = 'scan_budget_max_patches_reverse_causal';
export const CONFLICT_REDUCER_ID = 'join-reducer-v5';

/**
 * Resolves a canonical op type to its TickReceipt-compatible name via OP_STRATEGIES.
 * Returns undefined for unknown/forward-compatible op types.
 * @param {string} opType
 * @returns {string|undefined}
 */
function receiptNameForOp(opType) {
  const strategy = OP_STRATEGIES.get(opType);
  return strategy !== undefined ? strategy.receiptName : undefined;
}

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

/**
 * @typedef {{
 *   patchSha: string,
 *   writerId: string,
 *   lamport: number,
 *   opIndex: number,
 *   receiptPatchSha?: string,
 *   receiptLamport?: number,
 *   receiptOpIndex?: number
 * }} ConflictAnchor
 */

/**
 * @typedef {{
 *   targetKind: 'node'|'edge'|'node_property'|'edge_property',
 *   targetDigest: string,
 *   entityId?: string,
 *   propertyKey?: string,
 *   from?: string,
 *   to?: string,
 *   label?: string,
 *   edgeKey?: string
 * }} ConflictTarget
 */

/**
 * @typedef {{
 *   anchor: ConflictAnchor,
 *   effectDigest: string
 * }} ConflictWinner
 */

/**
 * @typedef {{
 *   anchor: ConflictAnchor,
 *   effectDigest: string,
 *   causalRelationToWinner?: 'concurrent'|'ordered'|'replay_equivalent'|'reducer_collapsed',
 *   structurallyDistinctAlternative: boolean,
 *   replayableFromAnchors: boolean,
 *   notes?: string[]
 * }} ConflictParticipant
 */

/**
 * @typedef {{
 *   reducerId: string,
 *   basis: { code: string, reason?: string },
 *   winnerMode: 'immediate'|'eventual',
 *   comparator?: {
 *     type: 'event_id'|'effect_digest',
 *     winnerEventId?: { lamport: number, writerId: string, patchSha: string, opIndex: number },
 *     loserEventId?: { lamport: number, writerId: string, patchSha: string, opIndex: number }
 *   }
 * }} ConflictResolution
 */

/**
 * @typedef {{
 *   conflictId: string,
 *   kind: 'supersession'|'eventual_override'|'redundancy',
 *   target: ConflictTarget,
 *   winner: ConflictWinner,
 *   losers: ConflictParticipant[],
 *   resolution: ConflictResolution,
 *   whyFingerprint: string,
 *   classificationNotes?: string[],
 *   evidence: {
 *     level: 'summary'|'standard'|'full',
 *     patchRefs: string[],
 *     receiptRefs: Array<{ patchSha: string, lamport: number, opIndex: number }>
 *   }
 * }} ConflictTrace
 */

/**
 * @typedef {{
 *   code: string,
 *   severity: 'warning'|'error',
 *   message: string,
 *   data?: Record<string, unknown>
 * }} ConflictDiagnostic
 */

/**
 * @typedef {{
 *   analysisVersion: string,
 *   coordinateKind: 'frontier'|'strand',
 *   frontier: Record<string, string>,
 *   frontierDigest: string,
 *   lamportCeiling: number|null,
 *   scanBudgetApplied: { maxPatches: number|null },
 *   truncationPolicy: string,
 *   strand?: {
 *     strandId: string,
 *     baseLamportCeiling: number|null,
 *     overlayHeadPatchSha: string|null,
 *     overlayPatchCount: number,
 *     overlayWritable: boolean,
 *     braid?: {
 *       readOverlayCount: number,
 *       braidedStrandIds: string[]
 *     }
 *   }
 * }} ConflictResolvedCoordinate
 */

/**
 * @typedef {{
 *   analysisVersion: string,
 *   resolvedCoordinate: ConflictResolvedCoordinate,
 *   analysisSnapshotHash: string,
 *   diagnostics?: ConflictDiagnostic[],
 *   conflicts: ConflictTrace[]
 * }} ConflictAnalysis
 */

/**
 * @typedef {{
 *   kind: 'supersession'|'eventual_override'|'redundancy',
 *   target: ConflictTarget,
 *   winner: OpRecord,
 *   loser: OpRecord,
 *   resolution: ConflictResolution,
 *   noteCodes: string[]
 * }} ConflictCandidate
 */

/**
 * @typedef {{
 *   patch: PatchV2,
 *   sha: string,
 *   receipt: TickReceipt,
 *   patchOrder: number,
 *   context: Map<string, number>
 * }} PatchFrame
 */

/**
 * @typedef {{
 *   target: ConflictTarget,
 *   targetKey: string,
 *   patchSha: string,
 *   writerId: string,
 *   lamport: number,
 *   opIndex: number,
 *   receiptOpIndex: number,
 *   opType: string,
 *   receiptResult: 'applied'|'superseded'|'redundant',
 *   receiptReason?: string,
 *   effectDigest: string,
 *   eventId: EventId,
 *   context: Map<string, number>,
 *   patchOrder: number
 * }} OpRecord
 */

/**
 * @typedef {{
 *   target: ConflictTarget,
 *   kind: 'supersession'|'eventual_override'|'redundancy',
 *   winner: OpRecord,
 *   losers: OpRecord[],
 *   resolution: ConflictResolution,
 *   noteCodes: Set<string>
 * }} GroupedConflict
 */

/**
 * @typedef {{
 *   propertyWinnerByTarget: Map<string, OpRecord>,
 *   propertyAppliedHistory: Map<string, OpRecord[]>,
 *   equivalentWinnerByTargetEffect: Map<string, OpRecord>,
 *   candidates: ConflictCandidate[]
 * }} ConflictCollector
 */

/**
 * @typedef {{
 *   reverseCausalFrames: PatchFrame[],
 *   scannedFrames: PatchFrame[],
 *   scannedPatchShas: Set<string>,
 *   truncated: boolean
 * }} ScanWindow
 */

/**
 * Lexicographic compare using explicit byte/hex-safe ordering.
 *
 * @param {string} a - First string to compare.
 * @param {string} b - Second string to compare.
 * @returns {number} Negative, zero, or positive for ordering.
 */
function compareStrings(a, b) {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/**
 * Numeric comparison returning standard sort-compatible result.
 *
 * @param {number} a - First number to compare.
 * @param {number} b - Second number to compare.
 * @returns {number} Negative, zero, or positive for ordering.
 */
function compareNumbers(a, b) {
  return a === b ? 0 : (a < b ? -1 : 1);
}

/**
 * Serializes a conflict anchor into a deterministic padded string for sorting.
 *
 * @param {ConflictAnchor} anchor - The anchor to serialize.
 * @returns {string} Deterministic string representation.
 */
function anchorString(anchor) {
  return `${anchor.writerId}:${String(anchor.lamport).padStart(16, '0')}:${anchor.patchSha}:${String(anchor.opIndex).padStart(8, '0')}`;
}

/**
 * Compares two conflict anchors using their deterministic string representations.
 *
 * @param {ConflictAnchor} a - First anchor to compare.
 * @param {ConflictAnchor} b - Second anchor to compare.
 * @returns {number} Negative, zero, or positive for ordering.
 */
function compareAnchors(a, b) {
  return compareStrings(anchorString(a), anchorString(b));
}

/**
 * Compares two patch frames in reverse-causal order (highest lamport first).
 *
 * @param {PatchFrame} a - First patch frame.
 * @param {PatchFrame} b - Second patch frame.
 * @returns {number} Negative, zero, or positive for ordering.
 */
function comparePatchFramesReverseCausal(a, b) {
  return compareByLamportThenWriterThenSha(b, a);
}

/**
 * Compares two patch frames by lamport, then writer, then SHA in ascending order.
 *
 * @param {PatchFrame} first - The frame to rank higher on tie-break.
 * @param {PatchFrame} second - The frame to rank lower on tie-break.
 * @returns {number} Negative, zero, or positive for ordering.
 */
function compareByLamportThenWriterThenSha(first, second) {
  const lamportCmp = compareNumbers(safeLamport(first), safeLamport(second));
  if (lamportCmp !== 0) {
    return lamportCmp;
  }
  const writerCmp = compareStrings(safeWriter(first), safeWriter(second));
  return writerCmp !== 0 ? writerCmp : compareStrings(first.sha, second.sha);
}

/**
 * Extracts the lamport clock from a patch frame, defaulting to zero if absent.
 *
 * @param {PatchFrame} frame - The patch frame.
 * @returns {number} The lamport clock value.
 */
function safeLamport(frame) {
  return frame.patch.lamport ?? 0;
}

/**
 * Extracts the writer ID from a patch frame, defaulting to empty string if absent.
 *
 * @param {PatchFrame} frame - The patch frame.
 * @returns {string} The writer ID.
 */
function safeWriter(frame) {
  return frame.patch.writer ?? '';
}

/**
 * Converts a frontier map into a plain record for serialization.
 *
 * @param {Map<string, string>} frontier - Writer-to-SHA frontier map.
 * @returns {Record<string, string>} Sorted key-value record.
 */
function frontierToRecord(frontier) {
  /** @type {Record<string, string>} */
  const record = {};
  for (const [writerId, sha] of [...frontier.entries()].sort(([a], [b]) => compareStrings(a, b))) {
    record[writerId] = sha;
  }
  return record;
}

/**
 * Normalizes a context value into a Map of writer clocks, coercing from plain objects or nulls.
 *
 * @param {VersionVector|Map<string, number>|Record<string, number>|undefined|null} context - Raw context input.
 * @returns {Map<string, number>} Normalized writer-clock map.
 */
function normalizeContext(context) {
  if (context instanceof VersionVector || context instanceof Map) {
    return new Map(context);
  }
  return _normalizeContextFromValue(context);
}

/**
 * Normalizes a scalar or plain-object context.
 *
 * @param {Record<string, number>|undefined|null} context
 * @returns {Map<string, number>}
 */
function _normalizeContextFromValue(context) {
  if (context === null || context === undefined || typeof context !== 'object') {
    return new Map();
  }
  return buildContextMapFromEntries(context);
}

/**
 * Builds a context map from a plain object by filtering valid non-negative integer entries.
 *
 * @param {Record<string, number>} obj - Plain object with writer clock entries.
 * @returns {Map<string, number>} Filtered writer-clock map.
 */
function buildContextMapFromEntries(obj) {
  /** @type {Map<string, number>} */
  const map = new Map();
  for (const [writerId, value] of Object.entries(obj)) {
    if (Number.isInteger(value) && value >= 0) {
      map.set(writerId, value);
    }
  }
  return map;
}

/**
 * Determines the causal relationship between a winning and losing op record.
 *
 * @param {OpRecord} winner - The winning operation record.
 * @param {OpRecord} loser - The losing operation record.
 * @returns {'concurrent'|'ordered'|'replay_equivalent'|'reducer_collapsed'|undefined} Causal relation.
 */
function inferCausalRelation(winner, loser) {
  if (winner.effectDigest === loser.effectDigest) {
    return 'replay_equivalent';
  }
  return isCausallyOrdered(winner, loser) ? 'ordered' : 'concurrent';
}

/**
 * Checks whether either record causally observes the other via version vector comparison.
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

/**
 * Checks whether a conflict target references the given entity by id, source, or destination.
 *
 * @param {ConflictTarget} target - The conflict target to inspect.
 * @param {string} entityId - The entity identifier to match.
 * @returns {boolean} True if the target touches the entity.
 */
function targetTouchesEntity(target, entityId) {
  if (target.entityId === entityId) {
    return true;
  }
  return target.from === entityId || target.to === entityId;
}

/**
 * Tests whether a conflict target matches a user-supplied target selector filter.
 *
 * @param {ConflictTarget} target - The conflict target to test.
 * @param {import('./ConflictAnalysisRequest.js').ConflictTargetSelector|null|undefined} selector - The filter selector, or undefined to match all.
 * @returns {boolean} True if the target satisfies all selector constraints.
 */
function matchesTargetSelector(target, selector) {
  if (selector === undefined || selector === null) {
    return true;
  }
  if (target.targetKind !== selector.targetKind) {
    return false;
  }
  return targetSelectorFieldsMatch(target, selector);
}

/**
 * Checks that every specified selector field matches the target.
 *
 * @param {ConflictTarget} target - The conflict target.
 * @param {import('./ConflictAnalysisRequest.js').ConflictTargetSelector} selector - The selector with fields to check.
 * @returns {boolean} True if all specified fields match.
 */
function targetSelectorFieldsMatch(target, selector) {
  /** @type {Array<'entityId'|'propertyKey'|'from'|'to'|'label'>} */
  const selectorFields = ['entityId', 'propertyKey', 'from', 'to', 'label'];
  for (const field of selectorFields) {
    const selectorValue = selector[field];
    if (selectorValue !== undefined && target[field] !== selectorValue) {
      return false;
    }
  }
  return true;
}

/**
 * Checks whether a conflict trace involves the specified writer as winner or loser.
 *
 * @param {ConflictTrace} trace - The conflict trace to inspect.
 * @param {string} writerId - The writer identifier to match.
 * @returns {boolean} True if the writer participated in the conflict.
 */
function traceTouchesWriter(trace, writerId) {
  if (trace.winner.anchor.writerId === writerId) {
    return true;
  }
  return trace.losers.some((loser) => loser.anchor.writerId === writerId);
}

/**
 * Computes a SHA-256 digest of the canonical JSON serialization of a payload, with caching.
 *
 * @param {{
 *   digestCache: Map<string, string>,
 *   crypto: import('../../../ports/CryptoPort.js').default,
 *   payload: unknown
 * }} options - Cache, crypto port, and payload to hash.
 * @returns {Promise<string>} Hex-encoded SHA-256 digest.
 */
async function hashPayload({ digestCache, crypto, payload }) {
  const canonical = canonicalStringify(payload);
  if (digestCache.has(canonical)) {
    return /** @type {string} */ (digestCache.get(canonical));
  }
  const digest = await crypto.hash('sha256', canonical);
  digestCache.set(canonical, digest);
  return digest;
}

/**
 * Builds a composite key from a target digest and effect digest for deduplication lookups.
 *
 * @param {ConflictTarget} target - The conflict target.
 * @param {string} effectDigest - The digest of the effect payload.
 * @returns {string} Composite lookup key.
 */
function effectKey(target, effectDigest) {
  return `${target.targetDigest}:${effectDigest}`;
}

/**
 * Builds a deterministic group key for deduplicating conflict candidates by target, kind, winner, and resolution.
 *
 * @param {{
 *   target: ConflictTarget,
 *   kind: string,
 *   winner: OpRecord,
 *   resolution: ConflictResolution
 * }} options - Components of the group key.
 * @returns {string} Pipe-delimited group key.
 */
function candidateGroupKey({ target, kind, winner, resolution }) {
  return [
    kind,
    target.targetDigest,
    anchorString({
      patchSha: winner.patchSha,
      writerId: winner.writerId,
      lamport: winner.lamport,
      opIndex: winner.opIndex,
    }),
    resolution.reducerId,
    resolution.basis.code,
    resolution.winnerMode,
  ].join('|');
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
  return {
    targetKind: target.targetKind,
    targetDigest: target.targetDigest,
    opType,
    payload,
  };
}

/**
 * Shallow-clones a raw object to avoid mutation of shared references.
 *
 * @param {Record<string, unknown>} raw - The object to clone.
 * @returns {Record<string, unknown>} A shallow copy.
 */
function cloneObject(raw) {
  return /** @type {Record<string, unknown>} */ ({ ...raw });
}

/**
 * Returns a human-readable description of a lamport ceiling, using 'head' for null.
 *
 * @param {number|null} lamportCeiling - The ceiling value, or null for head.
 * @returns {string} Human-readable ceiling label.
 */
function describeLamportCeiling(lamportCeiling) {
  return lamportCeiling === null ? 'head' : String(lamportCeiling);
}

/**
 * Builds the resolved coordinate metadata describing the analysis scope and budget.
 *
 * @param {{
 *   frontier: Map<string, string>,
 *   lamportCeiling: number|null,
 *   maxPatches: number|null,
 *   frontierDigest: string,
 *   coordinateKind?: 'frontier'|'strand',
 *   strand?: {
 *     strandId: string,
 *     baseLamportCeiling: number|null,
 *     overlayHeadPatchSha: string|null,
 *     overlayPatchCount: number,
 *     overlayWritable: boolean,
 *     braid?: {
 *       readOverlayCount: number,
 *       braidedStrandIds: string[]
 *     }
 *   }
 * }} options - Coordinate construction parameters.
 * @returns {ConflictResolvedCoordinate} The resolved coordinate.
 */
function buildResolvedCoordinate({
  frontier,
  lamportCeiling,
  maxPatches,
  frontierDigest,
  coordinateKind = 'frontier',
  strand,
}) {
  return {
    analysisVersion: CONFLICT_ANALYSIS_VERSION,
    coordinateKind,
    frontier: frontierToRecord(frontier),
    frontierDigest,
    lamportCeiling,
    scanBudgetApplied: {
      maxPatches,
    },
    truncationPolicy: CONFLICT_TRUNCATION_POLICY,
    ...(strand !== undefined && strand !== null ? { strand } : {}),
  };
}

/**
 * Builds strand metadata for the resolved coordinate from a strand descriptor.
 *
 * @param {{
 *   strandId: string,
 *   baseObservation: { lamportCeiling: number|null },
 *   overlay: { headPatchSha: string|null, patchCount: number, writable: boolean },
 *   braid: { readOverlays: Array<{ strandId: string }> }
 * }} descriptor - The strand descriptor to extract metadata from.
 * @returns {NonNullable<ConflictResolvedCoordinate['strand']>} Strand metadata.
 */
function buildResolvedStrandMetadata(descriptor) {
  return {
    strandId: descriptor.strandId,
    baseLamportCeiling: descriptor.baseObservation.lamportCeiling,
    overlayHeadPatchSha: descriptor.overlay.headPatchSha,
    overlayPatchCount: descriptor.overlay.patchCount,
    overlayWritable: descriptor.overlay.writable,
    braid: {
      readOverlayCount: descriptor.braid.readOverlays.length,
      braidedStrandIds: descriptor.braid.readOverlays
        .map((overlay) => overlay.strandId)
        .sort(compareStrings),
    },
  };
}

/**
 * Appends a diagnostic entry to the diagnostics array with optional severity and data.
 *
 * @param {ConflictDiagnostic[]} diagnostics - The diagnostics accumulator.
 * @param {{
 *   code: string,
 *   message: string,
 *   severity?: 'warning'|'error',
 *   data?: Record<string, unknown>
 * }} options - Diagnostic properties.
 */
function pushDiagnostic(diagnostics, {
  code,
  message,
  severity = 'warning',
  data,
}) {
  diagnostics.push({
    code,
    severity,
    message,
    ...(data !== undefined && data !== null ? { data } : {}),
  });
}

/**
 * Normalizes observed dots into a sorted array of strings, handling absent or iterable inputs.
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
 * Extracts the normalized effect payload for a given op type, returning null for unrecognized types.
 *
 * @param {ConflictTarget} _target - The conflict target (unused but kept for signature consistency).
 * @param {string} opType - The receipt operation type name.
 * @param {Record<string, unknown>} canonOp - The canonical operation record.
 * @returns {Record<string, unknown>|null} Normalized effect payload or null.
 */
function normalizeEffectPayload(_target, opType, canonOp) {
  /** @type {Record<string, () => Record<string, unknown>>} */
  const effectFactories = {
    /** Extracts the dot from a NodeAdd operation. */
    NodeAdd: () => ({ dot: canonOp['dot'] ?? null }),
    /** Extracts observed dots from a NodeTombstone operation. */
    NodeTombstone: () => ({ observedDots: normalizeObservedDots(canonOp['observedDots']) }),
    /** Extracts the dot from an EdgeAdd operation. */
    EdgeAdd: () => ({ dot: canonOp['dot'] ?? null }),
    /** Extracts observed dots from an EdgeTombstone operation. */
    EdgeTombstone: () => ({ observedDots: normalizeObservedDots(canonOp['observedDots']) }),
    /** Extracts the value from a PropSet operation (legacy raw type). */
    PropSet: () => ({ value: canonOp['value'] ?? null }),
    /** Extracts the value from a NodePropSet operation. */
    NodePropSet: () => ({ value: canonOp['value'] ?? null }),
    /** Extracts the value from an EdgePropSet operation. */
    EdgePropSet: () => ({ value: canonOp['value'] ?? null }),
    /** Extracts the oid from a BlobValue operation. */
    BlobValue: () => ({ oid: canonOp['oid'] ?? null }),
  };
  const factory = effectFactories[opType];
  return factory !== undefined ? factory() : null;
}

/**
 * Builds a node-level target identity from the canonical op or receipt target fallback.
 *
 * @param {Record<string, unknown>} canonOp - The canonical operation record.
 * @param {string} receiptTarget - The receipt target string for fallback identification.
 * @returns {Omit<ConflictTarget, 'targetDigest'>|null} Node target identity or null.
 */
function buildNodeTargetIdentity(canonOp, receiptTarget) {
  const nodeVal = canonOp['node'];
  const entityId = typeof nodeVal === 'string' && nodeVal.length > 0
    ? nodeVal
    : (receiptTarget !== '*' ? receiptTarget : null);
  return entityId !== null ? { targetKind: 'node', entityId } : null;
}

/**
 * Builds an edge-level target identity from canonical op fields or by decoding the receipt target.
 *
 * @param {Record<string, unknown>} canonOp - The canonical operation record.
 * @param {string} receiptTarget - The receipt target string for fallback decoding.
 * @returns {Omit<ConflictTarget, 'targetDigest'>|null} Edge target identity or null.
 */
function buildEdgeTargetIdentity(canonOp, receiptTarget) {
  const fromOp = buildEdgeTargetFromOp(canonOp);
  if (fromOp !== null) {
    return fromOp;
  }
  return buildEdgeTargetFromReceipt(receiptTarget);
}

/**
 * Attempts to build an edge target identity directly from canonical op fields.
 *
 * @param {Record<string, unknown>} canonOp - The canonical operation record.
 * @returns {Omit<ConflictTarget, 'targetDigest'>|null} Edge target or null if fields are missing.
 */
function buildEdgeTargetFromOp(canonOp) {
  const fromVal = canonOp['from'];
  const toVal = canonOp['to'];
  const labelVal = canonOp['label'];
  if (
    typeof fromVal === 'string' &&
    typeof toVal === 'string' &&
    typeof labelVal === 'string'
  ) {
    return {
      targetKind: 'edge',
      from: fromVal,
      to: toVal,
      label: labelVal,
      edgeKey: `${fromVal}\0${toVal}\0${labelVal}`,
    };
  }
  return null;
}

/**
 * Attempts to build an edge target identity by decoding the receipt target string.
 *
 * @param {string} receiptTarget - The receipt target string to decode.
 * @returns {Omit<ConflictTarget, 'targetDigest'>|null} Edge target or null if decoding fails.
 */
function buildEdgeTargetFromReceipt(receiptTarget) {
  if (receiptTarget === '*') {
    return null;
  }
  const decoded = decodeEdgeKey(receiptTarget);
  if (!decoded.from || !decoded.to || !decoded.label) {
    return null;
  }
  return {
    targetKind: 'edge',
    from: decoded.from,
    to: decoded.to,
    label: decoded.label,
    edgeKey: receiptTarget,
  };
}

/**
 * Builds a node-property target identity from the canonical operation fields.
 *
 * @param {Record<string, unknown>} canonOp - The canonical operation record.
 * @returns {Omit<ConflictTarget, 'targetDigest'>|null} Node-property target or null.
 */
function buildNodePropertyTargetIdentity(canonOp) {
  const nodeVal = canonOp['node'];
  const keyVal = canonOp['key'];
  if (typeof nodeVal !== 'string' || typeof keyVal !== 'string') {
    return null;
  }
  return {
    targetKind: 'node_property',
    entityId: nodeVal,
    propertyKey: keyVal,
  };
}

/**
 * Builds an edge-property target identity from the canonical operation fields.
 *
 * @param {Record<string, unknown>} canonOp - The canonical operation record.
 * @returns {Omit<ConflictTarget, 'targetDigest'>|null} Edge-property target or null.
 */
function buildEdgePropertyTargetIdentity(canonOp) {
  const fromVal = canonOp['from'];
  const toVal = canonOp['to'];
  const labelVal = canonOp['label'];
  const keyVal = canonOp['key'];
  if (
    typeof fromVal !== 'string' ||
    typeof toVal !== 'string' ||
    typeof labelVal !== 'string' ||
    typeof keyVal !== 'string'
  ) {
    return null;
  }
  return {
    targetKind: 'edge_property',
    from: fromVal,
    to: toVal,
    label: labelVal,
    edgeKey: `${fromVal}\0${toVal}\0${labelVal}`,
    propertyKey: keyVal,
  };
}

/**
 * Dispatches to the appropriate target identity builder based on the canonical op type.
 *
 * @param {Record<string, unknown>} canonOp - The canonical operation record.
 * @param {string} receiptTarget - The receipt target string for fallback.
 * @returns {Omit<ConflictTarget, 'targetDigest'>|null} Target identity or null.
 */
function buildTargetIdentity(canonOp, receiptTarget) {
  /** @type {Record<string, () => Omit<ConflictTarget, 'targetDigest'>|null>} */
  const targetBuilders = {
    /** Builds target identity for NodeAdd ops. */
    NodeAdd: () => buildNodeTargetIdentity(canonOp, receiptTarget),
    /** Builds target identity for NodeRemove ops. */
    NodeRemove: () => buildNodeTargetIdentity(canonOp, receiptTarget),
    /** Builds target identity for EdgeAdd ops. */
    EdgeAdd: () => buildEdgeTargetIdentity(canonOp, receiptTarget),
    /** Builds target identity for EdgeRemove ops. */
    EdgeRemove: () => buildEdgeTargetIdentity(canonOp, receiptTarget),
    /** Builds target identity for PropSet ops. */
    PropSet: () => buildNodePropertyTargetIdentity(canonOp),
    /** Builds target identity for NodePropSet ops. */
    NodePropSet: () => buildNodePropertyTargetIdentity(canonOp),
    /** Builds target identity for EdgePropSet ops. */
    EdgePropSet: () => buildEdgePropertyTargetIdentity(canonOp),
  };
  const builder = targetBuilders[/** @type {string} */ (canonOp['type'])];
  return builder !== undefined ? builder() : null;
}

/**
 * Builds the options object for buildResolution, conditionally including a reason.
 *
 * @param {{ kind: 'supersession'|'eventual_override'|'redundancy', code: string, winner: OpRecord, loser: OpRecord }} params - Resolution parameters.
 * @returns {{ winner: OpRecord, loser: OpRecord, kind: 'supersession'|'eventual_override'|'redundancy', winnerMode: 'immediate', code: string, reason?: string }} Resolution options.
 */
function buildResolutionOpts({ kind, code, winner, loser }) {
  /** @type {{ winner: OpRecord, loser: OpRecord, kind: 'supersession'|'eventual_override'|'redundancy', winnerMode: 'immediate', code: string, reason?: string }} */
  const opts = { winner, loser, kind, winnerMode: 'immediate', code };
  if (typeof loser.receiptReason === 'string') {
    opts.reason = loser.receiptReason;
  }
  return opts;
}

/**
 * Constructs a ConflictResolution describing how the reducer chose the winner over the loser.
 *
 * @param {{
 *   winner: OpRecord,
 *   loser: OpRecord,
 *   kind: 'supersession'|'eventual_override'|'redundancy',
 *   winnerMode: 'immediate'|'eventual',
 *   code: string,
 *   reason?: string
 * }} options - Resolution construction parameters.
 * @returns {ConflictResolution} The resolution record.
 */
function buildResolution({
  winner,
  loser,
  kind,
  winnerMode,
  code,
  reason,
}) {
  const comparatorType = kind === 'redundancy' ? 'effect_digest' : 'event_id';
  const basis = buildResolutionBasis(code, reason);
  const comparator = buildResolutionComparator(comparatorType, winner, loser);
  /** @type {ConflictResolution} */
  const resolution = {
    reducerId: CONFLICT_REDUCER_ID,
    basis,
    winnerMode,
  };
  if (comparator !== null && comparator !== undefined) {
    resolution.comparator = comparator;
  }
  return resolution;
}

/**
 * Builds the basis object for a conflict resolution, optionally including a reason.
 *
 * @param {string} code - The resolution basis code.
 * @param {string|undefined} reason - Optional human-readable reason.
 * @returns {{ code: string, reason?: string }} The basis object.
 */
function buildResolutionBasis(code, reason) {
  /** @type {{ code: string, reason?: string }} */
  const basis = { code };
  if (typeof reason === 'string' && reason.length > 0) {
    basis.reason = reason;
  }
  return basis;
}

/**
 * Builds the comparator object for a conflict resolution, including event IDs when applicable.
 *
 * @param {'event_id'|'effect_digest'} comparatorType - The type of comparison used.
 * @param {OpRecord} winner - The winning operation record.
 * @param {OpRecord} loser - The losing operation record.
 * @returns {ConflictResolution['comparator']} The comparator object.
 */
function buildResolutionComparator(comparatorType, winner, loser) {
  if (comparatorType !== 'event_id') {
    return { type: comparatorType };
  }
  return {
    type: comparatorType,
    winnerEventId: {
      lamport: winner.eventId.lamport,
      writerId: winner.eventId.writerId,
      patchSha: winner.eventId.patchSha,
      opIndex: winner.eventId.opIndex,
    },
    loserEventId: {
      lamport: loser.eventId.lamport,
      writerId: loser.eventId.writerId,
      patchSha: loser.eventId.patchSha,
      opIndex: loser.eventId.opIndex,
    },
  };
}

/**
 * Deduplicates and sorts an array of classification note codes.
 *
 * @param {string[]} noteCodes - Raw note codes, possibly with duplicates.
 * @returns {string[]} Sorted deduplicated note codes.
 */
function normalizeNoteCodes(noteCodes) {
  return [...new Set(noteCodes)].sort(compareStrings);
}

/**
 * Extracts sorted diagnostic codes from a diagnostics array for inclusion in hashes.
 *
 * @param {ConflictDiagnostic[]} diagnostics - The diagnostics to extract codes from.
 * @returns {string[]} Sorted diagnostic code strings.
 */
function diagnosticCodes(diagnostics) {
  return diagnostics.map((diagnostic) => diagnostic.code).sort(compareStrings);
}

/**
 * Converts raw patch entries into ordered PatchFrame objects with receipt placeholders.
 *
 * @param {Array<{ patch: PatchV2, sha: string }>} entries - Raw patch entries.
 * @returns {PatchFrame[]} Ordered patch frames.
 */
function buildPatchFrames(entries) {
  /** @type {PatchFrame[]} */
  const patchFrames = [];
  for (const entry of entries) {
    patchFrames.push(buildPatchFrame(entry, patchFrames.length));
  }
  return patchFrames;
}

/**
 * Loads all writer patches up to a lamport ceiling and converts them to patch frames.
 *
 * @param {WarpRuntime} graph - The warp runtime instance.
 * @param {number|null} lamportCeiling - Maximum lamport clock value, or null for unbounded.
 * @returns {Promise<{ frontier: Map<string, string>, patchFrames: PatchFrame[] }>} Frontier and frames.
 */
async function loadFrontierPatchFrames(graph, lamportCeiling) {
  const frontier = await graph.getFrontier();
  const writerIds = [...frontier.keys()].sort(compareStrings);
  /** @type {Array<{ patch: PatchV2, sha: string }>} */
  const entries = [];
  /** @type {PatchFrame[]} */
  for (const writerId of writerIds) {
    const writerEntries = await graph._loadWriterPatches(writerId);
    for (const entry of writerEntries) {
      if (lamportCeiling !== null && entry.patch.lamport > lamportCeiling) {
        continue;
      }
      entries.push(entry);
    }
  }
  return { frontier, patchFrames: buildPatchFrames(entries) };
}

/**
 * Constructs a single PatchFrame from a raw entry and its position in the sequence.
 *
 * @param {{ patch: PatchV2, sha: string }} entry - Raw patch entry.
 * @param {number} patchOrder - Zero-based position in the patch sequence.
 * @returns {PatchFrame} The constructed patch frame.
 */
function buildPatchFrame(entry, patchOrder) {
  return {
    patch: entry.patch,
    sha: entry.sha,
    receipt: emptyReceipt(),
    patchOrder,
    context: normalizeContext(entry.patch.context),
  };
}

/**
 * Creates a placeholder empty receipt for use before reducer replay.
 *
 * @returns {TickReceipt} An empty receipt with default values.
 */
function emptyReceipt() {
  return /** @type {TickReceipt} */ ({ patchSha: '', writer: '', lamport: 0, ops: [] });
}

/**
 * Replays all patches through the reducer and attaches the resulting receipts to each frame.
 *
 * @param {PatchFrame[]} patchFrames - The frames to attach receipts to (mutated in place).
 * @returns {void}
 */
function attachReceipts(patchFrames) {
  const reduced = /** @type {{ receipts: TickReceipt[] }} */ (
    reduceV5(
      patchFrames.map(({ patch, sha }) => ({ patch, sha })),
      undefined,
      { receipts: true },
    )
  );
  for (let i = 0; i < patchFrames.length; i++) {
    const frame = /** @type {PatchFrame} */ (patchFrames[i]);
    const receipt = /** @type {TickReceipt} */ (reduced.receipts[i]);
    frame.receipt = receipt;
  }
}

/**
 * Builds a scan window by sorting frames in reverse-causal order and applying the budget limit.
 *
 * @param {{
 *   patchFrames: PatchFrame[],
 *   maxPatches: number|null,
 *   lamportCeiling: number|null,
 *   diagnostics: ConflictDiagnostic[]
 * }} options - Scan window construction parameters.
 * @returns {ScanWindow} The constructed scan window.
 */
function buildScanWindow({ patchFrames, maxPatches, lamportCeiling, diagnostics }) {
  const reverseCausalFrames = [...patchFrames].sort(comparePatchFramesReverseCausal);
  const scannedFrames = maxPatches === null
    ? reverseCausalFrames
    : reverseCausalFrames.slice(0, maxPatches);
  const truncated = maxPatches !== null && reverseCausalFrames.length > maxPatches;
  if (truncated) {
    emitTruncationDiagnostic({ diagnostics, scannedFrames, maxPatches, lamportCeiling });
  }
  return {
    reverseCausalFrames,
    scannedFrames,
    scannedPatchShas: new Set(scannedFrames.map((frame) => frame.sha)),
    truncated,
  };
}

/**
 * Emits a diagnostic warning when the scan window was truncated by budget limits.
 *
 * @param {{
 *   diagnostics: ConflictDiagnostic[],
 *   scannedFrames: PatchFrame[],
 *   maxPatches: number|null,
 *   lamportCeiling: number|null
 * }} options - Truncation diagnostic parameters.
 * @returns {void}
 */
function emitTruncationDiagnostic({ diagnostics, scannedFrames, maxPatches, lamportCeiling }) {
  const lastScanned = scannedFrames[scannedFrames.length - 1];
  if (lastScanned === null || lastScanned === undefined) {
    return;
  }
  pushDiagnostic(diagnostics, {
    code: 'budget_truncated',
    message: `Conflict analysis truncated to ${String(maxPatches)} patches at ceiling ${describeLamportCeiling(lamportCeiling)}`,
    severity: 'warning',
    data: {
      traversalOrder: CONFLICT_TRAVERSAL_ORDER,
      scannedPatchCount: scannedFrames.length,
      lastScannedAnchor: buildTraversalAnchor(lastScanned),
    },
  });
}

/**
 * Builds a traversal anchor from a patch frame for diagnostic output.
 *
 * @param {PatchFrame} frame - The patch frame to extract an anchor from.
 * @returns {ConflictAnchor} The traversal anchor.
 */
function buildTraversalAnchor(frame) {
  return {
    patchSha: frame.sha,
    writerId: frame.patch.writer,
    lamport: frame.patch.lamport,
    opIndex: 0,
  };
}

/**
 * Creates an empty conflict collector to accumulate candidates during analysis.
 *
 * @returns {ConflictCollector} A fresh empty collector.
 */
function createCollector() {
  return {
    propertyWinnerByTarget: new Map(),
    propertyAppliedHistory: new Map(),
    equivalentWinnerByTargetEffect: new Map(),
    candidates: [],
  };
}

/**
 * Walks all patch frames to collect conflict candidates and eventual overrides.
 *
 * @param {ConflictAnalyzerService} service - The analyzer service for hashing.
 * @param {{
 *   patchFrames: PatchFrame[],
 *   scannedPatchShas: Set<string>,
 *   diagnostics: ConflictDiagnostic[]
 * }} options - Collection parameters.
 * @returns {Promise<ConflictCollector>} The populated conflict collector.
 */
async function collectConflictData(service, { patchFrames, scannedPatchShas, diagnostics }) {
  const collector = createCollector();
  for (const frame of patchFrames) {
    await analyzeFrameOps(service, { frame, scannedPatchShas, diagnostics, collector });
  }
  addEventualOverrideCandidates({ collector, scannedPatchShas });
  return collector;
}

/**
 * Analyzes all operations in a single patch frame to identify conflict candidates.
 *
 * @param {ConflictAnalyzerService} service - The analyzer service for hashing.
 * @param {{
 *   frame: PatchFrame,
 *   scannedPatchShas: Set<string>,
 *   diagnostics: ConflictDiagnostic[],
 *   collector: ConflictCollector
 * }} options - Per-frame analysis parameters.
 * @returns {Promise<void>}
 */
async function analyzeFrameOps(service, { frame, scannedPatchShas, diagnostics, collector }) {
  const { patch, receipt, sha } = frame;
  let receiptOpIndex = 0;
  for (let opIndex = 0; opIndex < patch.ops.length; opIndex++) {
    const result = await analyzeOneOp(service, {
      frame, opIndex, receiptOpIndex, receipt, diagnostics,
    });
    if (result === null) {
      continue;
    }
    receiptOpIndex = result.nextReceiptOpIndex;
    if (result.record === null) {
      continue;
    }
    processAnalyzedRecord({ collector, record: result.record, sha, scannedPatchShas });
  }
}

/**
 * Analyzes a single operation within a frame, returning the built record and updated receipt index.
 *
 * @param {ConflictAnalyzerService} service - The analyzer service for hashing.
 * @param {{
 *   frame: PatchFrame,
 *   opIndex: number,
 *   receiptOpIndex: number,
 *   receipt: TickReceipt,
 *   diagnostics: ConflictDiagnostic[]
 * }} options - Single-op analysis parameters.
 * @returns {Promise<{ record: OpRecord|null, nextReceiptOpIndex: number }|null>} Result or null to skip.
 */
async function analyzeOneOp(service, { frame, opIndex, receiptOpIndex, receipt, diagnostics }) {
  const rawOp = /** @type {import('../../types/WarpTypesV2.js').RawOpV2 | {type: string}} */ (frame.patch.ops[opIndex]);
  const canonOp = cloneObject(/** @type {Record<string, unknown>} */ (normalizeRawOp(rawOp)));
  const receiptOpType = receiptNameForOp(/** @type {string} */ (canonOp['type']));
  if (typeof receiptOpType !== 'string' || receiptOpType.length === 0) {
    return null;
  }
  const receiptOutcome = receipt.ops[receiptOpIndex];
  if (receiptOutcome === undefined || receiptOutcome === null) {
    pushMissingReceiptDiagnostic({ diagnostics, frame, opIndex });
    return { record: null, nextReceiptOpIndex: receiptOpIndex + 1 };
  }
  const record = await buildOpRecord(service, {
    frame, opIndex, receiptOpIndex, canonOp, receiptOutcome, receiptOpType, diagnostics,
  });
  return { record, nextReceiptOpIndex: receiptOpIndex + 1 };
}

/**
 * Processes an analyzed record by checking for immediate candidates and tracking applied records.
 *
 * @param {{
 *   collector: ConflictCollector,
 *   record: OpRecord,
 *   sha: string,
 *   scannedPatchShas: Set<string>
 * }} options - Processing parameters.
 * @returns {void}
 */
function processAnalyzedRecord({ collector, record, sha, scannedPatchShas }) {
  const currentPropertyWinner = collector.propertyWinnerByTarget.get(record.targetKey) ?? null;
  const eKey = effectKey(record.target, record.effectDigest);
  const priorEquivalent = collector.equivalentWinnerByTargetEffect.get(eKey) ?? null;
  if (scannedPatchShas.has(sha)) {
    addImmediateCandidates({ collector, record, currentPropertyWinner, priorEquivalent });
  }
  trackAppliedRecord({ collector, record });
}

/**
 * Pushes a diagnostic warning when a receipt outcome is missing for an operation.
 *
 * @param {{
 *   diagnostics: ConflictDiagnostic[],
 *   frame: PatchFrame,
 *   opIndex: number
 * }} options - Diagnostic parameters.
 * @returns {void}
 */
function pushMissingReceiptDiagnostic({ diagnostics, frame, opIndex }) {
  pushDiagnostic(diagnostics, {
    code: 'receipt_unavailable',
    message: `Receipt outcome missing for ${frame.patch.writer}@${frame.patch.lamport}#${opIndex}`,
    severity: 'warning',
    data: {
      patchSha: frame.sha,
      writerId: frame.patch.writer,
      lamport: frame.patch.lamport,
      opIndex,
    },
  });
}

/**
 * Builds a full OpRecord from a canonical op, its receipt outcome, and frame context.
 *
 * @param {ConflictAnalyzerService} service - The analyzer service for hashing.
 * @param {{
 *   frame: PatchFrame,
 *   opIndex: number,
 *   receiptOpIndex: number,
 *   canonOp: Record<string, unknown>,
 *   receiptOutcome: { result: 'applied'|'superseded'|'redundant', reason?: string, target: string },
 *   receiptOpType: string,
 *   diagnostics: ConflictDiagnostic[]
 * }} options - Record construction parameters.
 * @returns {Promise<OpRecord|null>} The built record or null if identity/digest is unavailable.
 */
async function buildOpRecord(service, {
  frame,
  opIndex,
  receiptOpIndex,
  canonOp,
  receiptOutcome,
  receiptOpType,
  diagnostics,
}) {
  const target = await buildConflictTarget(service, { canonOp, receiptTarget: receiptOutcome.target });
  if (target === null) {
    pushRecordDiagnostic({ diagnostics, code: 'anchor_incomplete', messagePrefix: 'Target identity unavailable', frame, opIndex });
    return null;
  }
  const effectDigest = await buildEffectDigest(service, { target, receiptOpType, canonOp });
  if (typeof effectDigest !== 'string' || effectDigest.length === 0) {
    pushRecordDiagnostic({ diagnostics, code: 'digest_unavailable', messagePrefix: 'Effect payload unavailable', frame, opIndex });
    return null;
  }
  return assembleOpRecord({ frame, opIndex, receiptOpIndex, receiptOpType, receiptOutcome, target, effectDigest });
}

/**
 * Assembles the final OpRecord object from validated components.
 *
 * @param {{
 *   frame: PatchFrame,
 *   opIndex: number,
 *   receiptOpIndex: number,
 *   receiptOpType: string,
 *   receiptOutcome: { result: 'applied'|'superseded'|'redundant', reason?: string, target: string },
 *   target: ConflictTarget,
 *   effectDigest: string
 * }} options - Validated record components.
 * @returns {OpRecord} The assembled operation record.
 */
function assembleOpRecord({ frame, opIndex, receiptOpIndex, receiptOpType, receiptOutcome, target, effectDigest }) {
  const { patch, sha, context, patchOrder } = frame;
  /** @type {OpRecord} */
  const record = {
    target,
    targetKey: target.targetDigest,
    patchSha: sha,
    writerId: patch.writer,
    lamport: patch.lamport,
    opIndex,
    receiptOpIndex,
    opType: receiptOpType,
    receiptResult: receiptOutcome.result,
    effectDigest,
    eventId: createEventId(patch.lamport, patch.writer, sha, opIndex),
    context,
    patchOrder,
  };
  if (typeof receiptOutcome.reason === 'string') {
    record.receiptReason = receiptOutcome.reason;
  }
  return record;
}

/**
 * Builds a ConflictTarget by computing a target identity and hashing it for the digest.
 *
 * @param {ConflictAnalyzerService} service - The analyzer service for hashing.
 * @param {{ canonOp: Record<string, unknown>, receiptTarget: string }} options - Target inputs.
 * @returns {Promise<ConflictTarget|null>} The conflict target or null.
 */
async function buildConflictTarget(service, { canonOp, receiptTarget }) {
  const targetIdentity = buildTargetIdentity(canonOp, receiptTarget);
  if (targetIdentity === null || targetIdentity === undefined) {
    return null;
  }
  return {
    ...targetIdentity,
    targetDigest: await service._hash(targetIdentity),
  };
}

/**
 * Computes the effect digest by normalizing the effect payload and hashing it.
 *
 * @param {ConflictAnalyzerService} service - The analyzer service for hashing.
 * @param {{
 *   target: ConflictTarget,
 *   receiptOpType: string,
 *   canonOp: Record<string, unknown>
 * }} options - Effect digest inputs.
 * @returns {Promise<string|null>} The hex digest or null if normalization fails.
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
 * @param {{
 *   diagnostics: ConflictDiagnostic[],
 *   code: string,
 *   messagePrefix: string,
 *   frame: PatchFrame,
 *   opIndex: number
 * }} options - Diagnostic parameters.
 * @returns {void}
 */
function pushRecordDiagnostic({ diagnostics, code, messagePrefix, frame, opIndex }) {
  pushDiagnostic(diagnostics, {
    code,
    message: `${messagePrefix} for ${frame.patch.writer}@${frame.patch.lamport}#${opIndex}`,
    severity: 'warning',
    data: {
      patchSha: frame.sha,
      writerId: frame.patch.writer,
      lamport: frame.patch.lamport,
      opIndex,
    },
  });
}

/**
 * Adds immediate supersession and redundancy candidates for a record within the scan window.
 *
 * @param {{
 *   collector: ConflictCollector,
 *   record: OpRecord,
 *   currentPropertyWinner: OpRecord|null,
 *   priorEquivalent: OpRecord|null
 * }} options - Candidate identification parameters.
 * @returns {void}
 */
function addImmediateCandidates({ collector, record, currentPropertyWinner, priorEquivalent }) {
  maybeAddSupersessionCandidate({ collector, record, currentPropertyWinner });
  maybeAddRedundancyCandidate({ collector, record, priorEquivalent });
}

/**
 * Adds a supersession candidate if the record was superseded by the current property winner.
 *
 * @param {{
 *   collector: ConflictCollector,
 *   record: OpRecord,
 *   currentPropertyWinner: OpRecord|null
 * }} options - Supersession check parameters.
 * @returns {void}
 */
function maybeAddSupersessionCandidate({ collector, record, currentPropertyWinner }) {
  if (!isPropertySetRecord(record) || record.receiptResult !== 'superseded' || currentPropertyWinner === null) {
    return;
  }
  const resOpts = buildResolutionOpts({ kind: 'supersession', code: 'receipt_superseded', winner: currentPropertyWinner, loser: record });
  collector.candidates.push({
    kind: 'supersession',
    target: record.target,
    winner: currentPropertyWinner,
    loser: record,
    resolution: buildResolution(resOpts),
    noteCodes: normalizeNoteCodes([
      CLASSIFICATION_NOTES.RECEIPT_SUPERSEDED,
      CLASSIFICATION_NOTES.SAME_TARGET,
      record.writerId !== currentPropertyWinner.writerId ? CLASSIFICATION_NOTES.DIFFERENT_WRITER : '',
      inferRelationNote(currentPropertyWinner, record),
    ].filter(Boolean)),
  });
}

/**
 * Adds a redundancy candidate if the record was redundant with a prior equivalent effect.
 *
 * @param {{
 *   collector: ConflictCollector,
 *   record: OpRecord,
 *   priorEquivalent: OpRecord|null
 * }} options - Redundancy check parameters.
 * @returns {void}
 */
function maybeAddRedundancyCandidate({ collector, record, priorEquivalent }) {
  if (record.receiptResult !== 'redundant' || priorEquivalent === null) {
    return;
  }
  collector.candidates.push({
    kind: 'redundancy',
    target: record.target,
    winner: priorEquivalent,
    loser: record,
    resolution: buildResolution(buildResolutionOpts({ kind: 'redundancy', code: 'receipt_redundant', winner: priorEquivalent, loser: record })),
    noteCodes: normalizeNoteCodes([
      CLASSIFICATION_NOTES.RECEIPT_REDUNDANT,
      CLASSIFICATION_NOTES.SAME_TARGET,
      CLASSIFICATION_NOTES.REPLAY_EQUIVALENT_EFFECT,
    ]),
  });
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

/**
 * Checks whether an operation record is a property-set type (node or edge).
 *
 * @param {OpRecord} record - The record to check.
 * @returns {boolean} True if the record is a NodePropSet or EdgePropSet.
 */
function isPropertySetRecord(record) {
  return record.opType === 'NodePropSet' || record.opType === 'EdgePropSet';
}

/**
 * Tracks an applied record in the collector for property winner and equivalent effect lookups.
 *
 * @param {{
 *   collector: ConflictCollector,
 *   record: OpRecord
 * }} options - Tracking parameters.
 * @returns {void}
 */
function trackAppliedRecord({ collector, record }) {
  if (record.receiptResult !== 'applied') {
    return;
  }
  collector.equivalentWinnerByTargetEffect.set(effectKey(record.target, record.effectDigest), record);
  if (!isPropertySetRecord(record)) {
    return;
  }
  const history = collector.propertyAppliedHistory.get(record.targetKey) ?? [];
  history.push(record);
  collector.propertyAppliedHistory.set(record.targetKey, history);
  collector.propertyWinnerByTarget.set(record.targetKey, record);
}

/**
 * Scans applied property history to find eventual-override candidates across different writers.
 *
 * @param {{
 *   collector: ConflictCollector,
 *   scannedPatchShas: Set<string>
 * }} options - Eventual override scan parameters.
 * @returns {void}
 */
function addEventualOverrideCandidates({ collector, scannedPatchShas }) {
  for (const [targetDigest, history] of collector.propertyAppliedHistory) {
    const finalWinner = collector.propertyWinnerByTarget.get(targetDigest);
    if (finalWinner === undefined) {
      continue;
    }
    emitEventualOverridesForTarget({ collector, history, finalWinner, scannedPatchShas });
  }
}

/**
 * Emits eventual override candidates for a single target's applied history.
 *
 * @param {{
 *   collector: ConflictCollector,
 *   history: OpRecord[],
 *   finalWinner: OpRecord,
 *   scannedPatchShas: Set<string>
 * }} options - Per-target override parameters.
 * @returns {void}
 */
function emitEventualOverridesForTarget({ collector, history, finalWinner, scannedPatchShas }) {
  for (const loser of history) {
    if (!isEventualOverrideLoser({ loser, finalWinner, scannedPatchShas })) {
      continue;
    }
    const relation = inferCausalRelation(finalWinner, loser);
    collector.candidates.push({
      kind: 'eventual_override',
      target: finalWinner.target,
      winner: finalWinner,
      loser,
      resolution: buildResolution({
        winner: finalWinner,
        loser,
        kind: 'eventual_override',
        winnerMode: 'eventual',
        code: 'effective_state_override',
      }),
      noteCodes: normalizeNoteCodes([
        CLASSIFICATION_NOTES.SAME_TARGET,
        CLASSIFICATION_NOTES.DIFFERENT_WRITER,
        CLASSIFICATION_NOTES.DIGEST_DIFFERS,
        CLASSIFICATION_NOTES.EFFECTIVE_THEN_LOST,
        relation === 'concurrent'
          ? CLASSIFICATION_NOTES.CONCURRENT_TO_WINNER
          : CLASSIFICATION_NOTES.ORDERED_BEFORE_WINNER,
      ]),
    });
  }
}

/**
 * Determines whether a record qualifies as an eventual-override loser relative to the final winner.
 *
 * @param {{
 *   loser: OpRecord,
 *   finalWinner: OpRecord,
 *   scannedPatchShas: Set<string>
 * }} options - Qualification check parameters.
 * @returns {boolean} True if the record is an eventual-override loser.
 */
function isEventualOverrideLoser({ loser, finalWinner, scannedPatchShas }) {
  if (sameRecord(loser, finalWinner)) {
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
 * Checks whether two op records refer to the same patch and operation index.
 *
 * @param {OpRecord} a - First record.
 * @param {OpRecord} b - Second record.
 * @returns {boolean} True if they are the same record.
 */
function sameRecord(a, b) {
  return a.patchSha === b.patchSha && a.opIndex === b.opIndex;
}

/**
 * Groups conflict candidates by their deterministic group key to merge co-occurring losers.
 *
 * @param {ConflictCandidate[]} candidates - The raw conflict candidates to group.
 * @returns {Map<string, GroupedConflict>} Grouped conflicts keyed by group key.
 */
function groupCandidates(candidates) {
  /** @type {Map<string, GroupedConflict>} */
  const grouped = new Map();
  for (const candidate of candidates) {
    const key = candidateGroupKey({
      target: candidate.target,
      kind: candidate.kind,
      winner: candidate.winner,
      resolution: candidate.resolution,
    });
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
    const group = /** @type {GroupedConflict} */ (grouped.get(key));
    group.losers.push(candidate.loser);
    for (const code of candidate.noteCodes) {
      group.noteCodes.add(code);
    }
  }
  return grouped;
}

/**
 * Transforms grouped conflicts into sorted, finalized ConflictTrace records.
 *
 * @param {ConflictAnalyzerService} service - The analyzer service for hashing.
 * @param {{
 *   grouped: Iterable<GroupedConflict>,
 *   evidence: 'summary'|'standard'|'full',
 *   resolvedCoordinate: ConflictResolvedCoordinate
 * }} options - Trace construction parameters.
 * @returns {Promise<ConflictTrace[]>} Sorted conflict traces.
 */
async function buildConflictTraces(service, { grouped, evidence, resolvedCoordinate }) {
  /** @type {ConflictTrace[]} */
  const traces = [];
  for (const group of grouped) {
    traces.push(await buildConflictTrace(service, { group, evidence, resolvedCoordinate }));
  }
  traces.sort(compareConflictTraces);
  return traces;
}

/**
 * Compares two conflict traces for deterministic ordering by kind, target, winner, then id.
 *
 * @param {ConflictTrace} a - First trace.
 * @param {ConflictTrace} b - Second trace.
 * @returns {number} Negative, zero, or positive for ordering.
 */
function compareConflictTraces(a, b) {
  const kindCmp = compareStrings(a.kind, b.kind);
  if (kindCmp !== 0) {
    return kindCmp;
  }
  const targetCmp = compareStrings(a.target.targetDigest, b.target.targetDigest);
  if (targetCmp !== 0) {
    return targetCmp;
  }
  const winnerCmp = compareAnchors(a.winner.anchor, b.winner.anchor);
  return winnerCmp !== 0 ? winnerCmp : compareStrings(a.conflictId, b.conflictId);
}

/**
 * Builds a single ConflictTrace from a grouped conflict, computing IDs and fingerprints.
 *
 * @param {ConflictAnalyzerService} service - The analyzer service for hashing.
 * @param {{
 *   group: GroupedConflict,
 *   evidence: 'summary'|'standard'|'full',
 *   resolvedCoordinate: ConflictResolvedCoordinate
 * }} options - Trace construction parameters.
 * @returns {Promise<ConflictTrace>} The finalized conflict trace.
 */
async function buildConflictTrace(service, { group, evidence, resolvedCoordinate }) {
  const winner = buildWinner(group.winner);
  const losers = buildLosers(group, evidence);
  const whyFingerprint = await service._hash(buildWhyFingerprintInput(group, losers));
  const conflictId = await service._hash(buildConflictIdInput({ group, winner, losers, resolvedCoordinate }));
  return {
    conflictId,
    kind: group.kind,
    target: group.target,
    winner,
    losers,
    resolution: group.resolution,
    whyFingerprint,
    ...(evidence === 'full' ? { classificationNotes: [...group.noteCodes].sort(compareStrings) } : {}),
    evidence: buildTraceEvidence(group, evidence),
  };
}

/**
 * Wraps a winning OpRecord into the ConflictWinner shape with anchor and digest.
 *
 * @param {OpRecord} winner - The winning operation record.
 * @returns {ConflictWinner} The conflict winner.
 */
function buildWinner(winner) {
  return {
    anchor: buildRecordAnchor(winner),
    effectDigest: winner.effectDigest,
  };
}

/**
 * Builds the sorted array of ConflictParticipant losers from a grouped conflict.
 *
 * @param {GroupedConflict} group - The grouped conflict containing losers.
 * @param {'summary'|'standard'|'full'} evidence - The evidence level for detail inclusion.
 * @returns {ConflictParticipant[]} Sorted loser participants.
 */
function buildLosers(group, evidence) {
  return group.losers
    .map((loser) => buildLoserParticipant({ winner: group.winner, loser, kind: group.kind, evidence }))
    .sort((a, b) => compareAnchors(a.anchor, b.anchor));
}

/**
 * Builds a ConflictParticipant for a single loser with causal relation and optional notes.
 *
 * @param {{
 *   winner: OpRecord,
 *   loser: OpRecord,
 *   kind: 'supersession'|'eventual_override'|'redundancy',
 *   evidence: 'summary'|'standard'|'full'
 * }} options - Participant construction parameters.
 * @returns {ConflictParticipant} The loser participant.
 */
function buildLoserParticipant({ winner, loser, kind, evidence }) {
  const relation = inferCausalRelation(winner, loser);
  const participant = {
    anchor: buildRecordAnchor(loser),
    effectDigest: loser.effectDigest,
    ...(relation !== undefined ? { causalRelationToWinner: relation } : {}),
    structurallyDistinctAlternative: loser.effectDigest !== winner.effectDigest,
    replayableFromAnchors: true,
  };
  if (evidence !== 'full') {
    return participant;
  }
  return {
    ...participant,
    notes: buildLoserNotes({ winner, loser, kind, relation }),
  };
}

/**
 * Converts an OpRecord into a ConflictAnchor with receipt cross-references.
 *
 * @param {OpRecord} record - The operation record.
 * @returns {ConflictAnchor} The record anchor.
 */
function buildRecordAnchor(record) {
  return {
    patchSha: record.patchSha,
    writerId: record.writerId,
    lamport: record.lamport,
    opIndex: record.opIndex,
    receiptPatchSha: record.patchSha,
    receiptLamport: record.lamport,
    receiptOpIndex: record.receiptOpIndex,
  };
}

/**
 * Builds detailed classification notes for a loser participant at full evidence level.
 *
 * @param {{
 *   winner: OpRecord,
 *   loser: OpRecord,
 *   kind: 'supersession'|'eventual_override'|'redundancy',
 *   relation: ConflictParticipant['causalRelationToWinner']
 * }} options - Note construction parameters.
 * @returns {string[]} Sorted deduplicated classification notes.
 */
function buildLoserNotes({ winner, loser, kind, relation }) {
  /** @type {string[]} */
  const notes = [CLASSIFICATION_NOTES.SAME_TARGET];
  appendKindNotes(notes, kind);
  appendRelationNotes(notes, relation);
  if (loser.writerId !== winner.writerId) {
    notes.push(CLASSIFICATION_NOTES.DIFFERENT_WRITER);
  }
  return normalizeNoteCodes(notes);
}

/**
 * Appends kind-specific classification notes to the notes array.
 *
 * @param {string[]} notes - The notes array to append to.
 * @param {'supersession'|'eventual_override'|'redundancy'} kind - The conflict kind.
 * @returns {void}
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
 * Appends causal-relation classification notes to the notes array.
 *
 * @param {string[]} notes - The notes array to append to.
 * @param {ConflictParticipant['causalRelationToWinner']} relation - The causal relation.
 * @returns {void}
 */
function appendRelationNotes(notes, relation) {
  if (relation === 'concurrent') {
    notes.push(CLASSIFICATION_NOTES.CONCURRENT_TO_WINNER);
  }
  if (relation === 'ordered') {
    notes.push(CLASSIFICATION_NOTES.ORDERED_BEFORE_WINNER);
  }
}

/**
 * Builds the input for the why-fingerprint hash from a grouped conflict and its losers.
 *
 * @param {GroupedConflict} group - The grouped conflict.
 * @param {ConflictParticipant[]} losers - The built loser participants.
 * @returns {Record<string, unknown>} Hash input record.
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
 * Builds the input for the conflict ID hash including coordinate and anchor information.
 *
 * @param {{
 *   group: GroupedConflict,
 *   winner: ConflictWinner,
 *   losers: ConflictParticipant[],
 *   resolvedCoordinate: ConflictResolvedCoordinate
 * }} options - Conflict ID input parameters.
 * @returns {Record<string, unknown>} Hash input record.
 */
function buildConflictIdInput({ group, winner, losers, resolvedCoordinate }) {
  return {
    analysisVersion: CONFLICT_ANALYSIS_VERSION,
    resolvedCoordinate,
    kind: group.kind,
    targetDigest: group.target.targetDigest,
    reducerId: group.resolution.reducerId,
    winnerAnchor: anchorString(winner.anchor),
    loserAnchors: losers.map((loser) => anchorString(loser.anchor)),
  };
}

/**
 * Builds the evidence section of a conflict trace with patch and receipt references.
 *
 * @param {GroupedConflict} group - The grouped conflict.
 * @param {'summary'|'standard'|'full'} evidence - The evidence level.
 * @returns {ConflictTrace['evidence']} The evidence record.
 */
function buildTraceEvidence(group, evidence) {
  return {
    level: evidence,
    patchRefs: [...new Set([group.winner.patchSha, ...group.losers.map((loser) => loser.patchSha)])].sort(compareStrings),
    receiptRefs: [
      buildReceiptRef(group.winner),
      ...group.losers.map(buildReceiptRef),
    ].sort(compareReceiptRefs),
  };
}

/**
 * Builds a receipt reference from an operation record for inclusion in trace evidence.
 *
 * @param {OpRecord} record - The operation record.
 * @returns {{ patchSha: string, lamport: number, opIndex: number }} Receipt reference.
 */
function buildReceiptRef(record) {
  return {
    patchSha: record.patchSha,
    lamport: record.lamport,
    opIndex: record.receiptOpIndex,
  };
}

/**
 * Compares two receipt references for deterministic sorting by patch SHA and op index.
 *
 * @param {{ patchSha: string, opIndex: number }} a - First receipt reference.
 * @param {{ patchSha: string, opIndex: number }} b - Second receipt reference.
 * @returns {number} Negative, zero, or positive for ordering.
 */
function compareReceiptRefs(a, b) {
  return compareStrings(`${a.patchSha}:${a.opIndex}`, `${b.patchSha}:${b.opIndex}`);
}

/**
 * Tests whether a conflict trace passes all user-supplied filters (kind, entity, target, writer).
 *
 * @param {ConflictTrace} trace - The trace to test.
 * @param {ConflictAnalysisRequest} request - The normalized filter request.
 * @returns {boolean} True if the trace passes all filters.
 */
function matchesFilters(trace, request) {
  return matchesKindFilter(trace, request)
    && matchesEntityFilter(trace, request)
    && matchesTargetFilter(trace, request)
    && matchesWriterFilter(trace, request);
}

/**
 * Checks whether a trace passes the kind filter.
 *
 * @param {ConflictTrace} trace - The trace to test.
 * @param {ConflictAnalysisRequest} request - The filter request.
 * @returns {boolean} True if the trace passes.
 */
function matchesKindFilter(trace, request) {
  return request.kinds === null || request.kinds.includes(trace.kind);
}

/**
 * Checks whether a trace passes the entity filter.
 *
 * @param {ConflictTrace} trace - The trace to test.
 * @param {ConflictAnalysisRequest} request - The filter request.
 * @returns {boolean} True if the trace passes.
 */
function matchesEntityFilter(trace, request) {
  if (typeof request.entityId !== 'string' || request.entityId.length === 0) {
    return true;
  }
  return targetTouchesEntity(trace.target, request.entityId);
}

/**
 * Checks whether a trace passes the target selector filter.
 *
 * @param {ConflictTrace} trace - The trace to test.
 * @param {ConflictAnalysisRequest} request - The filter request.
 * @returns {boolean} True if the trace passes.
 */
function matchesTargetFilter(trace, request) {
  if (request.target === null || request.target === undefined) {
    return true;
  }
  return matchesTargetSelector(trace.target, request.target);
}

/**
 * Checks whether a trace passes the writer filter.
 *
 * @param {ConflictTrace} trace - The trace to test.
 * @param {ConflictAnalysisRequest} request - The filter request.
 * @returns {boolean} True if the trace passes.
 */
function matchesWriterFilter(trace, request) {
  if (typeof request.writerId !== 'string' || request.writerId.length === 0) {
    return true;
  }
  return traceTouchesWriter(trace, request.writerId);
}

/**
 * Filters an array of conflict traces against the normalized analysis options.
 *
 * @param {ConflictTrace[]} traces - The traces to filter.
 * @param {ConflictAnalysisRequest} request - The normalized filter request.
 * @returns {ConflictTrace[]} Traces that match all filters.
 */
function filterTraces(traces, request) {
  return traces.filter((trace) => matchesFilters(trace, request));
}

/**
 * Computes a snapshot hash over the entire analysis result for integrity verification.
 *
 * @param {ConflictAnalyzerService} service - The analyzer service for hashing.
 * @param {{
 *   resolvedCoordinate: ConflictResolvedCoordinate,
 *   request: ConflictAnalysisRequest,
 *   truncated: boolean,
 *   diagnostics: ConflictDiagnostic[],
 *   traces: ConflictTrace[]
 * }} options - Snapshot hash inputs.
 * @returns {Promise<string>} Hex-encoded snapshot hash.
 */
async function buildAnalysisSnapshotHash(service, {
  resolvedCoordinate,
  request,
  truncated,
  diagnostics,
  traces,
}) {
  return await service._hash({
    analysisVersion: CONFLICT_ANALYSIS_VERSION,
    resolvedCoordinate,
    filters: request.toSnapshotFilterRecord(),
    truncation: truncated,
    conflictIds: traces.map((trace) => trace.conflictId).sort(compareStrings),
    diagnosticCodes: diagnosticCodes(diagnostics),
  });
}

/**
 * Computes a snapshot hash for an analysis that found zero conflicts.
 *
 * @param {ConflictAnalyzerService} service - The analyzer service for hashing.
 * @param {{
 *   resolvedCoordinate: ConflictResolvedCoordinate,
 *   request: ConflictAnalysisRequest
 * }} options - Empty snapshot inputs.
 * @returns {Promise<string>} Hex-encoded snapshot hash.
 */
async function buildEmptySnapshotHash(service, { resolvedCoordinate, request }) {
  return await service._hash({
    analysisVersion: CONFLICT_ANALYSIS_VERSION,
    resolvedCoordinate,
    filters: request.toSnapshotFilterRecord(),
    truncation: false,
    conflictIds: [],
    diagnosticCodes: [],
  });
}

/**
 * Resolves the analysis context by loading patch frames from either a strand or the frontier.
 *
 * @param {ConflictAnalyzerService} service - The analyzer service.
 * @param {ConflictAnalysisRequest} request - The normalized request.
 * @returns {Promise<{ patchFrames: PatchFrame[], resolvedCoordinate: ConflictResolvedCoordinate }>} Context.
 */
async function resolveAnalysisContext(service, request) {
  if (request.usesStrandCoordinate()) {
    return await resolveStrandContext(service, request);
  }
  return await resolveFrontierContext(service, request);
}

/**
 * Resolves the analysis context from a strand, loading its patches and building the coordinate.
 *
 * @param {ConflictAnalyzerService} service - The analyzer service.
 * @param {ConflictAnalysisRequest} request - The normalized request with strandId.
 * @returns {Promise<{ patchFrames: PatchFrame[], resolvedCoordinate: ConflictResolvedCoordinate }>} Context.
 */
async function resolveStrandContext(service, request) {
  const strands = new StrandService({ graph: service._graph });
  const descriptor = await strands.getOrThrow(/** @type {string} */ (request.strandId));
  const entries = await strands.getPatchEntries(/** @type {string} */ (request.strandId), {
    ceiling: request.lamportCeiling,
  });
  const frontier = new Map(
    Object.entries(descriptor.baseObservation.frontier).sort(([a], [b]) => compareStrings(a, b)),
  );
  return {
    patchFrames: buildPatchFrames(entries),
    resolvedCoordinate: buildResolvedCoordinate({
      coordinateKind: 'strand',
      frontier,
      lamportCeiling: request.lamportCeiling,
      maxPatches: request.maxPatches,
      frontierDigest: descriptor.baseObservation.frontierDigest,
      strand: buildResolvedStrandMetadata(descriptor),
    }),
  };
}

/**
 * Resolves the analysis context from the frontier, loading all writer patches.
 *
 * @param {ConflictAnalyzerService} service - The analyzer service.
 * @param {ConflictAnalysisRequest} request - The normalized request.
 * @returns {Promise<{ patchFrames: PatchFrame[], resolvedCoordinate: ConflictResolvedCoordinate }>} Context.
 */
async function resolveFrontierContext(service, request) {
  const { frontier, patchFrames } = await loadFrontierPatchFrames(
    service._graph,
    request.lamportCeiling,
  );
  const frontierDigest = await service._hash(frontierToRecord(frontier));
  return {
    patchFrames,
    resolvedCoordinate: buildResolvedCoordinate({
      coordinateKind: 'frontier',
      frontier,
      lamportCeiling: request.lamportCeiling,
      maxPatches: request.maxPatches,
      frontierDigest,
    }),
  };
}

/**
 * Assembles the final ConflictAnalysis result object from its component parts.
 *
 * @param {{
 *   resolvedCoordinate: ConflictResolvedCoordinate,
 *   analysisSnapshotHash: string,
 *   diagnostics: ConflictDiagnostic[],
 *   conflicts: ConflictTrace[]
 * }} options - Result components.
 * @returns {ConflictAnalysis} The assembled analysis result.
 */
function buildConflictAnalysisResult({
  resolvedCoordinate,
  analysisSnapshotHash,
  diagnostics,
  conflicts,
}) {
  return {
    analysisVersion: CONFLICT_ANALYSIS_VERSION,
    resolvedCoordinate,
    analysisSnapshotHash,
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
    conflicts,
  };
}

/**
 * ConflictAnalyzerService analyzes read-only patch history for conflict traces.
 */
export class ConflictAnalyzerService {
  /**
   * Initializes the analyzer with a warp runtime graph instance.
   *
   * @param {{ graph: WarpRuntime }} options - Construction options with graph dependency.
   */
  constructor({ graph }) {
    this._graph = graph;
    /** @type {Map<string, string>} */
    this._digestCache = new Map();
  }

  /**
   * Computes a cached SHA-256 digest of the canonical serialization of a payload.
   *
   * @param {unknown} payload - The value to hash.
   * @returns {Promise<string>} Hex-encoded digest.
   */
  async _hash(payload) {
    return await hashPayload({
      digestCache: this._digestCache,
      crypto: this._graph._crypto,
      payload,
    });
  }

  /**
   * Performs a full conflict analysis over the patch history, returning all detected traces.
   *
 * @param {ConflictAnalyzeOptions} [options] - Optional analysis filters and budget.
  * @returns {Promise<ConflictAnalysis>} The complete analysis result.
  */
  async analyze(options) {
    const request = ConflictAnalysisRequest.from(options);
    /** @type {ConflictDiagnostic[]} */
    const diagnostics = [];
    const { patchFrames, resolvedCoordinate } = await resolveAnalysisContext(this, request);
    if (patchFrames.length === 0) {
      return await buildEmptyAnalysis(this, { resolvedCoordinate, request, diagnostics });
    }
    return await runFullAnalysis(this, { patchFrames, resolvedCoordinate, request, diagnostics });
  }
}

/**
 * Builds the analysis result for the trivial case of zero patch frames.
 *
 * @param {ConflictAnalyzerService} service - The analyzer service.
 * @param {{
 *   resolvedCoordinate: ConflictResolvedCoordinate,
 *   request: ConflictAnalysisRequest,
 *   diagnostics: ConflictDiagnostic[]
 * }} options - Empty analysis parameters.
 * @returns {Promise<ConflictAnalysis>} The empty analysis result.
 */
async function buildEmptyAnalysis(service, { resolvedCoordinate, request, diagnostics }) {
  return buildConflictAnalysisResult({
    resolvedCoordinate,
    analysisSnapshotHash: await buildEmptySnapshotHash(service, { resolvedCoordinate, request }),
    diagnostics,
    conflicts: [],
  });
}

/**
 * Executes the full analysis pipeline: attach receipts, scan, collect, trace, filter, and hash.
 *
 * @param {ConflictAnalyzerService} service - The analyzer service.
 * @param {{
 *   patchFrames: PatchFrame[],
 *   resolvedCoordinate: ConflictResolvedCoordinate,
 *   request: ConflictAnalysisRequest,
 *   diagnostics: ConflictDiagnostic[]
 * }} options - Full analysis parameters.
 * @returns {Promise<ConflictAnalysis>} The complete analysis result.
 */
async function runFullAnalysis(service, { patchFrames, resolvedCoordinate, request, diagnostics }) {
  attachReceipts(patchFrames);
  const scanWindow = buildScanWindow({
    patchFrames, maxPatches: request.maxPatches, lamportCeiling: request.lamportCeiling, diagnostics,
  });
  const collector = await collectConflictData(service, {
    patchFrames, scannedPatchShas: scanWindow.scannedPatchShas, diagnostics,
  });
  const traces = await buildConflictTraces(service, {
    grouped: groupCandidates(collector.candidates).values(), evidence: request.evidence, resolvedCoordinate,
  });
  const conflicts = filterTraces(traces, request);
  const analysisSnapshotHash = await buildAnalysisSnapshotHash(service, {
    resolvedCoordinate, request, truncated: scanWindow.truncated, diagnostics, traces: conflicts,
  });
  return buildConflictAnalysisResult({ resolvedCoordinate, analysisSnapshotHash, diagnostics, conflicts });
}

export default ConflictAnalyzerService;
