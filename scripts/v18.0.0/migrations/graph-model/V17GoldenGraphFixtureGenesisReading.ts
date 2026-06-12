import GenesisEquivalenceBoundary from '../../../../src/domain/migrations/GenesisEquivalenceBoundary.ts';
import GenesisEquivalenceReading from '../../../../src/domain/migrations/GenesisEquivalenceReading.ts';
import GenesisEquivalenceReadingFact, {
  type GenesisEquivalenceReadingFactKind,
} from '../../../../src/domain/migrations/GenesisEquivalenceReadingFact.ts';
import V17GoldenGraphFixtureManifest, {
  V17GoldenContentFact,
  V17GoldenEdgeFact,
  type V17GoldenGraphFixtureVisibleFact,
  V17GoldenMultiWriterFact,
  V17GoldenNodeFact,
  V17GoldenPropertyFact,
  V17GoldenRemovalFact,
} from './V17GoldenGraphFixtureManifest.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';

const LEGACY_FIXTURE_READING_PREFIX = 'v17-golden-fixture';

type ProjectedFactFields = {
  readonly kind: GenesisEquivalenceReadingFactKind;
  readonly factKey: string;
  readonly fieldPath: string;
  readonly value: string;
};

/** Builds a genesis-equivalence reading from a v17 golden fixture manifest. */
export default class V17GoldenGraphFixtureGenesisReading {
  /** Projects declared fixture facts into observer-visible equivalence facts. */
  build(manifest: V17GoldenGraphFixtureManifest): GenesisEquivalenceReading {
    const checkedManifest = requireManifest(manifest);
    return new GenesisEquivalenceReading({
      readingId: `${LEGACY_FIXTURE_READING_PREFIX}:${checkedManifest.fixtureId}`,
      facts: checkedManifest.visibleFacts.map((fact, index) => projectFact(checkedManifest, fact, index)),
    });
  }
}

function projectFact(
  manifest: V17GoldenGraphFixtureManifest,
  fact: V17GoldenGraphFixtureVisibleFact,
  index: number,
): GenesisEquivalenceReadingFact {
  const projected = projectionFor(fact);
  return new GenesisEquivalenceReadingFact({
    kind: projected.kind,
    factKey: projected.factKey,
    fieldPath: projected.fieldPath,
    value: projected.value,
    boundary: boundaryFor(manifest, index),
  });
}

function projectionFor(fact: V17GoldenGraphFixtureVisibleFact): ProjectedFactFields {
  if (fact instanceof V17GoldenNodeFact) {
    return projection({ kind: 'node', factKey: fact.key, fieldPath: 'visibility', value: 'visible' });
  }
  if (fact instanceof V17GoldenEdgeFact) {
    return projection({ kind: 'edge', factKey: fact.key, fieldPath: 'visibility', value: 'visible' });
  }
  return compatibilityProjectionFor(fact);
}

function compatibilityProjectionFor(fact: V17GoldenGraphFixtureVisibleFact): ProjectedFactFields {
  if (fact instanceof V17GoldenPropertyFact) {
    return projection({
      kind: 'property',
      factKey: fact.key,
      fieldPath: 'value',
      value: `migration-source:${legacyPropertyKeyFor(fact.key)}`,
    });
  }
  if (fact instanceof V17GoldenContentFact) {
    return projection({
      kind: 'content-attachment',
      factKey: fact.key,
      fieldPath: 'payload.oid',
      value: `fixture-content:${fact.key}`,
    });
  }
  return nonVisibleLifecycleProjectionFor(fact);
}

function legacyPropertyKeyFor(factKey: string): string {
  const separator = factKey.lastIndexOf(':');
  if (separator <= 0 || separator === factKey.length - 1) {
    throw new WarpError(
      'property fixture fact key must contain at least one colon not at the boundaries; colons are allowed in owner segment',
      'E_VALIDATION',
    );
  }
  return `${factKey.slice(0, separator)}\0${factKey.slice(separator + 1)}`;
}

function nonVisibleLifecycleProjectionFor(fact: V17GoldenGraphFixtureVisibleFact): ProjectedFactFields {
  if (fact instanceof V17GoldenRemovalFact) {
    return projection({ kind: 'node', factKey: fact.key, fieldPath: 'visibility', value: 'removed' });
  }
  if (fact instanceof V17GoldenMultiWriterFact) {
    return projection({
      kind: 'property',
      factKey: fact.key,
      fieldPath: 'coverage',
      value: fact.description,
    });
  }
  throw new WarpError('unsupported v17 fixture visible fact kind', 'E_VALIDATION');
}

function projection(fields: ProjectedFactFields): ProjectedFactFields {
  return Object.freeze(fields);
}

function boundaryFor(
  manifest: V17GoldenGraphFixtureManifest,
  index: number,
): GenesisEquivalenceBoundary {
  const chain = manifest.writerChains[index % manifest.writerChains.length];
  if (chain === undefined) {
    throw new WarpError('v17 fixture manifest must contain writer chain evidence', 'E_VALIDATION');
  }
  return new GenesisEquivalenceBoundary({
    writerId: chain.writerId,
    patchId: chain.expectedHead,
    operationIndex: index,
  });
}

function requireManifest(manifest: V17GoldenGraphFixtureManifest): V17GoldenGraphFixtureManifest {
  if (!(manifest instanceof V17GoldenGraphFixtureManifest)) {
    throw new WarpError('manifest must be a V17GoldenGraphFixtureManifest', 'E_VALIDATION');
  }
  return manifest;
}
