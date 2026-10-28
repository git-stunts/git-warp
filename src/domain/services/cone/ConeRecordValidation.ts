/**
 * Constructor validation shared by cone record classes.
 *
 * Records are built by the fold from reducer state and by the store adapter
 * from decoded transport values; both paths must establish the same
 * invariants, so the checks live here once.
 *
 * @module domain/services/cone/ConeRecordValidation
 */

import { Dot } from '../../crdt/Dot.ts';
import { LWWRegister } from '../../crdt/LWW.ts';
import ConeRecordError from '../../errors/ConeRecordError.ts';
import type { PropValue } from '../../types/PropValue.ts';
import { EventId } from '../../utils/EventId.ts';

/** Requires a non-empty identity string. */
export function requireIdentity(value: string, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ConeRecordError(`Cone record ${field} must be a non-empty string`, { context: { field } });
  }
  return value;
}

/** Requires a non-negative safe integer. */
export function requireCount(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ConeRecordError(`Cone record ${field} must be a non-negative safe integer`, { context: { field } });
  }
  return value;
}

/** Copies a set of encoded dots, requiring every member to decode. */
export function requireDots(dots: ReadonlySet<string>, field: string): ReadonlySet<string> {
  if (!(dots instanceof Set)) {
    throw new ConeRecordError(`Cone record ${field} must be a Set of encoded dots`, { context: { field } });
  }
  for (const dot of dots) {
    Dot.decode(dot);
  }
  return Object.freeze(new Set(dots));
}

/** Copies a set of identities, requiring every member to be non-empty. */
export function requireIdentities(members: ReadonlySet<string>, field: string): ReadonlySet<string> {
  if (!(members instanceof Set)) {
    throw new ConeRecordError(`Cone record ${field} must be a Set`, { context: { field } });
  }
  for (const member of members) {
    requireIdentity(member, field);
  }
  return Object.freeze(new Set(members));
}

/** Requires an admitted EventId or null. */
export function requireEventOrNull(event: EventId | null, field: string): EventId | null {
  if (event !== null && !(event instanceof EventId)) {
    throw new ConeRecordError(`Cone record ${field} must be an EventId or null`, { context: { field } });
  }
  return event;
}

/** Copies a property register map whose registers carry admitted EventIds. */
export function requireRegisters(
  registers: ReadonlyMap<string, LWWRegister<PropValue>>,
): ReadonlyMap<string, LWWRegister<PropValue>> {
  if (!(registers instanceof Map)) {
    throw new ConeRecordError('Cone record props must be a Map of registers');
  }
  for (const [key, register] of registers) {
    requireIdentity(key, 'property key');
    if (!(register instanceof LWWRegister) || !(register.eventId instanceof EventId)) {
      throw new ConeRecordError('Cone record property registers must carry an EventId', { context: { key } });
    }
  }
  return Object.freeze(new Map(registers));
}
