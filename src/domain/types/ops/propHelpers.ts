/**
 * Shared property mutation, snapshot, and diff helpers used by
 * NodePropSet, EdgePropSet, and PropSet op classes.
 *
 * @module domain/types/ops/propHelpers
 */

import { lwwSet, lwwMax } from '../../crdt/LWW.ts';
import type { EventId } from '../../utils/EventId.ts';
import type WarpState from '../../services/state/WarpState.ts';
import type { PatchDiff } from '../PatchDiff.ts';
import type { SnapshotBeforeOp } from './SnapshotBeforeOp.ts';
import type { PropValue } from '../PropValue.ts';

/** LWW property mutation — sets or updates a prop register. */
export function mutateProp(
  state: WarpState,
  propKey: string,
  eventId: EventId,
  value: unknown,
): void {
  const current = state.prop.get(propKey);
  const winner = lwwMax(current, lwwSet(eventId, value as PropValue));
  if (winner !== null) {
    state.prop.set(propKey, winner);
  }
}

/** Pre-op snapshot for a property register. */
export function snapshotProp(state: WarpState, propKey: string): SnapshotBeforeOp {
  const reg = state.prop.get(propKey);
  return { prevPropValue: reg !== undefined ? reg.value : undefined, propKey };
}

/** Post-op diff accumulation for a property register. */
export function accumulatePropDiff(
  diff: PatchDiff,
  state: WarpState,
  nodeId: string,
  key: string,
  before: SnapshotBeforeOp,
): void {
  const reg = before.propKey !== undefined ? state.prop.get(before.propKey) : undefined;
  const newVal = reg !== undefined ? reg.value : undefined;
  if (newVal !== before.prevPropValue) {
    diff.propsChanged.push({
      nodeId,
      key,
      value: newVal,
      prevValue: before.prevPropValue,
    });
  }
}
