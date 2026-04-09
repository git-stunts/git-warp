import { lwwSet, lwwMax } from '../crdt/LWW.ts';
import type { PatchDiff } from '../types/PatchDiff.ts';
import type OpOutcomeResult from '../types/ops/OpOutcomeResult.ts';
import type { EventId } from '../utils/EventId.ts';
import type { OpLike } from './OpLike.ts';
import type { SnapshotBeforeOp } from './SnapshotBeforeOp.ts';
import WarpState from './state/WarpState.ts';

/**
 * Abstract base for per-op-type dispatch strategies.
 *
 * Subclasses override the five methods below. The registry
 * `OP_STRATEGIES` pins one instance per canonical op type.
 */
export default abstract class OpStrategy {
  /** TickReceipt-compatible op type string (e.g. `NodeTombstone` for NodeRemove). */
  abstract readonly receiptName: string;

  /** Structural field-shape checks. Throws `PatchError` on failure. */
  abstract validate(op: OpLike): void;

  /** CRDT mutation. Mutates `state` in place. */
  abstract mutate(state: WarpState, op: OpLike, eventId: EventId): void;

  /** Pre-mutation receipt outcome. Reads state; does not mutate. */
  abstract outcome(state: WarpState, op: OpLike, eventId: EventId): OpOutcomeResult;

  /** Pre-mutation snapshot used by the diff path. Reads state; does not mutate. */
  abstract snapshot(state: WarpState, op: OpLike): SnapshotBeforeOp;

  /** Post-mutation diff accumulation. Mutates `diff` in place. */
  abstract accumulate(
    diff: PatchDiff,
    state: WarpState,
    op: OpLike,
    before: SnapshotBeforeOp,
  ): void;

  /** Shared mutate logic for NodePropSet / EdgePropSet / legacy PropSet. */
  protected static _mutateProp(
    state: WarpState,
    mutation: {
      readonly propKey: string;
      readonly eventId: EventId;
      readonly value: unknown;
    },
  ): void {
    const current = state.prop.get(mutation.propKey);
    const winner = lwwMax(current, lwwSet(mutation.eventId, mutation.value));
    if (winner !== null) {
      state.prop.set(mutation.propKey, winner);
    }
  }

  /** Shared pre-op snapshot for property strategies. */
  protected static _snapshotProp(state: WarpState, propKey: string): SnapshotBeforeOp {
    const reg = state.prop.get(propKey);
    return { prevPropValue: reg !== undefined ? reg.value : undefined, propKey };
  }

  /** Shared diff accumulator for property strategies. */
  protected static _accumulatePropDiff(
    diff: PatchDiff,
    state: WarpState,
    change: {
      readonly nodeId: string;
      readonly key: string;
      readonly before: SnapshotBeforeOp;
    },
  ): void {
    const reg = change.before.propKey !== undefined ? state.prop.get(change.before.propKey) : undefined;
    const newVal = reg !== undefined ? reg.value : undefined;
    if (newVal !== change.before.prevPropValue) {
      diff.propsChanged.push({
        nodeId: change.nodeId,
        key: change.key,
        value: newVal,
        prevValue: change.before.prevPropValue,
      });
    }
  }
}
