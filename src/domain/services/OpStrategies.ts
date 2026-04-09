/**
 * OpStrategies — the per-op-type dispatch table used by the reducer.
 *
 * Each concrete `OpStrategy` subclass owns the five operations that
 * the reducer needs for a single op type:
 *
 *   1. `validate(op)`    — boundary field-shape checks
 *   2. `mutate(state, op, eventId)` — CRDT mutation (in place)
 *   3. `outcome(state, op, eventId)` — pre-mutation receipt outcome
 *   4. `snapshot(state, op)` — pre-mutation alive/prop snapshot
 *   5. `accumulate(diff, state, op, before)` — post-mutation diff emission
 *
 * The ADR-1 canonical split gives us three property strategies
 * (`PropSetStrategy`, `NodePropSetStrategy`, `EdgePropSetStrategy`)
 * that share mutate / snapshot / accumulate helpers via protected
 * statics on the base class.
 *
 * `OP_STRATEGIES` is the frozen Map used by JoinReducer for dispatch.
 *
 * @module domain/services/OpStrategies
 */

import type { Dot } from '../crdt/Dot.ts';
import { lwwSet, lwwMax } from '../crdt/LWW.ts';
import { compareEventIds, type EventId } from '../utils/EventId.ts';
import {
  encodeEdgeKey,
  encodePropKey,
  encodeEdgePropKey,
  EDGE_PROP_PREFIX,
} from './KeyCodec.js';
import { OP_TYPES } from '../types/TickReceipt.ts';
import PatchError from '../errors/PatchError.ts';
import WarpStateV5 from './state/WarpStateV5.ts';
import type { PatchDiff } from '../types/PatchDiff.ts';
import OpApplied from '../types/ops/OpApplied.ts';
import type OpOutcomeResult from '../types/ops/OpOutcomeResult.ts';
import OpValidator from './OpValidator.ts';
import DiffCalculator from './DiffCalculator.ts';
import ReceiptBuilder from './ReceiptBuilder.ts';

/** Pre-op snapshot bag used to compute post-op diffs. */
export type SnapshotBeforeOp = {
  nodeWasAlive?: boolean;
  edgeWasAlive?: boolean;
  edgeKey?: string;
  prevPropValue?: unknown;
  propKey?: string;
  aliveBeforeNodes?: Set<string>;
  aliveBeforeEdges?: Set<string>;
};

/** Minimal op shape accepted by strategy method signatures. */
export type OpLike = {
  readonly type: string;
  readonly node?: string;
  readonly dot?: Dot;
  readonly observedDots?: ReadonlyArray<string> | Set<string>;
  readonly from?: string;
  readonly to?: string;
  readonly label?: string;
  readonly key?: string;
  readonly value?: unknown;
  readonly oid?: string;
};

/** Shape accepted by `OpValidator.assert*` helpers. */
type OpLikeRecord = { readonly type: string; readonly [key: string]: unknown };

/**
 * Abstract base for per-op-type dispatch strategies.
 *
 * Subclasses override the five methods below. The registry
 * `OP_STRATEGIES` pins one instance per canonical op type.
 */
export abstract class OpStrategy {
  /** TickReceipt-compatible op type string (e.g. `NodeTombstone` for NodeRemove). */
  abstract readonly receiptName: string;

  /** Structural field-shape checks. Throws `PatchError` on failure. */
  abstract validate(op: OpLikeRecord): void;

  /** CRDT mutation. Mutates `state` in place. */
  abstract mutate(state: WarpStateV5, op: OpLike, eventId: EventId): void;

  /** Pre-mutation receipt outcome. Reads state; does not mutate. */
  abstract outcome(state: WarpStateV5, op: OpLike, eventId: EventId): OpOutcomeResult;

  /** Pre-mutation snapshot used by the diff path. Reads state; does not mutate. */
  abstract snapshot(state: WarpStateV5, op: OpLike): SnapshotBeforeOp;

  /** Post-mutation diff accumulation. Mutates `diff` in place. */
  abstract accumulate(
    diff: PatchDiff,
    state: WarpStateV5,
    op: OpLike,
    before: SnapshotBeforeOp,
  ): void;

  // ---------------------------------------------------------------
  // Shared helpers for property-mutation strategies
  // ---------------------------------------------------------------

  /** Shared mutate logic for NodePropSet / EdgePropSet / legacy PropSet. */
  protected static _mutateProp(
    state: WarpStateV5,
    propKey: string,
    eventId: EventId,
    value: unknown,
  ): void {
    const current = state.prop.get(propKey);
    const winner = lwwMax(current, lwwSet(eventId, value));
    if (winner !== null) {
      state.prop.set(propKey, winner);
    }
  }

  /** Shared pre-op snapshot for property strategies. */
  protected static _snapshotProp(state: WarpStateV5, propKey: string): SnapshotBeforeOp {
    const reg = state.prop.get(propKey);
    return { prevPropValue: reg !== undefined ? reg.value : undefined, propKey };
  }

  /** Shared diff accumulator for property strategies. */
  protected static _accumulatePropDiff(
    diff: PatchDiff,
    state: WarpStateV5,
    nodeId: string,
    key: string,
    before: SnapshotBeforeOp,
  ): void {
    const reg = before.propKey !== undefined ? state.prop.get(before.propKey) : undefined;
    const newVal = reg !== undefined ? reg.value : undefined;
    if (newVal !== before.prevPropValue) {
      diff.propsChanged.push({ nodeId, key, value: newVal, prevValue: before.prevPropValue });
    }
  }
}

// ===================================================================
// Concrete strategies — one per canonical op type
// ===================================================================

class NodeAddStrategy extends OpStrategy {
  readonly receiptName = 'NodeAdd';
  validate(op: OpLikeRecord): void { OpValidator.assertString(op, 'node'); OpValidator.assertDot(op); }
  mutate(state: WarpStateV5, op: OpLike): void {
    state.nodeAlive.add(op.node as string, op.dot as Dot);
  }
  outcome(state: WarpStateV5, op: OpLike): OpOutcomeResult {
    return ReceiptBuilder.nodeAddOutcome(state.nodeAlive, { node: op.node as string, dot: op.dot as Dot });
  }
  snapshot(state: WarpStateV5, op: OpLike): SnapshotBeforeOp {
    return { nodeWasAlive: state.nodeAlive.contains(op.node as string) };
  }
  accumulate(diff: PatchDiff, state: WarpStateV5, op: OpLike, before: SnapshotBeforeOp): void {
    if (before.nodeWasAlive !== true && state.nodeAlive.contains(op.node as string)) {
      diff.nodesAdded.push(op.node as string);
    }
  }
}

class NodeRemoveStrategy extends OpStrategy {
  readonly receiptName = 'NodeTombstone';
  validate(op: OpLikeRecord): void { OpValidator.assertIterable(op, 'observedDots'); }
  mutate(state: WarpStateV5, op: OpLike): void {
    const dots = op.observedDots as Iterable<string>;
    state.nodeAlive.remove(dots instanceof Set ? dots : new Set(dots));
  }
  outcome(state: WarpStateV5, op: OpLike): OpOutcomeResult {
    return ReceiptBuilder.nodeRemoveOutcome(state.nodeAlive, {
      node: op.node,
      observedDots: op.observedDots as Iterable<string>,
    });
  }
  snapshot(state: WarpStateV5, op: OpLike): SnapshotBeforeOp {
    const rawDots = op.observedDots as Iterable<string>;
    const nodeDots = rawDots instanceof Set ? rawDots : new Set(rawDots);
    return { aliveBeforeNodes: DiffCalculator.aliveElementsForDots(state.nodeAlive, nodeDots) };
  }
  accumulate(diff: PatchDiff, state: WarpStateV5, _op: OpLike, before: SnapshotBeforeOp): void {
    DiffCalculator.collectNodeRemovals(diff, state, before.aliveBeforeNodes);
  }
}

class EdgeAddStrategy extends OpStrategy {
  readonly receiptName = 'EdgeAdd';
  validate(op: OpLikeRecord): void {
    OpValidator.assertString(op, 'from');
    OpValidator.assertString(op, 'to');
    OpValidator.assertString(op, 'label');
    OpValidator.assertDot(op);
  }
  mutate(state: WarpStateV5, op: OpLike, eventId: EventId): void {
    const edgeKey = encodeEdgeKey(op.from as string, op.to as string, op.label as string);
    state.edgeAlive.add(edgeKey, op.dot as Dot);
    const prev = state.edgeBirthEvent.get(edgeKey);
    if (prev === undefined || compareEventIds(eventId, prev) > 0) {
      state.edgeBirthEvent.set(edgeKey, eventId);
    }
  }
  outcome(state: WarpStateV5, op: OpLike): OpOutcomeResult {
    const edgeKey = encodeEdgeKey(op.from as string, op.to as string, op.label as string);
    return ReceiptBuilder.edgeAddOutcome(state.edgeAlive, { dot: op.dot as Dot }, edgeKey);
  }
  snapshot(state: WarpStateV5, op: OpLike): SnapshotBeforeOp {
    const ek = encodeEdgeKey(op.from as string, op.to as string, op.label as string);
    return { edgeWasAlive: state.edgeAlive.contains(ek), edgeKey: ek };
  }
  accumulate(diff: PatchDiff, state: WarpStateV5, op: OpLike, before: SnapshotBeforeOp): void {
    if (before.edgeWasAlive !== true && before.edgeKey !== undefined && state.edgeAlive.contains(before.edgeKey)) {
      diff.edgesAdded.push({ from: op.from as string, to: op.to as string, label: op.label as string });
    }
  }
}

class EdgeRemoveStrategy extends OpStrategy {
  readonly receiptName = 'EdgeTombstone';
  validate(op: OpLikeRecord): void { OpValidator.assertIterable(op, 'observedDots'); }
  mutate(state: WarpStateV5, op: OpLike): void {
    const dots = op.observedDots as Iterable<string>;
    state.edgeAlive.remove(dots instanceof Set ? dots : new Set(dots));
  }
  outcome(state: WarpStateV5, op: OpLike): OpOutcomeResult {
    return ReceiptBuilder.edgeRemoveOutcome(state.edgeAlive, {
      from: op.from,
      to: op.to,
      label: op.label,
      observedDots: op.observedDots as Iterable<string>,
    });
  }
  snapshot(state: WarpStateV5, op: OpLike): SnapshotBeforeOp {
    const rawEdgeDots = op.observedDots as Iterable<string>;
    const edgeDots = rawEdgeDots instanceof Set ? rawEdgeDots : new Set(rawEdgeDots);
    return { aliveBeforeEdges: DiffCalculator.aliveElementsForDots(state.edgeAlive, edgeDots) };
  }
  accumulate(diff: PatchDiff, state: WarpStateV5, _op: OpLike, before: SnapshotBeforeOp): void {
    DiffCalculator.collectEdgeRemovals(diff, state, before.aliveBeforeEdges);
  }
}

class NodePropSetStrategy extends OpStrategy {
  readonly receiptName = 'NodePropSet';
  validate(op: OpLikeRecord): void {
    OpValidator.assertString(op, 'node');
    OpValidator.assertString(op, 'key');
  }
  mutate(state: WarpStateV5, op: OpLike, eventId: EventId): void {
    OpStrategy._mutateProp(state, encodePropKey(op.node as string, op.key as string), eventId, op.value);
  }
  outcome(state: WarpStateV5, op: OpLike, eventId: EventId): OpOutcomeResult {
    return ReceiptBuilder.propSetOutcome(state.prop, { node: op.node as string, key: op.key as string }, eventId);
  }
  snapshot(state: WarpStateV5, op: OpLike): SnapshotBeforeOp {
    return OpStrategy._snapshotProp(state, encodePropKey(op.node as string, op.key as string));
  }
  accumulate(diff: PatchDiff, state: WarpStateV5, op: OpLike, before: SnapshotBeforeOp): void {
    OpStrategy._accumulatePropDiff(diff, state, op.node as string, op.key as string, before);
  }
}

class EdgePropSetStrategy extends OpStrategy {
  readonly receiptName = 'EdgePropSet';
  validate(op: OpLikeRecord): void {
    OpValidator.assertString(op, 'from');
    OpValidator.assertString(op, 'to');
    OpValidator.assertString(op, 'label');
    OpValidator.assertString(op, 'key');
  }
  mutate(state: WarpStateV5, op: OpLike, eventId: EventId): void {
    OpStrategy._mutateProp(
      state,
      encodeEdgePropKey(op.from as string, op.to as string, op.label as string, op.key as string),
      eventId,
      op.value,
    );
  }
  outcome(state: WarpStateV5, op: OpLike, eventId: EventId): OpOutcomeResult {
    return ReceiptBuilder.edgePropSetOutcome(
      state.prop,
      { from: op.from as string, to: op.to as string, label: op.label as string, key: op.key as string },
      eventId,
    );
  }
  snapshot(state: WarpStateV5, op: OpLike): SnapshotBeforeOp {
    return OpStrategy._snapshotProp(
      state,
      encodeEdgePropKey(op.from as string, op.to as string, op.label as string, op.key as string),
    );
  }
  accumulate(diff: PatchDiff, state: WarpStateV5, op: OpLike, before: SnapshotBeforeOp): void {
    OpStrategy._accumulatePropDiff(
      diff,
      state,
      encodeEdgeKey(op.from as string, op.to as string, op.label as string),
      op.key as string,
      before,
    );
  }
}

class PropSetStrategy extends OpStrategy {
  readonly receiptName = 'PropSet';
  validate(op: OpLikeRecord): void {
    OpValidator.assertString(op, 'node');
    OpValidator.assertString(op, 'key');
  }
  mutate(state: WarpStateV5, op: OpLike, eventId: EventId): void {
    // Legacy raw PropSet — must NOT carry edge-property encoding at this point.
    if (typeof op.node === 'string' && op.node[0] === EDGE_PROP_PREFIX) {
      throw new PatchError(
        'Unnormalized legacy edge-property PropSet reached canonical apply path. ' +
        'Call normalizeRawOp() at the decode boundary.',
        { context: { opType: 'PropSet', node: op.node } },
      );
    }
    OpStrategy._mutateProp(state, encodePropKey(op.node as string, op.key as string), eventId, op.value);
  }
  outcome(state: WarpStateV5, op: OpLike, eventId: EventId): OpOutcomeResult {
    return ReceiptBuilder.propSetOutcome(state.prop, { node: op.node as string, key: op.key as string }, eventId);
  }
  snapshot(state: WarpStateV5, op: OpLike): SnapshotBeforeOp {
    return OpStrategy._snapshotProp(state, encodePropKey(op.node as string, op.key as string));
  }
  accumulate(diff: PatchDiff, state: WarpStateV5, op: OpLike, before: SnapshotBeforeOp): void {
    OpStrategy._accumulatePropDiff(diff, state, op.node as string, op.key as string, before);
  }
}

class BlobValueStrategy extends OpStrategy {
  readonly receiptName = 'BlobValue';
  validate(_op: OpLikeRecord): void { /* forward-compat: no structural check */ }
  mutate(_state: WarpStateV5, _op: OpLike): void { /* BlobValue has no state effect */ }
  outcome(_state: WarpStateV5, op: OpLike): OpOutcomeResult {
    const blobOid = op.oid;
    const blobTarget = (typeof blobOid === 'string' && blobOid.length > 0) ? blobOid : '*';
    return new OpApplied(blobTarget);
  }
  snapshot(_state: WarpStateV5, _op: OpLike): SnapshotBeforeOp { return {}; }
  accumulate(_diff: PatchDiff, _state: WarpStateV5, _op: OpLike, _before: SnapshotBeforeOp): void { /* no-op */ }
}

/**
 * Frozen registry mapping canonical op types to their strategy instances.
 * Adding a new op type means creating a new `OpStrategy` subclass and
 * registering it here.
 */
export const OP_STRATEGIES: ReadonlyMap<string, OpStrategy> = Object.freeze(new Map<string, OpStrategy>([
  ['NodeAdd', new NodeAddStrategy()],
  ['NodeRemove', new NodeRemoveStrategy()],
  ['EdgeAdd', new EdgeAddStrategy()],
  ['EdgeRemove', new EdgeRemoveStrategy()],
  ['NodePropSet', new NodePropSetStrategy()],
  ['EdgePropSet', new EdgePropSetStrategy()],
  ['PropSet', new PropSetStrategy()],
  ['BlobValue', new BlobValueStrategy()],
]));

// Load-time validation: every strategy must declare a valid receiptName
// that matches a TickReceipt OP_TYPES entry.
for (const [type, strategy] of OP_STRATEGIES) {
  if (!OP_TYPES.includes(strategy.receiptName)) {
    throw new PatchError(
      `OpStrategy '${type}' receiptName '${strategy.receiptName}' is not in TickReceipt OP_TYPES`,
      { context: { opType: type, receiptName: strategy.receiptName } },
    );
  }
}
