/**
 * conflictCandidateAnalysis — candidate analysis for conflict detection.
 *
 * Determines WHO wins/loses and WHY: builds op records, classifies
 * supersession/redundancy/eventual-override candidates, and manages
 * causal relation inference.
 *
 * @module domain/services/strand/conflictCandidateAnalysis
 */

import { EventId } from '../../utils/EventId.ts';
import ConflictDiagnostic, { type ConflictDiagnosticData } from '../../types/conflict/ConflictDiagnostic.ts';
import ConflictResolution from '../../types/conflict/ConflictResolution.ts';
import { type TickReceipt, type OpOutcome } from '../../types/TickReceipt.ts';
import type Patch from '../../types/Patch.ts';
import type { HashablePayload } from '../../types/conflict/HashablePayload.ts';
import type ConflictTarget from '../../types/conflict/ConflictTarget.ts';
import ConflictCandidate from './ConflictCandidate.ts';
import OpRecord from './OpRecord.ts';
import {
  receiptNameForOp,
  effectKey,
  normalizeNoteCodes,
  buildConflictTarget,
  buildEffectDigest,
  normalizeConflictOp,
  type CanonicalOpBlob,
} from './conflictTargetIdentity.ts';

// ── Structural types ─────────────────────────────────────────────────

/**
 * Structural type for a loaded patch frame as produced by ConflictFrameLoader.
 * Typed structurally rather than via `import type { PatchFrame }` because PatchFrame
 * is a JS class and its field types would otherwise be inferred as `any`.
 */
export interface PatchFrame {
  patch: Patch;
  sha: string;
  patchOrder: number;
  context: Map<string, number>;
  receipt: TickReceipt;
}

const CONFLICT_REDUCER_ID = 'join-reducer-v5';

/**
 * Extracts the fields needed by ConflictResolution.fromCandidate from an OpRecord.
 * Required because OpRecord.receiptReason is typed as `string | undefined` (explicit union),
 * while fromCandidate expects `{ receiptReason?: string }` (optional property).
 * With exactOptionalPropertyTypes: true these are incompatible — this helper bridges the gap.
 */
function loserFields(
  record: OpRecord,
): { receiptReason?: string; eventId: { lamport: number; writerId: string; patchSha: string; opIndex: number } } {
  const base = { eventId: record.eventId };
  if (typeof record.receiptReason === 'string') {
    return { ...base, receiptReason: record.receiptReason };
  }
  return base;
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

// ── Mutable collector state (passed as parameter, not imported) ──────

/**
 * Mutable accumulator for conflict candidates during frame analysis.
 * Declared here as a structural interface so both files can type it
 * without a circular import. The class itself lives in ConflictCandidateCollector.ts.
 */
export interface CollectorState {
  propertyWinnerByTarget: Map<string, OpRecord>;
  propertyAppliedHistory: Map<string, OpRecord[]>;
  equivalentWinnerByTargetEffect: Map<string, OpRecord>;
  candidates: ConflictCandidate[];
}

interface HashingService {
  _hash(payload: HashablePayload): Promise<string>;
}

// ── Diagnostics ──────────────────────────────────────────────────────

/**
 * Appends a diagnostic to the accumulator.
 */
export function pushDiagnostic(
  diagnostics: ConflictDiagnostic[],
  {
    code,
    message,
    severity = 'warning',
    data,
  }: {
    code: string;
    message: string;
    severity?: 'warning' | 'error';
    data?: ConflictDiagnosticData;
  },
): void {
  diagnostics.push(
    new ConflictDiagnostic({
      code,
      severity,
      message,
      ...(data !== undefined ? { data } : {}),
    }),
  );
}

/**
 * Pushes a diagnostic for a record that could not be fully constructed.
 */
export function pushRecordDiagnostic(
  diagnostics: ConflictDiagnostic[],
  {
    code,
    messagePrefix,
    frame,
    opIndex,
  }: {
    code: string;
    messagePrefix: string;
    frame: PatchFrame;
    opIndex: number;
  },
): void {
  const { patch, sha } = frame;
  pushDiagnostic(diagnostics, {
    code,
    message: `${messagePrefix} for ${patch.writer}@${patch.lamport}#${opIndex}`,
    severity: 'warning',
    data: {
      patchSha: sha,
      writerId: patch.writer,
      lamport: patch.lamport,
      opIndex,
    },
  });
}

// ── Causal relation ─────────────────────────────────────────────────

/**
 * Determines the causal relationship between a winning and losing op record.
 */
export function inferCausalRelation(
  winner: OpRecord,
  loser: OpRecord,
): 'concurrent' | 'ordered' | 'replay_equivalent' | 'reducer_collapsed' | undefined {
  if (winner.effectDigest === loser.effectDigest) {
    return 'replay_equivalent';
  }
  return isCausallyOrdered(winner, loser) ? 'ordered' : 'concurrent';
}

/**
 * Checks whether either record causally observes the other.
 */
export function isCausallyOrdered(winner: OpRecord, loser: OpRecord): boolean {
  if ((winner.context.get(loser.writerId) ?? -1) >= loser.lamport) {
    return true;
  }
  return (loser.context.get(winner.writerId) ?? -1) >= winner.lamport;
}

/**
 * Infers a classification note describing the causal relation between winner and loser.
 */
export function inferRelationNote(winner: OpRecord, loser: OpRecord): string {
  return inferCausalRelation(winner, loser) === 'concurrent'
    ? CLASSIFICATION_NOTES.CONCURRENT_TO_WINNER
    : CLASSIFICATION_NOTES.ORDERED_BEFORE_WINNER;
}

// ── Record building ─────────────────────────────────────────────────

interface ResolvedOpIdentity {
  target: ConflictTarget;
  effectDigest: string;
}

type BuildOpRecordParams = {
  frame: PatchFrame; opIndex: number; receiptOpIndex: number;
  canonOp: CanonicalOpBlob; receiptOutcome: OpOutcome;
  receiptOpType: string; diagnostics: ConflictDiagnostic[];
};

type AnalyzeOneOpParams = {
  frame: PatchFrame; opIndex: number; receiptOpIndex: number;
  receipt: TickReceipt; diagnostics: ConflictDiagnostic[];
};

type AnalyzeOneOpResult = { record: OpRecord | null; nextReceiptOpIndex: number };

/** Resolves target and effectDigest; emits diagnostics on failure. */
async function resolveTarget(
  service: HashingService,
  params: BuildOpRecordParams,
): Promise<ResolvedOpIdentity | null> {
  const { frame, opIndex, canonOp, receiptOutcome, receiptOpType, diagnostics } = params;
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
  return { target, effectDigest };
}

/**
 * Builds a full OpRecord from a canonical op, its receipt outcome, and frame context.
 */
export async function buildOpRecord(
  service: HashingService,
  params: BuildOpRecordParams,
): Promise<OpRecord | null> {
  const identity = await resolveTarget(service, params);
  if (identity === null) { return null; }
  const { frame, opIndex, receiptOpIndex, receiptOutcome, receiptOpType } = params;
  const { patch, sha, context, patchOrder } = frame;
  return new OpRecord({
    target: identity.target, patchSha: sha,
    writerId: patch.writer, lamport: patch.lamport,
    opIndex, receiptOpIndex, opType: receiptOpType,
    receiptResult: receiptOutcome.result,
    ...(receiptOutcome.reason !== undefined ? { receiptReason: receiptOutcome.reason } : {}),
    effectDigest: identity.effectDigest,
    eventId: new EventId(patch.lamport, patch.writer, sha, opIndex),
    context, patchOrder,
  });
}

// ── Single-op analysis ──────────────────────────────────────────────

/** Emits a receipt_unavailable diagnostic and returns the miss result. */
function handleMissingReceipt(
  diagnostics: ConflictDiagnostic[],
  { frame, opIndex, receiptOpIndex }: { frame: PatchFrame; opIndex: number; receiptOpIndex: number },
): AnalyzeOneOpResult {
  const { patch, sha } = frame;
  pushDiagnostic(diagnostics, {
    code: 'receipt_unavailable',
    message: `Receipt outcome missing for ${patch.writer}@${patch.lamport}#${opIndex}`,
    severity: 'warning',
    data: { patchSha: sha, writerId: patch.writer, lamport: patch.lamport, opIndex },
  });
  return { record: null, nextReceiptOpIndex: receiptOpIndex + 1 };
}

/**
 * Analyzes a single operation within a frame.
 */
export async function analyzeOneOp(
  service: HashingService,
  { frame, opIndex, receiptOpIndex, receipt, diagnostics }: AnalyzeOneOpParams,
): Promise<AnalyzeOneOpResult | null> {
  const rawOp = frame.patch.ops[opIndex];
  if (rawOp === undefined) { return null; }
  const canonOp: CanonicalOpBlob | null = normalizeConflictOp(rawOp);
  if (canonOp === null) { return null; }
  const receiptOpType = receiptNameForOp(canonOp);
  const receiptOutcome = receipt.ops[receiptOpIndex];
  if (receiptOutcome === undefined || receiptOutcome === null) {
    return handleMissingReceipt(diagnostics, { frame, opIndex, receiptOpIndex });
  }
  const record = await buildOpRecord(service, {
    frame, opIndex, receiptOpIndex, canonOp, receiptOutcome, receiptOpType, diagnostics,
  });
  return { record, nextReceiptOpIndex: receiptOpIndex + 1 };
}

// ── Candidate classification ─────────────────────────────────────────

/** Builds a supersession ConflictCandidate. */
function buildSupersessionCandidate(record: OpRecord, winner: OpRecord): ConflictCandidate {
  return new ConflictCandidate({
    kind: 'supersession', target: record.target, winner, loser: record,
    resolution: ConflictResolution.fromCandidate({
      reducerId: CONFLICT_REDUCER_ID, kind: 'supersession', code: 'receipt_superseded',
      winner, loser: loserFields(record),
    }),
    noteCodes: normalizeNoteCodes(
      [
        CLASSIFICATION_NOTES.RECEIPT_SUPERSEDED, CLASSIFICATION_NOTES.SAME_TARGET,
        record.writerId !== winner.writerId ? CLASSIFICATION_NOTES.DIFFERENT_WRITER : '',
        inferRelationNote(winner, record),
      ].filter(Boolean),
    ),
  });
}

/**
 * Adds a supersession candidate if the record was superseded.
 */
export function maybeAddSupersessionCandidate(
  collector: CollectorState,
  record: OpRecord,
  currentPropertyWinner: OpRecord | null,
): void {
  if (!record.isPropertySet() || record.receiptResult !== 'superseded' || currentPropertyWinner === null) {
    return;
  }
  collector.candidates.push(buildSupersessionCandidate(record, currentPropertyWinner));
}

/**
 * Adds a redundancy candidate if the record was redundant.
 */
export function maybeAddRedundancyCandidate(
  collector: CollectorState,
  record: OpRecord,
  priorEquivalent: OpRecord | null,
): void {
  if (record.receiptResult !== 'redundant' || priorEquivalent === null) {
    return;
  }
  collector.candidates.push(
    new ConflictCandidate({
      kind: 'redundancy',
      target: record.target,
      winner: priorEquivalent,
      loser: record,
      resolution: ConflictResolution.fromCandidate({
        reducerId: CONFLICT_REDUCER_ID,
        kind: 'redundancy',
        code: 'receipt_redundant',
        winner: priorEquivalent,
        loser: loserFields(record),
      }),
      noteCodes: normalizeNoteCodes([
        CLASSIFICATION_NOTES.RECEIPT_REDUNDANT,
        CLASSIFICATION_NOTES.SAME_TARGET,
        CLASSIFICATION_NOTES.REPLAY_EQUIVALENT_EFFECT,
      ]),
    }),
  );
}

/**
 * Tracks an applied record in the collector for property winner and equivalent effect lookups.
 */
export function trackAppliedRecord(collector: CollectorState, record: OpRecord): void {
  if (record.receiptResult !== 'applied') {
    return;
  }
  collector.equivalentWinnerByTargetEffect.set(
    effectKey(record.target, record.effectDigest),
    record,
  );
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
 */
export function isEventualOverrideLoser(
  loser: OpRecord,
  finalWinner: OpRecord,
  scannedPatchShas: Set<string>,
): boolean {
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

/** Builds an eventual_override ConflictCandidate. */
function buildEventualOverrideCandidate(loser: OpRecord, finalWinner: OpRecord): ConflictCandidate {
  const relation = inferCausalRelation(finalWinner, loser);
  return new ConflictCandidate({
    kind: 'eventual_override', target: finalWinner.target, winner: finalWinner, loser,
    resolution: ConflictResolution.fromCandidate({
      reducerId: CONFLICT_REDUCER_ID, kind: 'eventual_override', code: 'effective_state_override',
      winner: finalWinner, loser: loserFields(loser),
    }),
    noteCodes: normalizeNoteCodes([
      CLASSIFICATION_NOTES.SAME_TARGET, CLASSIFICATION_NOTES.DIFFERENT_WRITER,
      CLASSIFICATION_NOTES.DIGEST_DIFFERS, CLASSIFICATION_NOTES.EFFECTIVE_THEN_LOST,
      relation === 'concurrent' ? CLASSIFICATION_NOTES.CONCURRENT_TO_WINNER : CLASSIFICATION_NOTES.ORDERED_BEFORE_WINNER,
    ]),
  });
}

/**
 * Emits eventual override candidates for a single target's applied history.
 */
export function emitEventualOverridesForTarget(
  collector: CollectorState,
  { history, finalWinner, scannedPatchShas }: {
    history: OpRecord[]; finalWinner: OpRecord; scannedPatchShas: Set<string>;
  },
): void {
  for (const loser of history) {
    if (!isEventualOverrideLoser(loser, finalWinner, scannedPatchShas)) { continue; }
    collector.candidates.push(buildEventualOverrideCandidate(loser, finalWinner));
  }
}

/**
 * Scans applied property history for eventual-override candidates.
 */
export function addEventualOverrideCandidates(
  collector: CollectorState,
  scannedPatchShas: Set<string>,
): void {
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
 */
export function processAnalyzedRecord(
  collector: CollectorState,
  {
    record,
    sha,
    scannedPatchShas,
  }: {
    record: OpRecord;
    sha: string;
    scannedPatchShas: Set<string>;
  },
): void {
  const currentPropertyWinner =
    collector.propertyWinnerByTarget.get(record.targetKey) ?? null;
  const priorEquivalent =
    collector.equivalentWinnerByTargetEffect.get(
      effectKey(record.target, record.effectDigest),
    ) ?? null;
  if (scannedPatchShas.has(sha)) {
    maybeAddSupersessionCandidate(collector, record, currentPropertyWinner);
    maybeAddRedundancyCandidate(collector, record, priorEquivalent);
  }
  trackAppliedRecord(collector, record);
}

// ── Frame analysis ──────────────────────────────────────────────────

type AnalyzeFrameOpsParams = {
  frame: PatchFrame; scannedPatchShas: Set<string>;
  diagnostics: ConflictDiagnostic[]; collector: CollectorState;
};

/**
 * Analyzes all operations in a single patch frame.
 */
export async function analyzeFrameOps(
  service: HashingService,
  { frame, scannedPatchShas, diagnostics, collector }: AnalyzeFrameOpsParams,
): Promise<void> {
  const { patch, receipt, sha } = frame;
  let receiptOpIndex = 0;
  for (let opIndex = 0; opIndex < patch.ops.length; opIndex++) {
    const result = await analyzeOneOp(service, { frame, opIndex, receiptOpIndex, receipt, diagnostics });
    if (result === null) { continue; }
    receiptOpIndex = result.nextReceiptOpIndex;
    if (result.record !== null) {
      processAnalyzedRecord(collector, { record: result.record, sha, scannedPatchShas });
    }
  }
}
