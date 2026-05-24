import { compareStrings } from '../utils/StringComparison.ts';
import GenesisEquivalenceComparisonBasis from './GenesisEquivalenceComparisonBasis.ts';
import GenesisEquivalenceMismatch from './GenesisEquivalenceMismatch.ts';
import GenesisEquivalenceProofFailure from './GenesisEquivalenceProofFailure.ts';
import type { GenesisEquivalenceProofResult } from './GenesisEquivalenceProofResult.ts';
import GenesisEquivalenceProofSuccess from './GenesisEquivalenceProofSuccess.ts';
import GenesisEquivalenceProofSummary from './GenesisEquivalenceProofSummary.ts';
import GenesisEquivalenceReading from './GenesisEquivalenceReading.ts';
import type GenesisEquivalenceReadingFact from './GenesisEquivalenceReadingFact.ts';
import WarpError from '../errors/WarpError.ts';

/** Pure comparer for legacy and migrated genesis replay readings. */
export default class GenesisEquivalenceProof {
  /** Compares two observer-visible readings and returns a proof result value. */
  compare(
    basis: GenesisEquivalenceComparisonBasis,
    legacyReading: GenesisEquivalenceReading,
    migratedReading: GenesisEquivalenceReading,
  ): GenesisEquivalenceProofResult {
    const checkedBasis = requireBasis(basis);
    const checkedLegacy = requireReading(legacyReading, 'legacyReading');
    const checkedMigrated = requireReading(migratedReading, 'migratedReading');
    return compareReadings(checkedBasis, checkedLegacy, checkedMigrated);
  }
}

/** Compares validated readings. */
function compareReadings(
  basis: GenesisEquivalenceComparisonBasis,
  legacyReading: GenesisEquivalenceReading,
  migratedReading: GenesisEquivalenceReading,
): GenesisEquivalenceProofResult {
  const legacyFacts = factsByKey(legacyReading.facts);
  const migratedFacts = factsByKey(migratedReading.facts);
  const mismatches = collectMismatches(legacyReading.facts, migratedFacts)
    .concat(collectExtraMismatches(migratedReading.facts, legacyFacts))
    .sort(compareMismatches);
  const summary = new GenesisEquivalenceProofSummary({
    basis,
    legacyFactCount: legacyReading.facts.length,
    migratedFactCount: migratedReading.facts.length,
    mismatchCount: mismatches.length,
  });
  if (mismatches.length === 0) {
    return new GenesisEquivalenceProofSuccess({ basis, summary });
  }
  return new GenesisEquivalenceProofFailure({ basis, summary, mismatches });
}

/** Collects missing and changed migrated facts for legacy facts. */
function collectMismatches(
  legacyFacts: readonly GenesisEquivalenceReadingFact[],
  migratedFacts: ReadonlyMap<string, GenesisEquivalenceReadingFact>,
): readonly GenesisEquivalenceMismatch[] {
  const mismatches: GenesisEquivalenceMismatch[] = [];
  for (const legacyFact of legacyFacts) {
    const migratedFact = migratedFacts.get(legacyFact.toKey());
    if (migratedFact === undefined) {
      mismatches.push(missingMismatch(legacyFact));
      continue;
    }
    if (legacyFact.value !== migratedFact.value) {
      mismatches.push(changedMismatch(legacyFact, migratedFact));
    }
  }
  return Object.freeze(mismatches);
}

/** Collects migrated facts absent from the legacy reading. */
function collectExtraMismatches(
  migratedFacts: readonly GenesisEquivalenceReadingFact[],
  legacyFacts: ReadonlyMap<string, GenesisEquivalenceReadingFact>,
): readonly GenesisEquivalenceMismatch[] {
  const mismatches: GenesisEquivalenceMismatch[] = [];
  for (const migratedFact of migratedFacts) {
    if (!legacyFacts.has(migratedFact.toKey())) {
      mismatches.push(extraMismatch(migratedFact));
    }
  }
  return Object.freeze(mismatches);
}

/** Builds a missing-fact mismatch. */
function missingMismatch(fact: GenesisEquivalenceReadingFact): GenesisEquivalenceMismatch {
  return new GenesisEquivalenceMismatch({
    kind: 'missing',
    factKind: fact.kind,
    factKey: fact.factKey,
    fieldPath: fact.fieldPath,
    legacyValue: fact.value,
    migratedValue: null,
    boundary: fact.boundary,
  });
}

/** Builds an extra-fact mismatch. */
function extraMismatch(fact: GenesisEquivalenceReadingFact): GenesisEquivalenceMismatch {
  return new GenesisEquivalenceMismatch({
    kind: 'extra',
    factKind: fact.kind,
    factKey: fact.factKey,
    fieldPath: fact.fieldPath,
    legacyValue: null,
    migratedValue: fact.value,
    boundary: fact.boundary,
  });
}

/** Builds a changed-field mismatch. */
function changedMismatch(
  legacyFact: GenesisEquivalenceReadingFact,
  migratedFact: GenesisEquivalenceReadingFact,
): GenesisEquivalenceMismatch {
  return new GenesisEquivalenceMismatch({
    kind: 'changed',
    factKind: legacyFact.kind,
    factKey: legacyFact.factKey,
    fieldPath: legacyFact.fieldPath,
    legacyValue: legacyFact.value,
    migratedValue: migratedFact.value,
    boundary: legacyFact.boundary ?? migratedFact.boundary,
  });
}

/** Indexes facts by deterministic identity. */
function factsByKey(
  facts: readonly GenesisEquivalenceReadingFact[],
): ReadonlyMap<string, GenesisEquivalenceReadingFact> {
  const indexed = new Map<string, GenesisEquivalenceReadingFact>();
  for (const fact of facts) {
    indexed.set(fact.toKey(), fact);
  }
  return indexed;
}

/** Requires a comparison basis instance. */
function requireBasis(basis: GenesisEquivalenceComparisonBasis): GenesisEquivalenceComparisonBasis {
  if (!(basis instanceof GenesisEquivalenceComparisonBasis)) {
    throw new WarpError('basis must be a GenesisEquivalenceComparisonBasis', 'E_VALIDATION');
  }
  return basis;
}

/** Requires a reading instance. */
function requireReading(reading: GenesisEquivalenceReading, label: string): GenesisEquivalenceReading {
  if (!(reading instanceof GenesisEquivalenceReading)) {
    throw new WarpError(`${label} must be a GenesisEquivalenceReading`, 'E_VALIDATION');
  }
  return reading;
}

/** Compares mismatches deterministically. */
function compareMismatches(left: GenesisEquivalenceMismatch, right: GenesisEquivalenceMismatch): number {
  return compareStrings(left.toKey(), right.toKey());
}
