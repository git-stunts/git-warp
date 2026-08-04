import { Dot } from '../crdt/Dot.ts';
import VersionVector from '../crdt/VersionVector.ts';
import WarpError from '../errors/WarpError.ts';
import { EventId } from '../utils/EventId.ts';
import EntityOccurrence from './EntityOccurrence.ts';
import type Evidence from './Evidence.ts';
import type Intent from './Intent.ts';

type EntityOccurrenceReceiptBinding = {
  readonly evidence: Evidence;
  readonly intent: Intent;
  readonly lane: string;
  readonly writer: string;
};

type EntityOccurrenceFields = {
  readonly context: VersionVector | Readonly<Record<string, number>>;
  readonly dot: Dot;
  readonly evidence: Evidence;
  readonly eventId: EventId;
  readonly intent: Intent;
  readonly receiptWriter: string;
  readonly subject: string;
  readonly worldline: string;
};

/** Issues an occurrence without retaining ambient runtime state. */
export function createEntityOccurrence(fields: EntityOccurrenceFields): EntityOccurrence {
  requireCoordinateFields(fields);
  return EntityOccurrence.issue({
    context: VersionVector.serialize(VersionVector.from(fields.context)),
    dot: Object.freeze([fields.dot.writerId, fields.dot.counter]),
    evidence: fields.evidence,
    eventOrder: Object.freeze([
      fields.eventId.lamport,
      fields.eventId.writerId,
      fields.eventId.patchSha,
      fields.eventId.opIndex,
    ]),
    intent: fields.intent,
    receiptWriter: fields.receiptWriter,
    subject: fields.subject,
    worldline: fields.worldline,
  });
}

/** Requires the causal coordinate owned by a substrate-issued occurrence. */
export function requireIssuedEntityOccurrence(
  occurrence: EntityOccurrence,
  receipt: EntityOccurrenceReceiptBinding
): EntityOccurrence {
  return EntityOccurrence.requireReceiptBinding(occurrence, receipt);
}

function requireCoordinateFields(fields: EntityOccurrenceFields): void {
  if (!(fields.dot instanceof Dot)) {
    throw new WarpError('EntityOccurrence requires a Dot', 'E_ENTITY_OCCURRENCE_DOT');
  }
  if (!(fields.eventId instanceof EventId)) {
    throw new WarpError('EntityOccurrence requires an EventId', 'E_ENTITY_OCCURRENCE_EVENT');
  }
  if (fields.dot.writerId !== fields.eventId.writerId) {
    throw new WarpError(
      'EntityOccurrence Dot and EventId require the same writer',
      'E_ENTITY_OCCURRENCE_WRITER'
    );
  }
}
