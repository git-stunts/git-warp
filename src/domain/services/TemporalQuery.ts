/**
 * TemporalQuery - CTL*-style temporal operators over WARP graph history.
 *
 * Implements `always` and `eventually` temporal operators from Paper IV
 * (Echo and the WARP Core). These operators evaluate predicates across
 * the graph's history by replaying patches incrementally and checking
 * the predicate at each tick boundary.
 *
 * ## Temporal Operators
 *
 * - **always(nodeId, predicate, { since })**: True iff the predicate holds
 *   at every tick since `since` where the node exists.
 * - **eventually(nodeId, predicate, { since })**: True iff the predicate holds
 *   at some tick since `since`.
 *
 * ## Implementation
 *
 * Both operators collect all patches, sort them by causal order (same as
 * materialization), then apply patches one at a time. After each patch
 * application, a node snapshot is extracted and passed to the predicate.
 *
 * The "tick" corresponds to a patch's Lamport timestamp. The `since` option
 * filters out patches with Lamport timestamps below the threshold.
 *
 * @module domain/services/TemporalQuery
 * @see Paper IV - Echo and the WARP Core (CTL* temporal logic on histories)
 */

import { createEmptyState, cloneState, join as joinPatch } from './JoinReducer.ts';
import { decodePropKey } from './KeyCodec.ts';
import type WarpState from './state/WarpState.ts';
import type Patch from '../types/Patch.ts';

/**
 * A node snapshot passed to temporal predicates.
 */
export interface NodeSnapshot {
  id: string;
  exists: boolean;
  props: Record<string, unknown>;
}

/**
 * A patch with its SHA, used during replay.
 */
interface PatchEntry {
  patch: Patch;
  sha: string;
}

/**
 * A checkpoint that can be used to start replay from a known-good state.
 */
interface Checkpoint {
  state: WarpState;
  maxLamport: number;
}

/**
 * Parameters shared by both replay functions.
 */
interface ReplayParams {
  state: WarpState;
  allPatches: PatchEntry[];
  startIdx: number;
  since: number;
  nodeId: string;
  predicate: (snapshot: NodeSnapshot) => boolean;
}

/**
 * Checks if a value is a non-null object.
 */
function isNonNullObject(value: unknown): value is object {
  return value !== null && value !== undefined && typeof value === 'object';
}

/**
 * Unwraps a property value from its CRDT envelope.
 *
 * InlineValue objects `{ type: 'inline', value: ... }` are unwrapped
 * to their inner value. All other values pass through unchanged.
 */
function unwrapValue(value: unknown): unknown {
  if (isNonNullObject(value) && 'type' in value) {
    const rec = value as { type: string; value?: unknown };
    return rec.type === 'inline' ? rec.value : value;
  }
  return value;
}

/**
 * Extracts a node snapshot from the current WARP state.
 *
 * Returns an object with `{ id, exists, props }` where props is a
 * plain object mapping property keys to their unwrapped values.
 * InlineValue wrappers are stripped so predicates can compare against
 * raw values directly (e.g., `n.props.status === 'active'`).
 *
 * If the node does not exist in the state, `exists` is false and
 * `props` is an empty object.
 */
function extractNodeSnapshot(state: WarpState, nodeId: string): NodeSnapshot {
  const exists = state.nodeAlive.contains(nodeId);
  const props: Record<string, unknown> = {};

  if (exists) {
    const prefix = `${nodeId}\0`;
    for (const [propKey, register] of state.prop) {
      if (propKey.startsWith(prefix)) {
        const decoded = decodePropKey(propKey);
        props[decoded.propKey] = unwrapValue(register.value);
      }
    }
  }

  return { id: nodeId, exists, props };
}

/**
 * Evaluates checkpoint boundary semantics for `always()`.
 */
function evaluateAlwaysCheckpointBoundary(params: {
  state: WarpState;
  nodeId: string;
  predicate: (snapshot: NodeSnapshot) => boolean;
  checkpointMaxLamport: number | null;
  since: number;
}): { nodeEverExisted: boolean; shouldReturn: boolean; returnValue: boolean } {
  const { state, nodeId, predicate, checkpointMaxLamport, since } = params;
  if (checkpointMaxLamport !== since) {
    return { nodeEverExisted: false, shouldReturn: false, returnValue: false };
  }
  const snapshot = extractNodeSnapshot(state, nodeId);
  if (!snapshot.exists) {
    return { nodeEverExisted: false, shouldReturn: false, returnValue: false };
  }
  if (!predicate(snapshot)) {
    return { nodeEverExisted: true, shouldReturn: true, returnValue: false };
  }
  return { nodeEverExisted: true, shouldReturn: false, returnValue: false };
}

/**
 * Evaluates checkpoint boundary semantics for `eventually()`.
 */
function evaluateEventuallyCheckpointBoundary(params: {
  state: WarpState;
  nodeId: string;
  predicate: (snapshot: NodeSnapshot) => boolean;
  checkpointMaxLamport: number | null;
  since: number;
}): boolean {
  const { state, nodeId, predicate, checkpointMaxLamport, since } = params;
  if (checkpointMaxLamport !== since) {
    return false;
  }
  const snapshot = extractNodeSnapshot(state, nodeId);
  return snapshot.exists && predicate(snapshot);
}

/**
 * Attempts to resume from a checkpoint for temporal replay.
 */
async function _tryCheckpointStart(
  loadCheckpoint: () => Promise<Checkpoint | null>,
  allPatches: PatchEntry[],
  since: number,
): Promise<{ state: WarpState; startIdx: number; checkpointMaxLamport: number | null }> {
  const ck = await loadCheckpoint();
  const usable = ck !== null && ck.maxLamport <= since;
  if (!usable) {
    return { state: createEmptyState(), startIdx: 0, checkpointMaxLamport: null };
  }
  const idx = allPatches.findIndex(({ patch }) => (patch as { lamport: number }).lamport > ck.maxLamport);
  const startIdx = idx < 0 ? allPatches.length : idx;
  return { state: cloneState(ck.state), startIdx, checkpointMaxLamport: ck.maxLamport };
}

/**
 * Extracts the lamport timestamp from a patch safely.
 */
function patchLamport(patch: Patch): number {
  return (patch as unknown as { lamport: number }).lamport;
}

/**
 * Replays patches for the `always` operator, checking the predicate at each tick.
 */
function _replayAlways(opts: ReplayParams & { nodeEverExisted: boolean }): boolean {
  const { state, allPatches, startIdx, since, nodeId, predicate } = opts;
  let seen = opts.nodeEverExisted;
  for (const { patch, sha } of allPatches.slice(startIdx)) {
    joinPatch(state, patch, sha);

    if (patchLamport(patch) < since) {
      continue;
    }

    const snapshot = extractNodeSnapshot(state, nodeId);
    if (snapshot.exists) {
      seen = true;
      if (!predicate(snapshot)) {
        return false;
      }
    }
  }
  return seen;
}

/**
 * Replays patches for the `eventually` operator, short-circuiting on first match.
 */
function _replayEventually(opts: ReplayParams): boolean {
  const { state, allPatches, startIdx, since, nodeId, predicate } = opts;
  for (const { patch, sha } of allPatches.slice(startIdx)) {
    joinPatch(state, patch, sha);

    if (patchLamport(patch) < since) {
      continue;
    }

    const snapshot = extractNodeSnapshot(state, nodeId);
    if (snapshot.exists && predicate(snapshot)) {
      return true;
    }
  }
  return false;
}

/**
 * TemporalQuery provides temporal logic operators over graph history.
 *
 * Constructed by WarpRuntime and exposed via `graph.temporal`.
 * Both methods are async because they need to load patches from Git.
 */
export class TemporalQuery {
  private readonly _loadAllPatches: () => Promise<PatchEntry[]>;
  private readonly _loadCheckpoint: (() => Promise<Checkpoint | null>) | null;

  /**
   * Creates a TemporalQuery with patch-loading and optional checkpoint functions.
   */
  constructor(options: {
    loadAllPatches: () => Promise<PatchEntry[]>;
    loadCheckpoint?: () => Promise<Checkpoint | null>;
  }) {
    this._loadAllPatches = options.loadAllPatches;
    this._loadCheckpoint = options.loadCheckpoint ?? null;
  }

  /**
   * Tests whether a predicate holds at every tick since `since`.
   *
   * Replays patches from `since` to current. At each tick boundary,
   * builds the node snapshot and tests the predicate. Returns true only
   * if the predicate returned true at every tick where the node existed.
   *
   * Returns false if the node never existed in the range.
   *
   * @param nodeId - The node ID to evaluate
   * @param predicate - Predicate receiving node snapshot `{ id, exists, props }`. Should return boolean.
   * @param options - Options
   * @returns True if predicate held at every tick
   *
   * @example
   * const result = await graph.temporal.always(
   *   'user:alice',
   *   n => n.props.status === 'active',
   *   { since: 0 }
   * );
   */
  async always(
    nodeId: string,
    predicate: (snapshot: NodeSnapshot) => boolean,
    options: { since?: number } = {},
  ): Promise<boolean> {
    const since = options.since ?? 0;
    const allPatches = await this._loadAllPatches();

    const { state, startIdx, checkpointMaxLamport } = await this._resolveStart(allPatches, since);
    const boundary = evaluateAlwaysCheckpointBoundary({
      state, nodeId, predicate, checkpointMaxLamport, since,
    });
    if (boundary.shouldReturn) {
      return boundary.returnValue;
    }

    return _replayAlways({ state, allPatches, startIdx, since, nodeId, predicate, nodeEverExisted: boundary.nodeEverExisted });
  }

  /**
   * Tests whether a predicate holds at some tick since `since`.
   *
   * Replays patches from `since` to current. At each tick boundary,
   * builds the node snapshot and tests the predicate. Returns true as
   * soon as the predicate returns true at any tick.
   *
   * @param nodeId - The node ID to evaluate
   * @param predicate - Predicate receiving node snapshot `{ id, exists, props }`. Should return boolean.
   * @param options - Options
   * @returns True if predicate held at any tick
   *
   * @example
   * const result = await graph.temporal.eventually(
   *   'user:alice',
   *   n => n.props.status === 'merged',
   *   { since: 0 }
   * );
   */
  async eventually(
    nodeId: string,
    predicate: (snapshot: NodeSnapshot) => boolean,
    options: { since?: number } = {},
  ): Promise<boolean> {
    const since = options.since ?? 0;
    const allPatches = await this._loadAllPatches();

    const { state, startIdx, checkpointMaxLamport } = await this._resolveStart(allPatches, since);

    if (evaluateEventuallyCheckpointBoundary({
      state, nodeId, predicate, checkpointMaxLamport, since,
    })) {
      return true;
    }

    return _replayEventually({ state, allPatches, startIdx, since, nodeId, predicate });
  }

  /**
   * Resolves the initial state and start index for temporal replay.
   *
   * When `since > 0` and a checkpoint is available with
   * `maxLamport <= since`, uses the checkpoint state and skips
   * patches already covered by it. Otherwise falls back to an
   * empty state starting from index 0.
   *
   * **Checkpoint `maxLamport` invariant**: The checkpoint's `maxLamport` value
   * MUST represent a fully-closed Lamport tick — i.e. ALL patches with
   * `lamport <= maxLamport` are included in the checkpoint state. The
   * `findIndex` below uses strict `>` to locate the first patch *after* the
   * checkpoint boundary. If a checkpoint were created mid-tick (some but not
   * all patches at a given Lamport value included), this would silently skip
   * the remaining same-tick patches. Checkpoint creators MUST guarantee the
   * all-or-nothing inclusion property for any given Lamport tick.
   *
   * @param allPatches - All patches in causal order
   * @param since - Minimum Lamport tick
   * @returns Start state, start index, and checkpoint max lamport
   */
  private async _resolveStart(
    allPatches: PatchEntry[],
    since: number,
  ): Promise<{ state: WarpState; startIdx: number; checkpointMaxLamport: number | null }> {
    if (since > 0 && this._loadCheckpoint !== null) {
      return await _tryCheckpointStart(this._loadCheckpoint, allPatches, since);
    }
    return { state: createEmptyState(), startIdx: 0, checkpointMaxLamport: null };
  }
}
