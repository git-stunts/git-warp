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
 *   - OpStrategy hierarchy   → ./OpStrategies.ts
 *   - WarpState class      → ./state/WarpState.ts (state factory
 *     concerns live as methods on the class)
 *
 * @module domain/services/JoinReducer
 */

import { createEventId, type EventId } from '../utils/EventId.ts';
import { createTickReceipt, type TickReceipt, type OpOutcome } from '../types/TickReceipt.ts';
import { normalizeRawOp } from './OpNormalizer.ts';
import { createEmptyDiff, mergeDiffs, type PatchDiff } from '../types/PatchDiff.ts';
import PatchError from '../errors/PatchError.ts';
import WarpState from './state/WarpState.ts';
import OpSuperseded from '../types/ops/OpSuperseded.ts';
import OpValidator from './OpValidator.ts';
import ReceiptBuilder from './ReceiptBuilder.ts';
import { OP_STRATEGIES, type OpLike } from './OpStrategies.ts';

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
export {
  encodeEdgeKey, decodeEdgeKey,
  encodePropKey, decodePropKey,
  EDGE_PROP_PREFIX,
  encodeEdgePropKey, isEdgePropKey, decodeEdgePropKey,
} from './KeyCodec.js';
export { normalizeRawOp, lowerCanonicalOp } from './OpNormalizer.ts';

/** @deprecated Use OpValidator.RAW_KNOWN_OPS */
export const { RAW_KNOWN_OPS } = OpValidator;
/** @deprecated Use OpValidator.CANONICAL_KNOWN_OPS */
export const { CANONICAL_KNOWN_OPS } = OpValidator;
/** @deprecated Use OpValidator.isKnownRaw */
export function isKnownRawOp(op: unknown): boolean { return OpValidator.isKnownRaw(op); }
/** @deprecated Use OpValidator.isKnownCanonical */
export function isKnownCanonicalOp(op: unknown): boolean { return OpValidator.isKnownCanonical(op); }

// -------------------------------------------------------------------
// Patch shape
// -------------------------------------------------------------------

/** Minimal patch shape the reducer reads. */
export type PatchLike = {
  readonly writer: string;
  readonly lamport: number;
  readonly ops: readonly OpLike[];
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
 * in place. Unknown op types are silently ignored for forward
 * compatibility.
 */
export function applyOpV2(state: WarpState, op: OpLike, eventId: EventId): void {
  if (op === null || op === undefined || typeof op.type !== 'string') {
    const actual = op === null || op === undefined ? String(op) : typeof (op as { type: unknown }).type;
    throw new PatchError(
      `Invalid op: expected object with string 'type', got ${actual}`,
      { context: { actual } },
    );
  }
  const strategy = OP_STRATEGIES.get(op.type);
  if (!strategy) { return; }
  strategy.validate(op as { readonly type: string; readonly [key: string]: unknown });
  strategy.mutate(state, op, eventId);
}

/** Applies a patch to state without receipt or diff collection. */
export function applyFast(state: WarpState, patch: PatchLike, patchSha: string): WarpState {
  for (let i = 0; i < patch.ops.length; i++) {
    const op = patch.ops[i];
    if (op === undefined) { continue; }
    const canonOp = normalizeRawOp(op);
    const strategy = OP_STRATEGIES.get(canonOp.type);
    if (!strategy) { continue; }
    strategy.validate(canonOp as { readonly type: string; readonly [key: string]: unknown });
    const eventId = createEventId(patch.lamport, patch.writer, patchSha, i);
    strategy.mutate(state, canonOp, eventId);
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
  patch: PatchLike,
  patchSha: string,
): { state: WarpState; diff: PatchDiff } {
  const diff = createEmptyDiff();
  for (let i = 0; i < patch.ops.length; i++) {
    const rawOp = patch.ops[i];
    if (rawOp === undefined) { continue; }
    const canonOp = normalizeRawOp(rawOp);
    const strategy = OP_STRATEGIES.get(canonOp.type);
    if (!strategy) { continue; }
    strategy.validate(canonOp as { readonly type: string; readonly [key: string]: unknown });
    const eventId = createEventId(patch.lamport, patch.writer, patchSha, i);
    const before = strategy.snapshot(state, canonOp);
    strategy.mutate(state, canonOp, eventId);
    strategy.accumulate(diff, state, canonOp, before);
  }
  state.foldPatch(patch);
  return { state, diff };
}

/**
 * Applies a patch with receipt collection for provenance tracking.
 * Returns a TickReceipt describing the outcome of every op in the
 * patch.
 */
export function applyWithReceipt(
  state: WarpState,
  patch: PatchLike,
  patchSha: string,
): { state: WarpState; receipt: TickReceipt } {
  const opResults: OpOutcome[] = [];
  for (let i = 0; i < patch.ops.length; i++) {
    const rawOp = patch.ops[i];
    if (rawOp === undefined) { continue; }
    const canonOp = normalizeRawOp(rawOp);
    const strategy = OP_STRATEGIES.get(canonOp.type);
    if (!strategy) { continue; }
    strategy.validate(canonOp as { readonly type: string; readonly [key: string]: unknown });
    const eventId = createEventId(patch.lamport, patch.writer, patchSha, i);

    // Determine outcome BEFORE applying the op (state is pre-op).
    const outcome = strategy.outcome(state, canonOp, eventId);

    strategy.mutate(state, canonOp, eventId);

    const receiptOp = strategy.receiptName;
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
  patch: PatchLike,
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
  patches: ReadonlyArray<{ readonly patch: PatchLike; readonly sha: string }>,
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
