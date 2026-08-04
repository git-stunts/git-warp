import { Dot } from '../crdt/Dot.ts';
import VersionVector from '../crdt/VersionVector.ts';
import WarpError from '../errors/WarpError.ts';
import { hexEncode, textEncode } from '../utils/bytes.ts';
import { canonicalStringify } from '../utils/canonicalStringify.ts';
import { compareEventIds, EventId } from '../utils/EventId.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';
import type Evidence from './Evidence.ts';
import Intent from './Intent.ts';

export type EntityCausalRelation = 'same' | 'before' | 'after' | 'concurrent';

export type EntityOccurrenceReceiptBinding = {
  readonly evidence: Evidence;
  readonly intent: Intent;
  readonly lane: string;
  readonly writer: string;
};

export type EntityOccurrenceFields = {
  readonly context: VersionVector | Readonly<Record<string, number>>;
  readonly dot: Dot;
  readonly evidence: Evidence;
  readonly eventId: EventId;
  readonly intent: Intent;
  readonly receiptWriter: string;
  readonly subject: string;
  readonly worldline: string;
};

/**
 * One admitted entity creation and its opaque substrate coordinate.
 *
 * `id` is occurrence identity, `relationTo` answers causal questions within a
 * worldline, and `compare` supplies git-warp's deterministic worldline/event
 * linearization. Independent worldlines are concurrent. None of those meanings
 * come from the entity subject or application timestamps.
 */
export default class EntityOccurrence {
  readonly #context: VersionVector;
  readonly #dot: Dot;
  readonly #eventId: EventId;
  readonly #evidence: Evidence;
  readonly #intent: Intent;
  readonly #receiptWriter: string;
  readonly #worldline: string;
  readonly id: string;
  readonly subject: string;

  private constructor(fields: EntityOccurrenceFields) {
    requireCoordinateFields(fields);
    this.#context = VersionVector.from(fields.context);
    this.#dot = fields.dot;
    this.#eventId = fields.eventId;
    this.#evidence = fields.evidence;
    this.#intent = fields.intent;
    this.#receiptWriter = fields.receiptWriter;
    this.#worldline = fields.worldline;
    this.id = entityOccurrenceId(fields.worldline, fields.eventId);
    this.subject = fields.subject;
    Object.freeze(this);
  }

  /** Issues an occurrence from a substrate-owned causal coordinate. */
  static issue(fields: EntityOccurrenceFields): EntityOccurrence {
    return new EntityOccurrence(fields);
  }

  /** Requires an occurrence to carry the exact binding used by its receipt. */
  static requireReceiptBinding(
    occurrence: EntityOccurrence,
    receipt: EntityOccurrenceReceiptBinding
  ): EntityOccurrence {
    const issued = EntityOccurrence.#requireIssued(occurrence);
    requireReceiptBinding(issued.#evidence === receipt.evidence);
    requireReceiptBinding(issued.#intent === receipt.intent);
    requireReceiptBinding(issued.#worldline === receipt.lane);
    requireReceiptBinding(issued.#receiptWriter === receipt.writer);
    requireReceiptBinding(issued.subject === occurrence.subject);
    return issued;
  }

  /** Canonical deterministic order; this does not claim causality. */
  compare(other: EntityOccurrence): number {
    const right = EntityOccurrence.#requireIssued(other);
    if (this.#worldline !== right.#worldline) {
      return this.#worldline < right.#worldline ? -1 : 1;
    }
    return compareEventIds(this.#eventId, right.#eventId);
  }

  /** Causal partial-order relation backed by substrate vector context. */
  relationTo(other: EntityOccurrence): EntityCausalRelation {
    const right = EntityOccurrence.#requireIssued(other);
    if (this.#worldline !== right.#worldline) {
      return 'concurrent';
    }
    if (Dot.equals(this.#dot, right.#dot)) {
      return 'same';
    }
    return distinctRelation(this.#context.contains(right.#dot), right.#context.contains(this.#dot));
  }

  static #requireIssued(value: EntityOccurrence): EntityOccurrence {
    if (!(value instanceof EntityOccurrence)) {
      throw new WarpError(
        'Entity occurrence comparison requires an EntityOccurrence',
        'E_ENTITY_OCCURRENCE_TYPE'
      );
    }
    if (!(#context in value)) {
      throw new WarpError(
        'EntityOccurrence was not issued by the substrate',
        'E_ENTITY_OCCURRENCE_UNAVAILABLE'
      );
    }
    return value;
  }
}

function requireCoordinateFields(fields: EntityOccurrenceFields): void {
  if (!(fields.dot instanceof Dot)) {
    throw new WarpError('EntityOccurrence requires a Dot', 'E_ENTITY_OCCURRENCE_DOT');
  }
  if (!(fields.eventId instanceof EventId)) {
    throw new WarpError('EntityOccurrence requires an EventId', 'E_ENTITY_OCCURRENCE_EVENT');
  }
  requireOccurrenceIntent(fields.intent, fields.subject);
  if (fields.dot.writerId !== fields.eventId.writerId) {
    throw new WarpError(
      'EntityOccurrence Dot and EventId require the same writer',
      'E_ENTITY_OCCURRENCE_WRITER'
    );
  }
  requireNonEmptyString(fields.receiptWriter, 'entityOccurrence.receiptWriter');
  requireNonEmptyString(fields.worldline, 'entityOccurrence.worldline');
}

function requireOccurrenceIntent(intent: Intent, subject: string): void {
  if (!(intent instanceof Intent) || intent.kind !== 'entity.add') {
    throw new WarpError('EntityOccurrence requires an entity Intent', 'E_ENTITY_OCCURRENCE_INTENT');
  }
  const { descriptor } = intent;
  if ('subject' in descriptor && descriptor.subject !== subject) {
    throw new WarpError(
      'EntityOccurrence subject does not match its issued Intent',
      'E_ENTITY_OCCURRENCE_SUBJECT'
    );
  }
}

function requireReceiptBinding(matches: boolean): void {
  if (!matches) {
    throw new WarpError(
      'EntityOccurrence does not belong to this WriteReceipt',
      'E_ENTITY_OCCURRENCE_RECEIPT_MISMATCH'
    );
  }
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
function entityOccurrenceId(worldline: string, eventId: EventId): string {
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
