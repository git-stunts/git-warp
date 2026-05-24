import { compareStrings } from '../utils/StringComparison.ts';
import GenesisEquivalenceReadingFact from './GenesisEquivalenceReadingFact.ts';
import WarpError from '../errors/WarpError.ts';

export type GenesisEquivalenceReadingFields = {
  readonly readingId: string;
  readonly facts: readonly GenesisEquivalenceReadingFact[];
};

/** Runtime-backed observer-visible reading for genesis equivalence comparison. */
export default class GenesisEquivalenceReading {
  readonly readingId: string;
  readonly facts: readonly GenesisEquivalenceReadingFact[];

  constructor(fields: GenesisEquivalenceReadingFields) {
    const checkedFields = requireFields(fields);
    this.readingId = requireNonEmptyString(checkedFields.readingId, 'readingId');
    this.facts = freezeFacts(checkedFields.facts);
    Object.freeze(this);
  }
}

/** Validates the constructor envelope. */
function requireFields(
  fields: GenesisEquivalenceReadingFields | null | undefined,
): GenesisEquivalenceReadingFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GenesisEquivalenceReading fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

/** Validates and freezes visible facts in deterministic order. */
function freezeFacts(
  facts: readonly GenesisEquivalenceReadingFact[],
): readonly GenesisEquivalenceReadingFact[] {
  const checked = requireArray(facts, 'facts').map(requireFact);
  requireUniqueFactKeys(checked);
  return Object.freeze([...checked].sort(compareFacts));
}

/** Requires an array field. */
function requireArray<T>(items: readonly T[] | null | undefined, label: string): readonly T[] {
  if (items === null || items === undefined || !Array.isArray(items)) {
    throw new WarpError(`GenesisEquivalenceReading ${label} must be an array`, 'E_VALIDATION');
  }
  const checkedItems: readonly T[] = items;
  return checkedItems;
}

/** Requires a visible fact instance. */
function requireFact(fact: GenesisEquivalenceReadingFact): GenesisEquivalenceReadingFact {
  if (!(fact instanceof GenesisEquivalenceReadingFact)) {
    throw new WarpError('facts must contain GenesisEquivalenceReadingFact instances', 'E_VALIDATION');
  }
  return fact;
}

/** Requires unique visible fact keys. */
function requireUniqueFactKeys(facts: readonly GenesisEquivalenceReadingFact[]): void {
  const seen = new Set<string>();
  for (const fact of facts) {
    const key = fact.toKey();
    if (seen.has(key)) {
      throw new WarpError(`GenesisEquivalenceReading duplicates visible fact ${key}`, 'E_VALIDATION');
    }
    seen.add(key);
  }
}

/** Compares visible facts deterministically. */
function compareFacts(left: GenesisEquivalenceReadingFact, right: GenesisEquivalenceReadingFact): number {
  return compareStrings(left.toKey(), right.toKey());
}

/** Validates a required non-empty string. */
function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError(`${name} must be a non-empty string`, 'E_VALIDATION');
  }
  return value;
}
