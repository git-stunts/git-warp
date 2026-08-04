import VersionVector from '../crdt/VersionVector.ts';
import WarpError from '../errors/WarpError.ts';
import { hexEncode, textEncode } from '../utils/bytes.ts';
import { canonicalStringify } from '../utils/canonicalStringify.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';
import type Evidence from './Evidence.ts';
import Intent from './Intent.ts';

export type EntityCausalRelation = 'same' | 'before' | 'after' | 'concurrent';

type EntityOccurrenceReceiptBinding = {
  readonly evidence: Evidence;
  readonly intent: Intent;
  readonly lane: string;
  readonly writer: string;
};

type EntityOccurrenceFields = {
  readonly context: Readonly<Record<string, number>>;
  readonly dot: readonly [string, number];
  readonly evidence: Evidence;
  readonly eventOrder: readonly [number, string, string, number];
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
  readonly #dot: readonly [string, number];
  readonly #eventOrder: readonly [number, string, string, number];
  readonly #evidence: Evidence;
  readonly #intent: Intent;
  readonly #receiptWriter: string;
  readonly #worldline: string;
  readonly id: string;
  readonly subject: string;

  private constructor(fields: EntityOccurrenceFields) {
    requireCoordinateFields(fields);
    this.#context = VersionVector.from(fields.context);
    this.#dot = freezeDot(fields.dot);
    this.#eventOrder = freezeEventOrder(fields.eventOrder);
    this.#evidence = fields.evidence;
    this.#intent = fields.intent;
    this.#receiptWriter = fields.receiptWriter;
    this.#worldline = fields.worldline;
    this.id = entityOccurrenceId(fields.worldline, fields.eventOrder);
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
    return compareEventOrder(this.#eventOrder, right.#eventOrder);
  }

  /** Causal partial-order relation backed by substrate vector context. */
  relationTo(other: EntityOccurrence): EntityCausalRelation {
    const right = EntityOccurrence.#requireIssued(other);
    if (this.#worldline !== right.#worldline) {
      return 'concurrent';
    }
    if (dotsEqual(this.#dot, right.#dot)) {
      return 'same';
    }
    return distinctRelation(
      containsDot(this.#context, right.#dot),
      containsDot(right.#context, this.#dot)
    );
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
  requireOccurrenceIntent(fields.intent, fields.subject);
  if (fields.dot[0] !== fields.eventOrder[1]) {
    throw new WarpError(
      'EntityOccurrence Dot and EventId require the same writer',
      'E_ENTITY_OCCURRENCE_WRITER'
    );
  }
  requireNonEmptyString(fields.receiptWriter, 'entityOccurrence.receiptWriter');
  requireNonEmptyString(fields.worldline, 'entityOccurrence.worldline');
}

function freezeDot(dot: readonly [string, number]): readonly [string, number] {
  const copy: [string, number] = [dot[0], dot[1]];
  return Object.freeze(copy);
}

function freezeEventOrder(
  eventOrder: readonly [number, string, string, number]
): readonly [number, string, string, number] {
  const copy: [number, string, string, number] = [
    eventOrder[0],
    eventOrder[1],
    eventOrder[2],
    eventOrder[3],
  ];
  return Object.freeze(copy);
}

function dotsEqual(left: readonly [string, number], right: readonly [string, number]): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

function containsDot(context: VersionVector, dot: readonly [string, number]): boolean {
  return dot[1] <= (context.get(dot[0]) ?? 0);
}

function compareEventOrder(
  left: readonly [number, string, string, number],
  right: readonly [number, string, string, number]
): number {
  const comparisons = [
    compareNumber(left[0], right[0]),
    compareString(left[1], right[1]),
    compareString(left[2], right[2]),
    compareNumber(left[3], right[3]),
  ];
  return comparisons.find((comparison) => comparison !== 0) ?? 0;
}

function compareNumber(left: number, right: number): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

function compareString(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
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
function entityOccurrenceId(
  worldline: string,
  eventOrder: readonly [number, string, string, number]
): string {
  return `occurrence:${hexEncode(textEncode(canonicalStringify([worldline, ...eventOrder])))}`;
}
