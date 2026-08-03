import { Dot } from '../crdt/Dot.ts';
import VersionVector from '../crdt/VersionVector.ts';
import WarpError from '../errors/WarpError.ts';
import { hexEncode, textEncode } from '../utils/bytes.ts';
import { canonicalStringify } from '../utils/canonicalStringify.ts';
import { compareEventIds, EventId } from '../utils/EventId.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';
import EntityOccurrence, { type EntityCausalRelation } from './EntityOccurrence.ts';

type EntityOccurrenceCoordinate = {
  readonly context: VersionVector;
  readonly dot: Dot;
  readonly eventId: EventId;
  readonly worldline: string;
};

type EntityOccurrenceFields = {
  readonly context: VersionVector | Readonly<Record<string, number>>;
  readonly dot: Dot;
  readonly eventId: EventId;
  readonly subject: string;
  readonly worldline: string;
};

const COORDINATES = new WeakMap<EntityOccurrence, EntityOccurrenceCoordinate>();

export function createEntityOccurrence(fields: EntityOccurrenceFields): EntityOccurrence {
  const coordinate = normalizeCoordinate(fields);
  const occurrence = new EntityOccurrence({
    compare: (other) => compareCoordinates(coordinate, requireCoordinate(other)),
    id: entityOccurrenceId(coordinate),
    relationTo: (other) => relationBetween(coordinate, requireCoordinate(other)),
    subject: fields.subject,
  });
  COORDINATES.set(occurrence, coordinate);
  return occurrence;
}

/** Requires the opaque coordinate retained for a substrate-issued occurrence. */
export function requireIssuedEntityOccurrence(occurrence: EntityOccurrence): EntityOccurrence {
  requireCoordinate(occurrence);
  return occurrence;
}

function normalizeCoordinate(fields: EntityOccurrenceFields): EntityOccurrenceCoordinate {
  if (!(fields.dot instanceof Dot)) {
    throw new WarpError('EntityOccurrence requires a Dot', 'E_ENTITY_OCCURRENCE_DOT');
  }
  if (!(fields.eventId instanceof EventId)) {
    throw new WarpError('EntityOccurrence requires an EventId', 'E_ENTITY_OCCURRENCE_EVENT');
  }
  requireNonEmptyString(fields.worldline, 'entityOccurrence.worldline');
  return Object.freeze({
    context: VersionVector.from(fields.context as Record<string, number>),
    dot: fields.dot,
    eventId: fields.eventId,
    worldline: fields.worldline,
  });
}

function requireCoordinate(occurrence: EntityOccurrence): EntityOccurrenceCoordinate {
  const coordinate = COORDINATES.get(occurrence);
  if (coordinate === undefined) {
    throw new WarpError(
      'EntityOccurrence was not issued by the substrate',
      'E_ENTITY_OCCURRENCE_UNAVAILABLE'
    );
  }
  return coordinate;
}

function relationBetween(
  left: EntityOccurrenceCoordinate,
  right: EntityOccurrenceCoordinate
): EntityCausalRelation {
  if (left.worldline !== right.worldline) {
    return 'concurrent';
  }
  if (Dot.equals(left.dot, right.dot)) {
    return 'same';
  }
  return distinctRelation(left.context.contains(right.dot), right.context.contains(left.dot));
}

function compareCoordinates(
  left: EntityOccurrenceCoordinate,
  right: EntityOccurrenceCoordinate
): number {
  if (left.worldline !== right.worldline) {
    return left.worldline < right.worldline ? -1 : 1;
  }
  return compareEventIds(left.eventId, right.eventId);
}

function distinctRelation(
  leftObservedRight: boolean,
  rightObservedLeft: boolean
): Exclude<EntityCausalRelation, 'same'> {
  if (leftObservedRight && rightObservedLeft) {
    throw new WarpError(
      'Distinct entity occurrences cannot causally observe each other',
      'E_ENTITY_OCCURRENCE_CAUSAL_CYCLE'
    );
  }
  if (leftObservedRight) {
    return 'after';
  }
  return rightObservedLeft ? 'before' : 'concurrent';
}

/** Stable opaque encoding of git-warp's worldline-scoped event coordinate. */
function entityOccurrenceId(coordinate: EntityOccurrenceCoordinate): string {
  const { eventId, worldline } = coordinate;
  return `occurrence:${hexEncode(
    textEncode(
      canonicalStringify([
        worldline,
        eventId.lamport,
        eventId.writerId,
        eventId.patchSha,
        eventId.opIndex,
      ])
    )
  )}`;
}
