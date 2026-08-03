import WarpError from '../errors/WarpError.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';

export type EntityCausalRelation = 'same' | 'before' | 'after' | 'concurrent';

type EntityOccurrenceOptions = {
  readonly compare: (other: EntityOccurrence) => number;
  readonly id: string;
  readonly relationTo: (other: EntityOccurrence) => EntityCausalRelation;
  readonly subject: string;
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
  readonly #compare: (other: EntityOccurrence) => number;
  readonly #relationTo: (other: EntityOccurrence) => EntityCausalRelation;
  readonly id: string;
  readonly subject: string;

  constructor(options: EntityOccurrenceOptions) {
    requireNonEmptyString(options?.id, 'entityOccurrence.id');
    requireNonEmptyString(options?.subject, 'entityOccurrence.subject');
    if (typeof options.compare !== 'function' || typeof options.relationTo !== 'function') {
      throw new WarpError(
        'EntityOccurrence requires substrate coordinate operations',
        'E_ENTITY_OCCURRENCE_COORDINATE'
      );
    }
    this.id = options.id;
    this.subject = options.subject;
    this.#compare = options.compare;
    this.#relationTo = options.relationTo;
    Object.freeze(this);
  }

  /** Canonical deterministic order; this does not claim causality. */
  compare(other: EntityOccurrence): number {
    requireOccurrence(other);
    return this.#compare(other);
  }

  /** Causal partial-order relation backed by substrate vector context. */
  relationTo(other: EntityOccurrence): EntityCausalRelation {
    requireOccurrence(other);
    return this.#relationTo(other);
  }
}

function requireOccurrence(value: EntityOccurrence): void {
  if (!(value instanceof EntityOccurrence)) {
    throw new WarpError(
      'Entity occurrence comparison requires an EntityOccurrence',
      'E_ENTITY_OCCURRENCE_TYPE'
    );
  }
}
