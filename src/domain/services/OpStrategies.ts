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
import { compareEventIds, type EventId } from '../utils/EventId.ts';
import {
  encodeEdgeKey,
  encodePropKey,
  encodeEdgePropKey,
  EDGE_PROP_PREFIX,
} from './KeyCodec.js';
import { OP_TYPES } from '../types/TickReceipt.ts';
import PatchError from '../errors/PatchError.ts';
import WarpState from './state/WarpState.ts';
import type { PatchDiff } from '../types/PatchDiff.ts';
import OpApplied from '../types/ops/OpApplied.ts';
import type OpOutcomeResult from '../types/ops/OpOutcomeResult.ts';
import OpValidator from './OpValidator.ts';
import DiffCalculator from './DiffCalculator.ts';
import type { OpLike } from './OpLike.ts';
import OpStrategy from './OpStrategy.ts';
import ReceiptBuilder from './ReceiptBuilder.ts';
import type { SnapshotBeforeOp } from './SnapshotBeforeOp.ts';

/**
 * Concrete strategies — one per canonical op type.
 *
 * `OpLike`, `SnapshotBeforeOp`, and the abstract `OpStrategy` base
 * live in their own files; this module keeps only the concrete
 * strategy set and the registry used for reducer dispatch.
 */

// ===================================================================
// Concrete strategies — one per canonical op type
// ===================================================================

class NodeAddStrategy extends OpStrategy {
  readonly receiptName = 'NodeAdd';
  validate(op: OpLike): void { OpValidator.assertString(op, 'node'); OpValidator.assertDot(op); }
  mutate(state: WarpState, op: OpLike): void {
    state.nodeAlive.add(op.node as string, op.dot as Dot);
  }
  outcome(state: WarpState, op: OpLike): OpOutcomeResult {
    return ReceiptBuilder.nodeAddOutcome(state.nodeAlive, { node: op.node as string, dot: op.dot as Dot });
  }
  snapshot(state: WarpState, op: OpLike): SnapshotBeforeOp {
    return { nodeWasAlive: state.nodeAlive.contains(op.node as string) };
  }
  accumulate(diff: PatchDiff, state: WarpState, op: OpLike, before: SnapshotBeforeOp): void {
    if (before.nodeWasAlive !== true && state.nodeAlive.contains(op.node as string)) {
      diff.nodesAdded.push(op.node as string);
    }
  }
}

class NodeRemoveStrategy extends OpStrategy {
  readonly receiptName = 'NodeTombstone';
  validate(op: OpLike): void { OpValidator.assertIterable(op, 'observedDots'); }
  mutate(state: WarpState, op: OpLike): void {
    const dots = op.observedDots as Iterable<string>;
    state.nodeAlive.remove(dots instanceof Set ? dots : new Set(dots));
  }
  outcome(state: WarpState, op: OpLike): OpOutcomeResult {
    const outcomeOp: { node?: string; observedDots: Iterable<string> } = {
      observedDots: op.observedDots as Iterable<string>,
    };
    if (typeof op.node === 'string') {
      outcomeOp.node = op.node;
    }
    return ReceiptBuilder.nodeRemoveOutcome(state.nodeAlive, outcomeOp);
  }
  snapshot(state: WarpState, op: OpLike): SnapshotBeforeOp {
    const rawDots = op.observedDots as Iterable<string>;
    const nodeDots = rawDots instanceof Set ? rawDots : new Set(rawDots);
    return { aliveBeforeNodes: DiffCalculator.aliveElementsForDots(state.nodeAlive, nodeDots) };
  }
  accumulate(diff: PatchDiff, state: WarpState, _op: OpLike, before: SnapshotBeforeOp): void {
    DiffCalculator.collectNodeRemovals(diff, state, before.aliveBeforeNodes);
  }
}

class EdgeAddStrategy extends OpStrategy {
  readonly receiptName = 'EdgeAdd';
  validate(op: OpLike): void {
    OpValidator.assertString(op, 'from');
    OpValidator.assertString(op, 'to');
    OpValidator.assertString(op, 'label');
    OpValidator.assertDot(op);
  }
  mutate(state: WarpState, op: OpLike, eventId: EventId): void {
    const edgeKey = encodeEdgeKey(op.from as string, op.to as string, op.label as string);
    state.edgeAlive.add(edgeKey, op.dot as Dot);
    const prev = state.edgeBirthEvent.get(edgeKey);
    if (prev === undefined || compareEventIds(eventId, prev) > 0) {
      state.edgeBirthEvent.set(edgeKey, eventId);
    }
  }
  outcome(state: WarpState, op: OpLike): OpOutcomeResult {
    const edgeKey = encodeEdgeKey(op.from as string, op.to as string, op.label as string);
    return ReceiptBuilder.edgeAddOutcome(state.edgeAlive, { dot: op.dot as Dot }, edgeKey);
  }
  snapshot(state: WarpState, op: OpLike): SnapshotBeforeOp {
    const ek = encodeEdgeKey(op.from as string, op.to as string, op.label as string);
    return { edgeWasAlive: state.edgeAlive.contains(ek), edgeKey: ek };
  }
  accumulate(diff: PatchDiff, state: WarpState, op: OpLike, before: SnapshotBeforeOp): void {
    if (before.edgeWasAlive !== true && before.edgeKey !== undefined && state.edgeAlive.contains(before.edgeKey)) {
      diff.edgesAdded.push({ from: op.from as string, to: op.to as string, label: op.label as string });
    }
  }
}

class EdgeRemoveStrategy extends OpStrategy {
  readonly receiptName = 'EdgeTombstone';
  validate(op: OpLike): void { OpValidator.assertIterable(op, 'observedDots'); }
  mutate(state: WarpState, op: OpLike): void {
    const dots = op.observedDots as Iterable<string>;
    state.edgeAlive.remove(dots instanceof Set ? dots : new Set(dots));
  }
  outcome(state: WarpState, op: OpLike): OpOutcomeResult {
    const outcomeOp: {
      from?: string;
      to?: string;
      label?: string;
      observedDots: Iterable<string>;
    } = {
      observedDots: op.observedDots as Iterable<string>,
    };
    if (typeof op.from === 'string') {
      outcomeOp.from = op.from;
    }
    if (typeof op.to === 'string') {
      outcomeOp.to = op.to;
    }
    if (typeof op.label === 'string') {
      outcomeOp.label = op.label;
    }
    return ReceiptBuilder.edgeRemoveOutcome(state.edgeAlive, outcomeOp);
  }
  snapshot(state: WarpState, op: OpLike): SnapshotBeforeOp {
    const rawEdgeDots = op.observedDots as Iterable<string>;
    const edgeDots = rawEdgeDots instanceof Set ? rawEdgeDots : new Set(rawEdgeDots);
    return { aliveBeforeEdges: DiffCalculator.aliveElementsForDots(state.edgeAlive, edgeDots) };
  }
  accumulate(diff: PatchDiff, state: WarpState, _op: OpLike, before: SnapshotBeforeOp): void {
    DiffCalculator.collectEdgeRemovals(diff, state, before.aliveBeforeEdges);
  }
}

class NodePropSetStrategy extends OpStrategy {
  readonly receiptName = 'NodePropSet';
  validate(op: OpLike): void {
    OpValidator.assertString(op, 'node');
    OpValidator.assertString(op, 'key');
  }
  mutate(state: WarpState, op: OpLike, eventId: EventId): void {
    OpStrategy._mutateProp(state, {
      propKey: encodePropKey(op.node as string, op.key as string),
      eventId,
      value: op.value,
    });
  }
  outcome(state: WarpState, op: OpLike, eventId: EventId): OpOutcomeResult {
    return ReceiptBuilder.propSetOutcome(state.prop, { node: op.node as string, key: op.key as string }, eventId);
  }
  snapshot(state: WarpState, op: OpLike): SnapshotBeforeOp {
    return OpStrategy._snapshotProp(state, encodePropKey(op.node as string, op.key as string));
  }
  accumulate(diff: PatchDiff, state: WarpState, op: OpLike, before: SnapshotBeforeOp): void {
    OpStrategy._accumulatePropDiff(diff, state, {
      nodeId: op.node as string,
      key: op.key as string,
      before,
    });
  }
}

class EdgePropSetStrategy extends OpStrategy {
  readonly receiptName = 'EdgePropSet';
  validate(op: OpLike): void {
    OpValidator.assertString(op, 'from');
    OpValidator.assertString(op, 'to');
    OpValidator.assertString(op, 'label');
    OpValidator.assertString(op, 'key');
  }
  mutate(state: WarpState, op: OpLike, eventId: EventId): void {
    OpStrategy._mutateProp(
      state,
      {
        propKey: encodeEdgePropKey(op.from as string, op.to as string, op.label as string, op.key as string),
        eventId,
        value: op.value,
      },
    );
  }
  outcome(state: WarpState, op: OpLike, eventId: EventId): OpOutcomeResult {
    return ReceiptBuilder.edgePropSetOutcome(
      state.prop,
      { from: op.from as string, to: op.to as string, label: op.label as string, key: op.key as string },
      eventId,
    );
  }
  snapshot(state: WarpState, op: OpLike): SnapshotBeforeOp {
    return OpStrategy._snapshotProp(
      state,
      encodeEdgePropKey(op.from as string, op.to as string, op.label as string, op.key as string),
    );
  }
  accumulate(diff: PatchDiff, state: WarpState, op: OpLike, before: SnapshotBeforeOp): void {
    OpStrategy._accumulatePropDiff(
      diff,
      state,
      {
        nodeId: encodeEdgeKey(op.from as string, op.to as string, op.label as string),
        key: op.key as string,
        before,
      },
    );
  }
}

class PropSetStrategy extends OpStrategy {
  readonly receiptName = 'PropSet';
  validate(op: OpLike): void {
    OpValidator.assertString(op, 'node');
    OpValidator.assertString(op, 'key');
  }
  mutate(state: WarpState, op: OpLike, eventId: EventId): void {
    // Legacy raw PropSet — must NOT carry edge-property encoding at this point.
    if (typeof op.node === 'string' && op.node[0] === EDGE_PROP_PREFIX) {
      throw new PatchError(
        'Unnormalized legacy edge-property PropSet reached canonical apply path. ' +
        'Call normalizeRawOp() at the decode boundary.',
        { context: { opType: 'PropSet', node: op.node } },
      );
    }
    OpStrategy._mutateProp(state, {
      propKey: encodePropKey(op.node as string, op.key as string),
      eventId,
      value: op.value,
    });
  }
  outcome(state: WarpState, op: OpLike, eventId: EventId): OpOutcomeResult {
    return ReceiptBuilder.propSetOutcome(state.prop, { node: op.node as string, key: op.key as string }, eventId);
  }
  snapshot(state: WarpState, op: OpLike): SnapshotBeforeOp {
    return OpStrategy._snapshotProp(state, encodePropKey(op.node as string, op.key as string));
  }
  accumulate(diff: PatchDiff, state: WarpState, op: OpLike, before: SnapshotBeforeOp): void {
    OpStrategy._accumulatePropDiff(diff, state, {
      nodeId: op.node as string,
      key: op.key as string,
      before,
    });
  }
}

class BlobValueStrategy extends OpStrategy {
  readonly receiptName = 'BlobValue';
  validate(_op: OpLike): void { /* forward-compat: no structural check */ }
  mutate(_state: WarpState, _op: OpLike): void { /* BlobValue has no state effect */ }
  outcome(_state: WarpState, op: OpLike): OpOutcomeResult {
    const blobOid = op.oid;
    const blobTarget = (typeof blobOid === 'string' && blobOid.length > 0) ? blobOid : '*';
    return new OpApplied(blobTarget);
  }
  snapshot(_state: WarpState, _op: OpLike): SnapshotBeforeOp { return {}; }
  accumulate(_diff: PatchDiff, _state: WarpState, _op: OpLike, _before: SnapshotBeforeOp): void { /* no-op */ }
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
