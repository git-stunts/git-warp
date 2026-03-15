/**
 * ConflictAnalyzerService — read-only conflict provenance analysis over patch history.
 *
 * This service computes deterministic conflict traces from patch history,
 * reducer receipts, and current resolved state without mutating graph state,
 * checkpoints, caches, or other durable storage.
 *
 * @module domain/services/ConflictAnalyzerService
 */

import QueryError from '../errors/QueryError.js';
import { reduceV5, normalizeRawOp } from './JoinReducer.js';
import { canonicalStringify } from '../utils/canonicalStringify.js';
import { createEventId } from '../utils/EventId.js';
import { decodeEdgeKey } from './KeyCodec.js';

/** @typedef {import('../WarpGraph.js').default} WarpGraph */
/** @typedef {import('../types/WarpTypesV2.js').PatchV2} PatchV2 */
/** @typedef {import('../types/TickReceipt.js').TickReceipt} TickReceipt */
/** @typedef {import('../utils/EventId.js').EventId} EventId */

export const CONFLICT_ANALYSIS_VERSION = 'conflict-analyzer/v1';
export const CONFLICT_TRAVERSAL_ORDER = 'lamport_desc_writer_desc_patch_desc';
export const CONFLICT_TRUNCATION_POLICY = 'scan_budget_max_patches_reverse_causal';
export const CONFLICT_REDUCER_ID = 'join-reducer-v5';

const VALID_KINDS = new Set(['supersession', 'eventual_override', 'redundancy']);
const VALID_EVIDENCE_LEVELS = new Set(['summary', 'standard', 'full']);
const VALID_TARGET_KINDS = new Set(['node', 'edge', 'node_property', 'edge_property']);
/** @type {Array<'entityId'|'propertyKey'|'from'|'to'|'label'>} */
const TARGET_SELECTOR_FIELDS = ['entityId', 'propertyKey', 'from', 'to', 'label'];

/**
 * Receipt op type mapping. Kept local so the analyzer can interpret canonical ops
 * without depending on JoinReducer internals that are not part of the public API.
 */
/** @type {Readonly<Record<string, string>>} */
const RECEIPT_OP_TYPE = Object.freeze({
  NodeAdd: 'NodeAdd',
  NodeRemove: 'NodeTombstone',
  EdgeAdd: 'EdgeAdd',
  EdgeRemove: 'EdgeTombstone',
  PropSet: 'PropSet',
  NodePropSet: 'NodePropSet',
  EdgePropSet: 'EdgePropSet',
  BlobValue: 'BlobValue',
});

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
 *   at?: { lamportCeiling?: number|null },
 *   entityId?: string,
 *   target?: {
 *     targetKind: 'node'|'edge'|'node_property'|'edge_property',
 *     entityId?: string,
 *     propertyKey?: string,
 *     from?: string,
 *     to?: string,
 *     label?: string
 *   },
 *   kind?: string|string[],
 *   writerId?: string,
 *   evidence?: 'summary'|'standard'|'full',
 *   scanBudget?: { maxPatches?: number }
 * }} ConflictAnalyzeOptions
 */

/**
 * @typedef {{
 *   lamportCeiling: number|null,
 *   entityId: string|null,
 *   target: ConflictAnalyzeOptions['target']|null,
 *   kinds: string[]|null,
 *   writerId: string|null,
 *   evidence: 'summary'|'standard'|'full',
 *   maxPatches: number|null
 * }} NormalizedConflictAnalyzeOptions
 */

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
 *   frontier: Record<string, string>,
 *   frontierDigest: string,
 *   lamportCeiling: number|null,
 *   scanBudgetApplied: { maxPatches: number|null },
 *   truncationPolicy: string
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
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compareStrings(a, b) {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/**
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function compareNumbers(a, b) {
  return a === b ? 0 : (a < b ? -1 : 1);
}

/**
 * @param {ConflictAnchor} anchor
 * @returns {string}
 */
function anchorString(anchor) {
  return `${anchor.writerId}:${String(anchor.lamport).padStart(16, '0')}:${anchor.patchSha}:${String(anchor.opIndex).padStart(8, '0')}`;
}

/**
 * @param {ConflictAnchor} a
 * @param {ConflictAnchor} b
 * @returns {number}
 */
function compareAnchors(a, b) {
  return compareStrings(anchorString(a), anchorString(b));
}

/**
 * @param {PatchFrame} a
 * @param {PatchFrame} b
 * @returns {number}
 */
function comparePatchFramesReverseCausal(a, b) {
  const lamportCmp = compareNumbers(b.patch.lamport || 0, a.patch.lamport || 0);
  if (lamportCmp !== 0) {
    return lamportCmp;
  }
  const writerCmp = compareStrings(b.patch.writer || '', a.patch.writer || '');
  if (writerCmp !== 0) {
    return writerCmp;
  }
  return compareStrings(b.sha, a.sha);
}

/**
 * @param {Map<string, string>} frontier
 * @returns {Record<string, string>}
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
 * @param {Map<string, number>|Record<string, number>|undefined|null} context
 * @returns {Map<string, number>}
 */
function normalizeContext(context) {
  if (context instanceof Map) {
    return new Map(context);
  }
  if (!context || typeof context !== 'object') {
    return new Map();
  }

  const map = new Map();
  for (const [writerId, value] of Object.entries(context)) {
    if (Number.isInteger(value) && value >= 0) {
      map.set(writerId, value);
    }
  }
  return map;
}

/**
 * @param {OpRecord} winner
 * @param {OpRecord} loser
 * @returns {'concurrent'|'ordered'|'replay_equivalent'|'reducer_collapsed'|undefined}
 */
function inferCausalRelation(winner, loser) {
  if (winner.effectDigest === loser.effectDigest) {
    return 'replay_equivalent';
  }

  if ((winner.context.get(loser.writerId) ?? -1) >= loser.lamport) {
    return 'ordered';
  }

  if ((loser.context.get(winner.writerId) ?? -1) >= winner.lamport) {
    return 'ordered';
  }

  return 'concurrent';
}

/**
 * @param {ConflictTarget} target
 * @param {string} entityId
 * @returns {boolean}
 */
function targetTouchesEntity(target, entityId) {
  if (target.entityId === entityId) {
    return true;
  }
  return target.from === entityId || target.to === entityId;
}

/**
 * @param {ConflictTarget} target
 * @param {ConflictAnalyzeOptions['target']} selector
 * @returns {boolean}
 */
function matchesTargetSelector(target, selector) {
  if (!selector) {
    return true;
  }
  if (target.targetKind !== selector.targetKind) {
    return false;
  }
  for (const field of TARGET_SELECTOR_FIELDS) {
    const selectorValue = selector[field];
    if (selectorValue !== undefined && target[field] !== selectorValue) {
      return false;
    }
  }
  return true;
}

/**
 * @param {ConflictTrace} trace
 * @param {string} writerId
 * @returns {boolean}
 */
function traceTouchesWriter(trace, writerId) {
  if (trace.winner.anchor.writerId === writerId) {
    return true;
  }
  return trace.losers.some((loser) => loser.anchor.writerId === writerId);
}

/**
 * @param {{
 *   digestCache: Map<string, string>,
 *   crypto: import('../../ports/CryptoPort.js').default,
 *   payload: unknown
 * }} options
 * @returns {Promise<string>}
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
 * @param {ConflictTarget} target
 * @param {string} effectDigest
 * @returns {string}
 */
function effectKey(target, effectDigest) {
  return `${target.targetDigest}:${effectDigest}`;
}

/**
 * @param {{
 *   target: ConflictTarget,
 *   kind: string,
 *   winner: OpRecord,
 *   resolution: ConflictResolution
 * }} options
 * @returns {string}
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
 * @param {ConflictTarget} target
 * @param {string} opType
 * @param {Record<string, unknown>} payload
 * @returns {Record<string, unknown>}
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
 * @param {Record<string, unknown>} raw
 * @returns {Record<string, unknown>}
 */
function cloneObject(raw) {
  return /** @type {Record<string, unknown>} */ ({ ...raw });
}

/**
 * @param {number|null} lamportCeiling
 * @returns {string}
 */
function describeLamportCeiling(lamportCeiling) {
  return lamportCeiling === null ? 'head' : String(lamportCeiling);
}

/**
 * @param {string} field
 * @param {unknown} value
 * @returns {string|null}
 */
function normalizeOptionalString(field, value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw new QueryError(`analyzeConflicts(): ${field} must be a non-empty string when provided`, {
      code: 'unsupported_target_selector',
      context: { [field]: value },
    });
  }
  return value;
}

/**
 * @param {unknown} lamportCeiling
 * @returns {number|null}
 */
function normalizeLamportCeiling(lamportCeiling) {
  if (lamportCeiling === undefined || lamportCeiling === null) {
    return null;
  }
  if (
    typeof lamportCeiling !== 'number' ||
    !Number.isInteger(lamportCeiling) ||
    lamportCeiling < 0
  ) {
    throw new QueryError('analyzeConflicts(): at.lamportCeiling must be a non-negative integer or null', {
      code: 'invalid_coordinate',
      context: { lamportCeiling },
    });
  }
  return lamportCeiling;
}

/**
 * @param {ConflictAnalyzeOptions['target']} target
 * @returns {ConflictAnalyzeOptions['target']|null}
 */
function normalizeTargetFilter(target) {
  if (target === undefined || target === null) {
    return null;
  }
  if (typeof target !== 'object') {
    throw new QueryError('analyzeConflicts(): target selector must be an object', {
      code: 'unsupported_target_selector',
      context: { target },
    });
  }
  const { targetKind } = target;
  if (!VALID_TARGET_KINDS.has(targetKind)) {
    throw new QueryError('analyzeConflicts(): target.targetKind is unsupported', {
      code: 'unsupported_target_selector',
      context: { targetKind },
    });
  }
  const validators = {
    node: () => validateTargetFields(target, ['entityId'], 'node target selector requires entityId'),
    edge: () => validateTargetFields(target, ['from', 'to', 'label'], 'edge target selector requires from, to, and label'),
    node_property: () => validateTargetFields(target, ['entityId', 'propertyKey'], 'node_property selector requires entityId and propertyKey'),
    edge_property: () => validateTargetFields(target, ['from', 'to', 'label', 'propertyKey'], 'edge_property selector requires from, to, label, and propertyKey'),
  };
  validators[targetKind]();
  return target;
}

/**
 * @param {ConflictAnalyzeOptions['target']} target
 * @param {Array<'entityId'|'propertyKey'|'from'|'to'|'label'>} fields
 * @param {string} message
 * @returns {void}
 */
function validateTargetFields(target, fields, message) {
  const valid = fields.every((field) => typeof target?.[field] === 'string' && target[field].length > 0);
  if (!valid) {
    throw new QueryError(`analyzeConflicts(): ${message}`, {
      code: 'unsupported_target_selector',
      context: { target },
    });
  }
}

/**
 * @param {ConflictAnalyzeOptions['kind']} kind
 * @returns {string[]|null}
 */
function normalizeKinds(kind) {
  if (kind === undefined) {
    return null;
  }
  const values = Array.isArray(kind) ? kind : [kind];
  if (values.length === 0) {
    throw new QueryError('analyzeConflicts(): kind filter must not be empty', {
      code: 'unsupported_target_selector',
      context: { kind },
    });
  }
  for (const value of values) {
    if (typeof value !== 'string' || !VALID_KINDS.has(value)) {
      throw new QueryError('analyzeConflicts(): kind filter contains an unsupported value', {
        code: 'unsupported_target_selector',
        context: { kind },
      });
    }
  }
  return [...new Set(values)].sort(compareStrings);
}

/**
 * @param {unknown} evidence
 * @returns {'summary'|'standard'|'full'}
 */
function normalizeEvidence(evidence) {
  const normalized = evidence === undefined || evidence === null ? 'standard' : evidence;
  if (typeof normalized !== 'string' || !VALID_EVIDENCE_LEVELS.has(normalized)) {
    throw new QueryError('analyzeConflicts(): evidence must be summary, standard, or full', {
      code: 'unsupported_target_selector',
      context: { evidence },
    });
  }
  return /** @type {'summary'|'standard'|'full'} */ (normalized);
}

/**
 * @param {unknown} maxPatches
 * @returns {number|null}
 */
function normalizeMaxPatches(maxPatches) {
  if (maxPatches === undefined) {
    return null;
  }
  if (
    typeof maxPatches !== 'number' ||
    !Number.isInteger(maxPatches) ||
    maxPatches < 1
  ) {
    throw new QueryError('analyzeConflicts(): scanBudget.maxPatches must be a positive integer', {
      code: 'unsupported_target_selector',
      context: { maxPatches },
    });
  }
  return maxPatches;
}

/**
 * @param {ConflictAnalyzeOptions|undefined} options
 * @returns {NormalizedConflictAnalyzeOptions}
 */
function normalizeOptions(options) {
  const raw = options ?? {};
  return {
    lamportCeiling: normalizeLamportCeiling(raw.at?.lamportCeiling),
    entityId: normalizeOptionalString('entityId', raw.entityId),
    target: normalizeTargetFilter(raw.target),
    kinds: normalizeKinds(raw.kind),
    writerId: normalizeOptionalString('writerId', raw.writerId),
    evidence: normalizeEvidence(raw.evidence),
    maxPatches: normalizeMaxPatches(raw.scanBudget?.maxPatches),
  };
}

/**
 * @param {{
 *   frontier: Map<string, string>,
 *   lamportCeiling: number|null,
 *   maxPatches: number|null,
 *   frontierDigest: string
 * }} options
 * @returns {ConflictResolvedCoordinate}
 */
function buildResolvedCoordinate({ frontier, lamportCeiling, maxPatches, frontierDigest }) {
  return {
    analysisVersion: CONFLICT_ANALYSIS_VERSION,
    frontier: frontierToRecord(frontier),
    frontierDigest,
    lamportCeiling,
    scanBudgetApplied: {
      maxPatches,
    },
    truncationPolicy: CONFLICT_TRUNCATION_POLICY,
  };
}

/**
 * @param {ConflictDiagnostic[]} diagnostics
 * @param {{
 *   code: string,
 *   message: string,
 *   severity?: 'warning'|'error',
 *   data?: Record<string, unknown>
 * }} options
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
    ...(data ? { data } : {}),
  });
}

/**
 * @param {unknown} observedDots
 * @returns {string[]}
 */
function normalizeObservedDots(observedDots) {
  if (!observedDots) {
    return [];
  }
  return [.../** @type {Iterable<string>} */ (observedDots)].sort(compareStrings);
}

/**
 * @param {ConflictTarget} _target
 * @param {string} opType
 * @param {Record<string, unknown>} canonOp
 * @returns {Record<string, unknown>|null}
 */
function normalizeEffectPayload(_target, opType, canonOp) {
  /** @type {Record<string, () => Record<string, unknown>>} */
  const effectFactories = {
    NodeAdd: () => ({ dot: canonOp.dot ?? null }),
    NodeTombstone: () => ({ observedDots: normalizeObservedDots(canonOp.observedDots) }),
    EdgeAdd: () => ({ dot: canonOp.dot ?? null }),
    EdgeTombstone: () => ({ observedDots: normalizeObservedDots(canonOp.observedDots) }),
    NodePropSet: () => ({ value: canonOp.value ?? null }),
    EdgePropSet: () => ({ value: canonOp.value ?? null }),
    BlobValue: () => ({ oid: canonOp.oid ?? null }),
  };
  const factory = effectFactories[opType];
  return factory ? factory() : null;
}

/**
 * @param {Record<string, unknown>} canonOp
 * @param {string} receiptTarget
 * @returns {Omit<ConflictTarget, 'targetDigest'>|null}
 */
function buildNodeTargetIdentity(canonOp, receiptTarget) {
  const entityId = typeof canonOp.node === 'string' && canonOp.node.length > 0
    ? canonOp.node
    : (receiptTarget !== '*' ? receiptTarget : null);
  return entityId ? { targetKind: 'node', entityId } : null;
}

/**
 * @param {Record<string, unknown>} canonOp
 * @param {string} receiptTarget
 * @returns {Omit<ConflictTarget, 'targetDigest'>|null}
 */
function buildEdgeTargetIdentity(canonOp, receiptTarget) {
  if (
    typeof canonOp.from === 'string' &&
    typeof canonOp.to === 'string' &&
    typeof canonOp.label === 'string'
  ) {
    return {
      targetKind: 'edge',
      from: canonOp.from,
      to: canonOp.to,
      label: canonOp.label,
      edgeKey: `${canonOp.from}\0${canonOp.to}\0${canonOp.label}`,
    };
  }
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
 * @param {Record<string, unknown>} canonOp
 * @returns {Omit<ConflictTarget, 'targetDigest'>|null}
 */
function buildNodePropertyTargetIdentity(canonOp) {
  if (typeof canonOp.node !== 'string' || typeof canonOp.key !== 'string') {
    return null;
  }
  return {
    targetKind: 'node_property',
    entityId: canonOp.node,
    propertyKey: canonOp.key,
  };
}

/**
 * @param {Record<string, unknown>} canonOp
 * @returns {Omit<ConflictTarget, 'targetDigest'>|null}
 */
function buildEdgePropertyTargetIdentity(canonOp) {
  if (
    typeof canonOp.from !== 'string' ||
    typeof canonOp.to !== 'string' ||
    typeof canonOp.label !== 'string' ||
    typeof canonOp.key !== 'string'
  ) {
    return null;
  }
  return {
    targetKind: 'edge_property',
    from: canonOp.from,
    to: canonOp.to,
    label: canonOp.label,
    edgeKey: `${canonOp.from}\0${canonOp.to}\0${canonOp.label}`,
    propertyKey: canonOp.key,
  };
}

/**
 * @param {Record<string, unknown>} canonOp
 * @param {string} receiptTarget
 * @returns {Omit<ConflictTarget, 'targetDigest'>|null}
 */
function buildTargetIdentity(canonOp, receiptTarget) {
  const targetBuilders = {
    NodeAdd: () => buildNodeTargetIdentity(canonOp, receiptTarget),
    NodeRemove: () => buildNodeTargetIdentity(canonOp, receiptTarget),
    EdgeAdd: () => buildEdgeTargetIdentity(canonOp, receiptTarget),
    EdgeRemove: () => buildEdgeTargetIdentity(canonOp, receiptTarget),
    PropSet: () => buildNodePropertyTargetIdentity(canonOp),
    NodePropSet: () => buildNodePropertyTargetIdentity(canonOp),
    EdgePropSet: () => buildEdgePropertyTargetIdentity(canonOp),
  };
  const builder = /** @type {Record<string, () => Omit<ConflictTarget, 'targetDigest'>|null>} */ (targetBuilders)[/** @type {string} */ (canonOp.type)];
  return builder ? builder() : null;
}

/**
 * @param {{
 *   winner: OpRecord,
 *   loser: OpRecord,
 *   kind: 'supersession'|'eventual_override'|'redundancy',
 *   winnerMode: 'immediate'|'eventual',
 *   code: string,
 *   reason?: string
 * }} options
 * @returns {ConflictResolution}
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
  return {
    reducerId: CONFLICT_REDUCER_ID,
    basis: {
      code,
      ...(reason ? { reason } : {}),
    },
    winnerMode,
    comparator: {
      type: comparatorType,
      ...(comparatorType === 'event_id'
        ? {
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
          }
        : {}),
    },
  };
}

/**
 * @param {string[]} noteCodes
 * @returns {string[]}
 */
function normalizeNoteCodes(noteCodes) {
  return [...new Set(noteCodes)].sort(compareStrings);
}

/**
 * @param {ConflictAnalyzeOptions['target']|null|undefined} selector
 * @returns {Record<string, unknown>|null}
 */
function normalizeTargetSelector(selector) {
  if (!selector) {
    return null;
  }
  /** @type {Record<string, unknown>} */
  const result = { targetKind: selector.targetKind };
  if (selector.entityId !== undefined) {
    result.entityId = selector.entityId;
  }
  if (selector.propertyKey !== undefined) {
    result.propertyKey = selector.propertyKey;
  }
  if (selector.from !== undefined) {
    result.from = selector.from;
  }
  if (selector.to !== undefined) {
    result.to = selector.to;
  }
  if (selector.label !== undefined) {
    result.label = selector.label;
  }
  return result;
}

/**
 * @param {NormalizedConflictAnalyzeOptions} normalized
 * @returns {Record<string, unknown>}
 */
function snapshotFilterRecord(normalized) {
  return {
    entityId: normalized.entityId,
    target: normalizeTargetSelector(normalized.target),
    kind: normalized.kinds,
    writerId: normalized.writerId,
  };
}

/**
 * @param {ConflictDiagnostic[]} diagnostics
 * @returns {string[]}
 */
function diagnosticCodes(diagnostics) {
  return diagnostics.map((diagnostic) => diagnostic.code).sort(compareStrings);
}

/**
 * @param {WarpGraph} graph
 * @param {number|null} lamportCeiling
 * @returns {Promise<{ frontier: Map<string, string>, patchFrames: PatchFrame[] }>}
 */
async function loadPatchFrames(graph, lamportCeiling) {
  const frontier = await graph.getFrontier();
  const writerIds = [...frontier.keys()].sort(compareStrings);
  /** @type {PatchFrame[]} */
  const patchFrames = [];
  for (const writerId of writerIds) {
    const entries = await graph._loadWriterPatches(writerId);
    for (const entry of entries) {
      if (lamportCeiling !== null && entry.patch.lamport > lamportCeiling) {
        continue;
      }
      patchFrames.push(buildPatchFrame(entry, patchFrames.length));
    }
  }
  return { frontier, patchFrames };
}

/**
 * @param {{ patch: PatchV2, sha: string }} entry
 * @param {number} patchOrder
 * @returns {PatchFrame}
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
 * @returns {TickReceipt}
 */
function emptyReceipt() {
  return /** @type {TickReceipt} */ ({ patchSha: '', writer: '', lamport: 0, ops: [] });
}

/**
 * @param {PatchFrame[]} patchFrames
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
    patchFrames[i].receipt = reduced.receipts[i];
  }
}

/**
 * @param {{
 *   patchFrames: PatchFrame[],
 *   maxPatches: number|null,
 *   lamportCeiling: number|null,
 *   diagnostics: ConflictDiagnostic[]
 * }} options
 * @returns {ScanWindow}
 */
function buildScanWindow({ patchFrames, maxPatches, lamportCeiling, diagnostics }) {
  const reverseCausalFrames = [...patchFrames].sort(comparePatchFramesReverseCausal);
  const scannedFrames = maxPatches === null
    ? reverseCausalFrames
    : reverseCausalFrames.slice(0, maxPatches);
  const truncated = maxPatches !== null && reverseCausalFrames.length > maxPatches;
  if (truncated) {
    const lastScanned = scannedFrames[scannedFrames.length - 1];
    pushDiagnostic(diagnostics, {
      code: 'budget_truncated',
      message: `Conflict analysis truncated to ${maxPatches} patches at ceiling ${describeLamportCeiling(lamportCeiling)}`,
      severity: 'warning',
      data: {
        traversalOrder: CONFLICT_TRAVERSAL_ORDER,
        scannedPatchCount: scannedFrames.length,
        lastScannedAnchor: buildTraversalAnchor(lastScanned),
      },
    });
  }
  return {
    reverseCausalFrames,
    scannedFrames,
    scannedPatchShas: new Set(scannedFrames.map((frame) => frame.sha)),
    truncated,
  };
}

/**
 * @param {PatchFrame} frame
 * @returns {ConflictAnchor}
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
 * @returns {ConflictCollector}
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
 * @param {ConflictAnalyzerService} service
 * @param {{
 *   patchFrames: PatchFrame[],
 *   scannedPatchShas: Set<string>,
 *   diagnostics: ConflictDiagnostic[]
 * }} options
 * @returns {Promise<ConflictCollector>}
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
 * @param {ConflictAnalyzerService} service
 * @param {{
 *   frame: PatchFrame,
 *   scannedPatchShas: Set<string>,
 *   diagnostics: ConflictDiagnostic[],
 *   collector: ConflictCollector
 * }} options
 * @returns {Promise<void>}
 */
async function analyzeFrameOps(service, { frame, scannedPatchShas, diagnostics, collector }) {
  const { patch, receipt, sha } = frame;
  let receiptOpIndex = 0;
  for (let opIndex = 0; opIndex < patch.ops.length; opIndex++) {
    const canonOp = cloneObject(/** @type {Record<string, unknown>} */ (normalizeRawOp(patch.ops[opIndex])));
    const receiptOpType = RECEIPT_OP_TYPE[/** @type {string} */ (canonOp.type)];
    if (!receiptOpType) {
      continue;
    }
    const receiptOutcome = receipt.ops[receiptOpIndex++];
    if (!receiptOutcome) {
      pushMissingReceiptDiagnostic({ diagnostics, frame, opIndex });
      continue;
    }
    const record = await buildOpRecord(service, {
      frame,
      opIndex,
      receiptOpIndex: receiptOpIndex - 1,
      canonOp,
      receiptOutcome,
      receiptOpType,
      diagnostics,
    });
    if (!record) {
      continue;
    }
    const currentPropertyWinner = collector.propertyWinnerByTarget.get(record.targetKey) || null;
    const priorEquivalent = collector.equivalentWinnerByTargetEffect.get(effectKey(record.target, record.effectDigest)) || null;
    if (scannedPatchShas.has(sha)) {
      addImmediateCandidates({ collector, record, currentPropertyWinner, priorEquivalent });
    }
    trackAppliedRecord({ collector, record });
  }
}

/**
 * @param {{
 *   diagnostics: ConflictDiagnostic[],
 *   frame: PatchFrame,
 *   opIndex: number
 * }} options
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
 * @param {ConflictAnalyzerService} service
 * @param {{
 *   frame: PatchFrame,
 *   opIndex: number,
 *   receiptOpIndex: number,
 *   canonOp: Record<string, unknown>,
 *   receiptOutcome: { result: 'applied'|'superseded'|'redundant', reason?: string, target: string },
 *   receiptOpType: string,
 *   diagnostics: ConflictDiagnostic[]
 * }} options
 * @returns {Promise<OpRecord|null>}
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
  const { patch, sha, context, patchOrder } = frame;
  const target = await buildConflictTarget(service, { canonOp, receiptTarget: receiptOutcome.target });
  if (!target) {
    pushRecordDiagnostic({
      diagnostics,
      code: 'anchor_incomplete',
      messagePrefix: 'Target identity unavailable',
      frame,
      opIndex,
    });
    return null;
  }
  const effectDigest = await buildEffectDigest(service, { target, receiptOpType, canonOp });
  if (!effectDigest) {
    pushRecordDiagnostic({
      diagnostics,
      code: 'digest_unavailable',
      messagePrefix: 'Effect payload unavailable',
      frame,
      opIndex,
    });
    return null;
  }
  return {
    target,
    targetKey: target.targetDigest,
    patchSha: sha,
    writerId: patch.writer,
    lamport: patch.lamport,
    opIndex,
    receiptOpIndex,
    opType: receiptOpType,
    receiptResult: receiptOutcome.result,
    receiptReason: receiptOutcome.reason,
    effectDigest,
    eventId: createEventId(patch.lamport, patch.writer, sha, opIndex),
    context,
    patchOrder,
  };
}

/**
 * @param {ConflictAnalyzerService} service
 * @param {{ canonOp: Record<string, unknown>, receiptTarget: string }} options
 * @returns {Promise<ConflictTarget|null>}
 */
async function buildConflictTarget(service, { canonOp, receiptTarget }) {
  const targetIdentity = buildTargetIdentity(canonOp, receiptTarget);
  if (!targetIdentity) {
    return null;
  }
  return {
    ...targetIdentity,
    targetDigest: await service._hash(targetIdentity),
  };
}

/**
 * @param {ConflictAnalyzerService} service
 * @param {{
 *   target: ConflictTarget,
 *   receiptOpType: string,
 *   canonOp: Record<string, unknown>
 * }} options
 * @returns {Promise<string|null>}
 */
async function buildEffectDigest(service, { target, receiptOpType, canonOp }) {
  const effectPayload = normalizeEffectPayload(target, receiptOpType, canonOp);
  if (!effectPayload) {
    return null;
  }
  return await service._hash(buildEffectPayload(target, receiptOpType, effectPayload));
}

/**
 * @param {{
 *   diagnostics: ConflictDiagnostic[],
 *   code: string,
 *   messagePrefix: string,
 *   frame: PatchFrame,
 *   opIndex: number
 * }} options
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
 * @param {{
 *   collector: ConflictCollector,
 *   record: OpRecord,
 *   currentPropertyWinner: OpRecord|null,
 *   priorEquivalent: OpRecord|null
 * }} options
 * @returns {void}
 */
function addImmediateCandidates({ collector, record, currentPropertyWinner, priorEquivalent }) {
  maybeAddSupersessionCandidate({ collector, record, currentPropertyWinner });
  maybeAddRedundancyCandidate({ collector, record, priorEquivalent });
}

/**
 * @param {{
 *   collector: ConflictCollector,
 *   record: OpRecord,
 *   currentPropertyWinner: OpRecord|null
 * }} options
 * @returns {void}
 */
function maybeAddSupersessionCandidate({ collector, record, currentPropertyWinner }) {
  if (!isPropertySetRecord(record) || record.receiptResult !== 'superseded' || !currentPropertyWinner) {
    return;
  }
  collector.candidates.push({
    kind: 'supersession',
    target: record.target,
    winner: currentPropertyWinner,
    loser: record,
    resolution: buildResolution({
      winner: currentPropertyWinner,
      loser: record,
      kind: 'supersession',
      winnerMode: 'immediate',
      code: 'receipt_superseded',
      reason: record.receiptReason,
    }),
    noteCodes: normalizeNoteCodes([
      CLASSIFICATION_NOTES.RECEIPT_SUPERSEDED,
      CLASSIFICATION_NOTES.SAME_TARGET,
      record.writerId !== currentPropertyWinner.writerId ? CLASSIFICATION_NOTES.DIFFERENT_WRITER : '',
      inferRelationNote(currentPropertyWinner, record),
    ].filter(Boolean)),
  });
}

/**
 * @param {{
 *   collector: ConflictCollector,
 *   record: OpRecord,
 *   priorEquivalent: OpRecord|null
 * }} options
 * @returns {void}
 */
function maybeAddRedundancyCandidate({ collector, record, priorEquivalent }) {
  if (record.receiptResult !== 'redundant' || !priorEquivalent) {
    return;
  }
  collector.candidates.push({
    kind: 'redundancy',
    target: record.target,
    winner: priorEquivalent,
    loser: record,
    resolution: buildResolution({
      winner: priorEquivalent,
      loser: record,
      kind: 'redundancy',
      winnerMode: 'immediate',
      code: 'receipt_redundant',
      reason: record.receiptReason,
    }),
    noteCodes: normalizeNoteCodes([
      CLASSIFICATION_NOTES.RECEIPT_REDUNDANT,
      CLASSIFICATION_NOTES.SAME_TARGET,
      CLASSIFICATION_NOTES.REPLAY_EQUIVALENT_EFFECT,
    ]),
  });
}

/**
 * @param {OpRecord} winner
 * @param {OpRecord} loser
 * @returns {string}
 */
function inferRelationNote(winner, loser) {
  return inferCausalRelation(winner, loser) === 'concurrent'
    ? CLASSIFICATION_NOTES.CONCURRENT_TO_WINNER
    : CLASSIFICATION_NOTES.ORDERED_BEFORE_WINNER;
}

/**
 * @param {OpRecord} record
 * @returns {boolean}
 */
function isPropertySetRecord(record) {
  return record.opType === 'NodePropSet' || record.opType === 'EdgePropSet';
}

/**
 * @param {{
 *   collector: ConflictCollector,
 *   record: OpRecord
 * }} options
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
  const history = collector.propertyAppliedHistory.get(record.targetKey) || [];
  history.push(record);
  collector.propertyAppliedHistory.set(record.targetKey, history);
  collector.propertyWinnerByTarget.set(record.targetKey, record);
}

/**
 * @param {{
 *   collector: ConflictCollector,
 *   scannedPatchShas: Set<string>
 * }} options
 * @returns {void}
 */
function addEventualOverrideCandidates({ collector, scannedPatchShas }) {
  for (const [targetDigest, history] of collector.propertyAppliedHistory) {
    const finalWinner = collector.propertyWinnerByTarget.get(targetDigest);
    if (!finalWinner) {
      continue;
    }
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
}

/**
 * @param {{
 *   loser: OpRecord,
 *   finalWinner: OpRecord,
 *   scannedPatchShas: Set<string>
 * }} options
 * @returns {boolean}
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
 * @param {OpRecord} a
 * @param {OpRecord} b
 * @returns {boolean}
 */
function sameRecord(a, b) {
  return a.patchSha === b.patchSha && a.opIndex === b.opIndex;
}

/**
 * @param {ConflictCandidate[]} candidates
 * @returns {Map<string, GroupedConflict>}
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
 * @param {ConflictAnalyzerService} service
 * @param {{
 *   grouped: Iterable<GroupedConflict>,
 *   evidence: 'summary'|'standard'|'full',
 *   resolvedCoordinate: ConflictResolvedCoordinate
 * }} options
 * @returns {Promise<ConflictTrace[]>}
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
 * @param {ConflictTrace} a
 * @param {ConflictTrace} b
 * @returns {number}
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
 * @param {ConflictAnalyzerService} service
 * @param {{
 *   group: GroupedConflict,
 *   evidence: 'summary'|'standard'|'full',
 *   resolvedCoordinate: ConflictResolvedCoordinate
 * }} options
 * @returns {Promise<ConflictTrace>}
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
 * @param {OpRecord} winner
 * @returns {ConflictWinner}
 */
function buildWinner(winner) {
  return {
    anchor: buildRecordAnchor(winner),
    effectDigest: winner.effectDigest,
  };
}

/**
 * @param {GroupedConflict} group
 * @param {'summary'|'standard'|'full'} evidence
 * @returns {ConflictParticipant[]}
 */
function buildLosers(group, evidence) {
  return group.losers
    .map((loser) => buildLoserParticipant({ winner: group.winner, loser, kind: group.kind, evidence }))
    .sort((a, b) => compareAnchors(a.anchor, b.anchor));
}

/**
 * @param {{
 *   winner: OpRecord,
 *   loser: OpRecord,
 *   kind: 'supersession'|'eventual_override'|'redundancy',
 *   evidence: 'summary'|'standard'|'full'
 * }} options
 * @returns {ConflictParticipant}
 */
function buildLoserParticipant({ winner, loser, kind, evidence }) {
  const relation = inferCausalRelation(winner, loser);
  const participant = {
    anchor: buildRecordAnchor(loser),
    effectDigest: loser.effectDigest,
    ...(relation ? { causalRelationToWinner: relation } : {}),
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
 * @param {OpRecord} record
 * @returns {ConflictAnchor}
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
 * @param {{
 *   winner: OpRecord,
 *   loser: OpRecord,
 *   kind: 'supersession'|'eventual_override'|'redundancy',
 *   relation: ConflictParticipant['causalRelationToWinner']
 * }} options
 * @returns {string[]}
 */
function buildLoserNotes({ winner, loser, kind, relation }) {
  /** @type {string[]} */
  const notes = [CLASSIFICATION_NOTES.SAME_TARGET];
  if (kind === 'supersession') {
    notes.push(CLASSIFICATION_NOTES.RECEIPT_SUPERSEDED);
  }
  if (kind === 'redundancy') {
    notes.push(CLASSIFICATION_NOTES.RECEIPT_REDUNDANT, CLASSIFICATION_NOTES.REPLAY_EQUIVALENT_EFFECT);
  }
  if (kind === 'eventual_override') {
    notes.push(CLASSIFICATION_NOTES.EFFECTIVE_THEN_LOST, CLASSIFICATION_NOTES.DIGEST_DIFFERS);
  }
  if (relation === 'concurrent') {
    notes.push(CLASSIFICATION_NOTES.CONCURRENT_TO_WINNER);
  }
  if (relation === 'ordered') {
    notes.push(CLASSIFICATION_NOTES.ORDERED_BEFORE_WINNER);
  }
  if (loser.writerId !== winner.writerId) {
    notes.push(CLASSIFICATION_NOTES.DIFFERENT_WRITER);
  }
  return normalizeNoteCodes(notes);
}

/**
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
 * @param {{
 *   group: GroupedConflict,
 *   winner: ConflictWinner,
 *   losers: ConflictParticipant[],
 *   resolvedCoordinate: ConflictResolvedCoordinate
 * }} options
 * @returns {Record<string, unknown>}
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
 * @param {GroupedConflict} group
 * @param {'summary'|'standard'|'full'} evidence
 * @returns {ConflictTrace['evidence']}
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
 * @param {OpRecord} record
 * @returns {{ patchSha: string, lamport: number, opIndex: number }}
 */
function buildReceiptRef(record) {
  return {
    patchSha: record.patchSha,
    lamport: record.lamport,
    opIndex: record.receiptOpIndex,
  };
}

/**
 * @param {{ patchSha: string, opIndex: number }} a
 * @param {{ patchSha: string, opIndex: number }} b
 * @returns {number}
 */
function compareReceiptRefs(a, b) {
  return compareStrings(`${a.patchSha}:${a.opIndex}`, `${b.patchSha}:${b.opIndex}`);
}

/**
 * @param {ConflictTrace} trace
 * @param {NormalizedConflictAnalyzeOptions} normalized
 * @returns {boolean}
 */
function matchesFilters(trace, normalized) {
  if (normalized.kinds && !normalized.kinds.includes(trace.kind)) {
    return false;
  }
  if (normalized.entityId && !targetTouchesEntity(trace.target, normalized.entityId)) {
    return false;
  }
  if (normalized.target && !matchesTargetSelector(trace.target, normalized.target)) {
    return false;
  }
  return !normalized.writerId || traceTouchesWriter(trace, normalized.writerId);
}

/**
 * @param {ConflictTrace[]} traces
 * @param {NormalizedConflictAnalyzeOptions} normalized
 * @returns {ConflictTrace[]}
 */
function filterTraces(traces, normalized) {
  return traces.filter((trace) => matchesFilters(trace, normalized));
}

/**
 * @param {ConflictAnalyzerService} service
 * @param {{
 *   resolvedCoordinate: ConflictResolvedCoordinate,
 *   normalized: NormalizedConflictAnalyzeOptions,
 *   truncated: boolean,
 *   diagnostics: ConflictDiagnostic[],
 *   traces: ConflictTrace[]
 * }} options
 * @returns {Promise<string>}
 */
async function buildAnalysisSnapshotHash(service, {
  resolvedCoordinate,
  normalized,
  truncated,
  diagnostics,
  traces,
}) {
  return await service._hash({
    analysisVersion: CONFLICT_ANALYSIS_VERSION,
    resolvedCoordinate,
    filters: snapshotFilterRecord(normalized),
    truncation: truncated,
    conflictIds: traces.map((trace) => trace.conflictId).sort(compareStrings),
    diagnosticCodes: diagnosticCodes(diagnostics),
  });
}

/**
 * @param {ConflictAnalyzerService} service
 * @param {{
 *   resolvedCoordinate: ConflictResolvedCoordinate,
 *   normalized: NormalizedConflictAnalyzeOptions
 * }} options
 * @returns {Promise<string>}
 */
async function buildEmptySnapshotHash(service, { resolvedCoordinate, normalized }) {
  return await service._hash({
    analysisVersion: CONFLICT_ANALYSIS_VERSION,
    resolvedCoordinate,
    filters: snapshotFilterRecord(normalized),
    truncation: false,
    conflictIds: [],
    diagnosticCodes: [],
  });
}

/**
 * @param {ConflictAnalyzerService} service
 * @param {NormalizedConflictAnalyzeOptions} normalized
 * @returns {Promise<{ patchFrames: PatchFrame[], resolvedCoordinate: ConflictResolvedCoordinate }>}
 */
async function resolveAnalysisContext(service, normalized) {
  const { frontier, patchFrames } = await loadPatchFrames(service._graph, normalized.lamportCeiling);
  const frontierDigest = await service._hash(frontierToRecord(frontier));
  return {
    patchFrames,
    resolvedCoordinate: buildResolvedCoordinate({
      frontier,
      lamportCeiling: normalized.lamportCeiling,
      maxPatches: normalized.maxPatches,
      frontierDigest,
    }),
  };
}

/**
 * @param {{
 *   resolvedCoordinate: ConflictResolvedCoordinate,
 *   analysisSnapshotHash: string,
 *   diagnostics: ConflictDiagnostic[],
 *   conflicts: ConflictTrace[]
 * }} options
 * @returns {ConflictAnalysis}
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
   * @param {{ graph: WarpGraph }} options
   */
  constructor({ graph }) {
    this._graph = graph;
    this._digestCache = new Map();
  }

  /**
   * @param {unknown} payload
   * @returns {Promise<string>}
   */
  async _hash(payload) {
    return await hashPayload({
      digestCache: this._digestCache,
      crypto: this._graph._crypto,
      payload,
    });
  }

  /**
   * @param {ConflictAnalyzeOptions} [options]
   * @returns {Promise<ConflictAnalysis>}
   */
  async analyze(options) {
    const normalized = normalizeOptions(options);
    /** @type {ConflictDiagnostic[]} */
    const diagnostics = [];
    const { patchFrames, resolvedCoordinate } = await resolveAnalysisContext(this, normalized);
    if (patchFrames.length === 0) {
      return buildConflictAnalysisResult({
        resolvedCoordinate,
        analysisSnapshotHash: await buildEmptySnapshotHash(this, { resolvedCoordinate, normalized }),
        diagnostics,
        conflicts: [],
      });
    }
    attachReceipts(patchFrames);
    const scanWindow = buildScanWindow({
      patchFrames,
      maxPatches: normalized.maxPatches,
      lamportCeiling: normalized.lamportCeiling,
      diagnostics,
    });
    const collector = await collectConflictData(this, {
      patchFrames,
      scannedPatchShas: scanWindow.scannedPatchShas,
      diagnostics,
    });
    const traces = await buildConflictTraces(this, {
      grouped: groupCandidates(collector.candidates).values(),
      evidence: normalized.evidence,
      resolvedCoordinate,
    });
    const conflicts = filterTraces(traces, normalized);
    const analysisSnapshotHash = await buildAnalysisSnapshotHash(this, {
      resolvedCoordinate,
      normalized,
      truncated: scanWindow.truncated,
      diagnostics,
      traces: conflicts,
    });
    return buildConflictAnalysisResult({
      resolvedCoordinate,
      analysisSnapshotHash,
      diagnostics,
      conflicts,
    });
  }
}

export default ConflictAnalyzerService;
