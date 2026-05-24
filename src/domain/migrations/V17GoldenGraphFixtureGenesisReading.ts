import GenesisEquivalenceBoundary from './GenesisEquivalenceBoundary.ts';
import GenesisEquivalenceReading from './GenesisEquivalenceReading.ts';
import GenesisEquivalenceReadingFact, {
  type GenesisEquivalenceReadingFactKind,
} from './GenesisEquivalenceReadingFact.ts';
import V17GoldenGraphFixtureManifest, {
  V17_GOLDEN_CONTENT_FACT,
  V17_GOLDEN_EDGE_FACT,
  V17_GOLDEN_MULTI_WRITER_FACT,
  V17_GOLDEN_NODE_FACT,
  V17_GOLDEN_PROPERTY_FACT,
  V17_GOLDEN_REMOVAL_FACT,
  type V17GoldenGraphFixtureVisibleFact,
} from './V17GoldenGraphFixtureManifest.ts';
import WarpError from '../errors/WarpError.ts';

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
  if (fact.kind === V17_GOLDEN_NODE_FACT) {
    return projection({ kind: 'node', factKey: fact.key, fieldPath: 'visibility', value: 'visible' });
  }
  if (fact.kind === V17_GOLDEN_EDGE_FACT) {
    return projection({ kind: 'edge', factKey: fact.key, fieldPath: 'visibility', value: 'visible' });
  }
  return compatibilityProjectionFor(fact);
}

function compatibilityProjectionFor(fact: V17GoldenGraphFixtureVisibleFact): ProjectedFactFields {
  if (fact.kind === V17_GOLDEN_PROPERTY_FACT) {
    return projection({ kind: 'property', factKey: fact.key, fieldPath: 'value', value: fact.description });
  }
  if (fact.kind === V17_GOLDEN_CONTENT_FACT) {
    return projection({
      kind: 'content-attachment',
      factKey: fact.key,
      fieldPath: 'payload.oid',
      value: `fixture-content:${fact.key}`,
    });
  }
  return nonVisibleLifecycleProjectionFor(fact);
}

function nonVisibleLifecycleProjectionFor(fact: V17GoldenGraphFixtureVisibleFact): ProjectedFactFields {
  if (fact.kind === V17_GOLDEN_REMOVAL_FACT) {
    return projection({ kind: 'node', factKey: fact.key, fieldPath: 'visibility', value: 'removed' });
  }
  if (fact.kind === V17_GOLDEN_MULTI_WRITER_FACT) {
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
