import QueryError from '../../errors/QueryError.ts';
import { EventId } from '../../utils/EventId.ts';
import { isPropValue, type PropValue } from '../../types/PropValue.ts';
import type { CheckpointFactEventTransport } from './CheckpointBasisFactTypes.ts';

export function eventTransport(eventId: EventId): CheckpointFactEventTransport {
  return {
    lamport: eventId.lamport,
    writerId: eventId.writerId,
    patchSha: eventId.patchSha,
    opIndex: eventId.opIndex,
  };
}

export function eventSortKey(eventId: EventId): string {
  return [
    String(eventId.lamport).padStart(12, '0'),
    eventId.writerId,
    eventId.patchSha,
    String(eventId.opIndex).padStart(8, '0'),
  ].join(':');
}

export function validateDirection(direction: string): 'outgoing' | 'incoming' {
  if (direction !== 'outgoing' && direction !== 'incoming') {
    throwFactError('direction', 'invalid-direction');
  }
  return direction;
}

export function validatePropValue(value: PropValue): PropValue {
  if (!isPropValue(value)) {
    throwFactError('value', 'invalid-property-value');
  }
  return value;
}

export function validateEventId(eventId: EventId): EventId {
  if (!(eventId instanceof EventId)) {
    throwFactError('eventId', 'invalid-event-id');
  }
  return eventId;
}

export function validateText(value: string, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throwFactError(field, 'empty-string');
  }
  return value;
}

export function validatePositiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throwFactError(field, 'invalid-positive-integer');
  }
  return value;
}

function throwFactError(field: string, reason: string): never {
  throw new QueryError('Checkpoint basis fact is invalid.', {
    code: 'E_CHECKPOINT_BASIS_FACT',
    context: { field, reason },
  });
}
