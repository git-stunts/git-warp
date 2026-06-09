/**
 * JoinReducer — thin core of the WARP v5 reducer.
 *
 * After the M14/JoinReducer-split refactor, the only logic remaining
 * in this file is the per-path dispatcher (applyFast / applyWithDiff /
 * applyWithReceipt), the reduceV5 driver, and thin wrappers for
 * backward-compatible factory/clone/join helpers.
 *
 * Everything else lives in its own module:
 *
 *   - Op class hierarchy    → src/domain/types/ops/
 *   - OpOutcomeResult family → src/domain/types/ops/
 *   - OpValidator            → ./OpValidator.ts
 *   - DiffCalculator         → ./DiffCalculator.ts
 *   - ReceiptBuilder         → ./ReceiptBuilder.ts
 *   - OpStrategy base / registry → ./OpStrategy.ts + ./OpStrategies.ts
 *   - WarpState class      → ./state/WarpState.ts (state factory
 *     concerns live as methods on the class)
 *
 * @module domain/services/JoinReducer
 */

import { EventId } from '../utils/EventId.ts';
import { createTickReceipt, type TickReceipt, type OpOutcome } from '../types/TickReceipt.ts';
import { normalizeRawOp } from './OpNormalizer.ts';
import { PatchDiff, createEmptyDiff, createPatchDiffAccumulator, mergeDiffs } from '../types/PatchDiff.ts';
import PatchError from '../errors/PatchError.ts';
import WarpState from './state/WarpState.ts';
import OpSuperseded from '../types/ops/OpSuperseded.ts';
import OpValidator from './OpValidator.ts';
import ReceiptBuilder from './ReceiptBuilder.ts';
import Op from '../types/ops/Op.ts';
import type { OpLike } from './OpLike.ts'; // nosemgrep: ts-no-like-types -- 0025C
// -------------------------------------------------------------------
// Re-exports kept during the incremental split. Consumers will migrate
// to the direct import paths in a follow-up pass and these go away.
// -------------------------------------------------------------------

export { default as WarpState } from './state/WarpState.ts';
export { default as OpOutcomeResult } from '../types/ops/OpOutcomeResult.ts';
export { default as OpApplied } from '../types/ops/OpApplied.ts';
export { default as OpSuperseded } from '../types/ops/OpSuperseded.ts';
export { default as OpRedundant } from '../types/ops/OpRedundant.ts';
export { OP_STRATEGIES } from './OpStrategies.ts';
export type { OpLike } from './OpLike.ts'; // nosemgrep: ts-no-like-types -- 0025C
export {
  encodeEdgeKey, decodeEdgeKey,
  encodePropKey,
  EDGE_PROP_PREFIX,
  encodeEdgePropKey, isEdgePropKey,
} from './KeyCodec.ts';
export { normalizeRawOp, lowerCanonicalOp } from './OpNormalizer.ts';

/** @deprecated Use OpValidator.RAW_KNOWN_OPS */
export const { RAW_KNOWN_OPS } = OpValidator;
/** @deprecated Use OpValidator.CANONICAL_KNOWN_OPS */
export const { CANONICAL_KNOWN_OPS } = OpValidator;
/** @deprecated Use OpValidator.isKnownRaw */
export function isKnownRawOp(op: unknown): boolean { return OpValidator.isKnownRaw(op); } // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
/** @deprecated Use OpValidator.isKnownCanonical */
export function isKnownCanonicalOp(op: unknown): boolean { return OpValidator.isKnownCanonical(op); } // nosemgrep: ts-no-unknown-outside-adapters -- 0025B

// -------------------------------------------------------------------
// Patch shape
// -------------------------------------------------------------------

/** Minimal patch shape the reducer reads. */
export type PatchLike = { // nosemgrep: ts-no-like-types -- 0025C
  readonly writer: string;
  readonly lamport: number;
  readonly ops: readonly OpLike[]; // nosemgrep: ts-no-like-types -- 0025C
  readonly context:
    | WarpState['observedFrontier']
    | Map<string, number>
    | Record<string, number>
    | null
    | undefined;
};

// -------------------------------------------------------------------
// State factory wrappers — real homes are on WarpState
// -------------------------------------------------------------------

/**
 * Creates an empty state. Thin wrapper around `WarpState.empty()`.
 * @deprecated Call `WarpState.empty()` directly.
 */
export function createEmptyState(): WarpState {
  return WarpState.empty();
}

/**
 * Returns a deep clone of a state. Accepts either a real
 * `WarpState` instance or a plain/deserialized snapshot (from a
 * checkpoint decode).
 * @deprecated Call `WarpState.cloneFromSnapshot(state)` directly.
 */
export function cloneState(state: Parameters<typeof WarpState.cloneFromSnapshot>[0]): WarpState {
  return WarpState.cloneFromSnapshot(state);
}

/**
 * CRDT join of two states. Thin wrapper around `a.join(b)`.
 * @deprecated Call `a.join(b)` directly.
 */
export function joinStates(a: WarpState, b: WarpState): WarpState {
  return a.join(b);
}

// -------------------------------------------------------------------
// Core reducer
// -------------------------------------------------------------------

/**
 * Applies a single V2 operation to the given state. Mutates `state`
 * in place. Unknown op types fail closed instead of becoming silent
 * data loss.
 */
export function applyOpV2(state: WarpState, op: OpLike, eventId: EventId): void { // nosemgrep: ts-no-like-types -- 0025C
  const type = readReducerOpType(op);
  assertKnownReducerOp(op, type);
  const canonOp = normalizeRawOp(op);
  if (!(canonOp instanceof Op)) { return; }
  canonOp.validate();
  canonOp.mutate(state, eventId);
}

function readReducerOpType(op: OpLike): string { // nosemgrep: ts-no-like-types -- 0025C
  if (op === null || op === undefined || typeof op !== 'object') {
    throw new PatchError(
      `Invalid op: expected object with string 'type', got ${String(op)}`,
      { context: { actual: String(op) } },
    );
  }
  const type = Reflect.get(op, 'type');
  if (typeof type !== 'string') {
    throw new PatchError(
      `Invalid op: expected object with string 'type', got ${typeof type}`,
      { context: { actual: typeof type } },
    );
  }
  return type;
}

function assertKnownReducerOp(op: OpLike, type: string): void { // nosemgrep: ts-no-like-types -- 0025C
  if (OpValidator.isKnownRaw(op) || OpValidator.isKnownCanonical(op)) { return; }
  throw new PatchError(
    `Unknown patch op type: ${type}`,
    { code: 'E_PATCH_UNKNOWN_OP', context: { opType: type } },
  );
}

/** Applies a patch to state without receipt or diff collection. */
export function applyFast(state: WarpState, patch: PatchLike, patchSha: string): WarpState { // nosemgrep: ts-no-like-types -- 0025C
  for (let i = 0; i < patch.ops.length; i++) {
    const op = patch.ops[i];
    if (op === undefined) { continue; }
    const type = readReducerOpType(op);
    assertKnownReducerOp(op, type);
    const canonOp = normalizeRawOp(op);
    if (!(canonOp instanceof Op)) { continue; }
    canonOp.validate();
    const eventId = new EventId(patch.lamport, patch.writer, patchSha, i);
    canonOp.mutate(state, eventId);
  }
  state.foldPatch(patch);
  return state;
}

/**
 * Applies a patch with diff tracking for incremental index updates.
 * Only emits diff entries when alive-ness actually changes.
 */
export function applyWithDiff(
  state: WarpState,
  patch: PatchLike, // nosemgrep: ts-no-like-types -- 0025C
  patchSha: string,
): { state: WarpState; diff: PatchDiff } {
  const diff = createPatchDiffAccumulator();
  for (let i = 0; i < patch.ops.length; i++) {
    const rawOp = patch.ops[i];
    if (rawOp === undefined) { continue; }
    const type = readReducerOpType(rawOp);
    assertKnownReducerOp(rawOp, type);
    const canonOp = normalizeRawOp(rawOp);
    if (!(canonOp instanceof Op)) { continue; }
    canonOp.validate();
    const eventId = new EventId(patch.lamport, patch.writer, patchSha, i);
    const before = canonOp.snapshot(state);
    canonOp.mutate(state, eventId);
    canonOp.accumulate(diff, state, before);
  }
  state.foldPatch(patch);
  return { state, diff: new PatchDiff(diff) };
}

/**
 * Applies a patch with receipt collection for provenance tracking.
 * Returns a TickReceipt describing the outcome of every op in the
 * patch.
 */
export function applyWithReceipt(
  state: WarpState,
  patch: PatchLike, // nosemgrep: ts-no-like-types -- 0025C
  patchSha: string,
): { state: WarpState; receipt: TickReceipt } {
  const opResults: OpOutcome[] = [];
  for (let i = 0; i < patch.ops.length; i++) {
    const rawOp = patch.ops[i];
    if (rawOp === undefined) { continue; }
    const type = readReducerOpType(rawOp);
    assertKnownReducerOp(rawOp, type);
    const canonOp = normalizeRawOp(rawOp);
    if (!(canonOp instanceof Op)) { continue; }
    canonOp.validate();
    const eventId = new EventId(patch.lamport, patch.writer, patchSha, i);

    // Determine outcome BEFORE applying the op (state is pre-op).
    const outcome = canonOp.outcome(state, eventId);

    canonOp.mutate(state, eventId);

    const receiptOp = canonOp.receiptName;
    if (!ReceiptBuilder.VALID_RECEIPT_OPS.has(receiptOp)) {
      continue;
    }
    const entry: OpOutcome = { op: receiptOp, target: outcome.target, result: outcome.result };
    if (outcome instanceof OpSuperseded && outcome.reason.length > 0) {
      entry.reason = outcome.reason;
    }
    opResults.push(entry);
  }

  state.foldPatch(patch);

  const receipt = createTickReceipt({
    patchSha,
    writer: patch.writer,
    lamport: patch.lamport,
    ops: opResults,
  });

  return { state, receipt };
}

/**
 * Applies a patch and optionally collects a TickReceipt. Dispatches
 * to `applyWithReceipt` when `collectReceipts` is true, otherwise
 * `applyFast`.
 */
export function join(
  state: WarpState,
  patch: PatchLike, // nosemgrep: ts-no-like-types -- 0025C
  patchSha: string,
  collectReceipts?: boolean,
): WarpState | { state: WarpState; receipt: TickReceipt } {
  return collectReceipts === true
    ? applyWithReceipt(state, patch, patchSha)
    : applyFast(state, patch, patchSha);
}

/**
 * Reduces a sequence of patches into a V5 state. Supports three modes:
 *
 *   - default       → returns the mutated state
 *   - `receipts`    → returns `{ state, receipts }` for provenance tracking
 *   - `trackDiff`   → returns `{ state, diff }` for incremental index updates
 */
export function reduceV5(
  patches: ReadonlyArray<{ readonly patch: PatchLike; readonly sha: string }>, // nosemgrep: ts-no-like-types -- 0025C
  initialState?: WarpState,
  options?: { readonly receipts?: boolean; readonly trackDiff?: boolean },
): WarpState | { state: WarpState; receipts: TickReceipt[] } | { state: WarpState; diff: PatchDiff } {
  const state = initialState ? cloneState(initialState) : createEmptyState();

  if (options !== undefined && options.receipts === true) {
    const receipts: TickReceipt[] = [];
    for (const { patch, sha } of patches) {
      const result = applyWithReceipt(state, patch, sha);
      receipts.push(result.receipt);
    }
    return { state, receipts };
  }

  if (options !== undefined && options.trackDiff === true) {
    let merged = createEmptyDiff();
    for (const { patch, sha } of patches) {
      const { diff } = applyWithDiff(state, patch, sha);
      merged = mergeDiffs(merged, diff);
    }
    return { state, diff: merged };
  }

  for (const { patch, sha } of patches) {
    applyFast(state, patch, sha);
  }
  return state;
}
