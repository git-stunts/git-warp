import EntityOccurrence, {
  type EntityOccurrenceFields,
  type EntityOccurrenceReceiptBinding,
} from './EntityOccurrence.ts';

/** Issues an occurrence without retaining ambient runtime state. */
export function createEntityOccurrence(fields: EntityOccurrenceFields): EntityOccurrence {
  return EntityOccurrence.issue(fields);
}

/** Requires the causal coordinate owned by a substrate-issued occurrence. */
export function requireIssuedEntityOccurrence(
  occurrence: EntityOccurrence,
  receipt: EntityOccurrenceReceiptBinding,
): EntityOccurrence {
  return EntityOccurrence.requireReceiptBinding(occurrence, receipt);
}
