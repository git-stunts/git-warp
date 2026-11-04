/**
 * Structural equality for cone record parts.
 *
 * A fold rewrites only records it changed. Every register and lifecycle
 * event is identified by its EventId, which is unique per operation, so two
 * registers with the same EventId carry the same value and comparing
 * EventIds is enough to detect a change.
 *
 * @module domain/services/cone/ConeRecordEquality
 */

import type { LWWRegister } from '../../crdt/LWW.ts';
import type { PropValue } from '../../types/PropValue.ts';
import { compareEventIds, type EventId } from '../../utils/EventId.ts';

/** True when both events are absent or both name the same operation. */
export function sameEvent(left: EventId | null, right: EventId | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return compareEventIds(left, right) === 0;
}

/** True when both sets hold the same members. */
export function sameMembers(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((member) => right.has(member));
}

/** True when both register maps hold the same keys written by the same operations. */
export function sameRegisters(
  left: ReadonlyMap<string, LWWRegister<PropValue>>,
  right: ReadonlyMap<string, LWWRegister<PropValue>>,
): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const [key, register] of left) {
    const other = right.get(key);
    if (other === undefined || compareEventIds(register.eventId, other.eventId) !== 0) {
      return false;
    }
  }
  return true;
}
