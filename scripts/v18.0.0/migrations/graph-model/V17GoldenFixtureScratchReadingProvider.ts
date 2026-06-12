import GenesisEquivalenceBoundary
  from '../../../../src/domain/migrations/GenesisEquivalenceBoundary.ts';
import GenesisEquivalenceReading
  from '../../../../src/domain/migrations/GenesisEquivalenceReading.ts';
import GenesisEquivalenceReadingFact, {
  GENESIS_EQUIVALENCE_CONTENT_ATTACHMENT_FACT,
  GENESIS_EQUIVALENCE_EDGE_FACT,
  GENESIS_EQUIVALENCE_NODE_FACT,
  GENESIS_EQUIVALENCE_PROPERTY_FACT,
  type GenesisEquivalenceReadingFactKind,
} from '../../../../src/domain/migrations/GenesisEquivalenceReadingFact.ts';
import type { GraphModelMigrationPlannedGraphOperationKind }
  from '../../../../src/domain/migrations/GraphModelMigrationPlannedGraphOperation.ts';
import GraphModelMigrationScratchWriteResult
  from '../../../../src/domain/migrations/GraphModelMigrationScratchWriteResult.ts';
import V17GoldenGraphFixtureManifest, {
  type V17GoldenGraphFixtureVisibleFact,
  V17GoldenMultiWriterFact,
  V17GoldenRemovalFact,
} from './V17GoldenGraphFixtureManifest.ts';
import {
  publicContentFactKey,
  publicPropertyFactKey,
} from './V17GoldenFixtureScratchFactKeyCodec.ts';
import { createGraphModelMigrationScratchPublicReadProvider }
  from './GraphModelMigrationScratchPublicReadBuilder.ts';

const SCRATCH_NODE_RECORD_KIND = 'node-record';
const SCRATCH_EDGE_RECORD_KIND = 'edge-record';
const SCRATCH_PROPERTY_KIND = 'property';
const SCRATCH_CONTENT_ATTACHMENT_KIND = 'content-attachment';
const FIELD_VISIBILITY = 'visibility';
const FIELD_VALUE = 'value';
const FIELD_PAYLOAD_OID = 'payload.oid';
const FIELD_COVERAGE = 'coverage';
const VALUE_REMOVED = 'removed';

export class V17GoldenFixtureScratchReadingProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'V17GoldenFixtureScratchReadingProviderError';
  }
}

export function createV17GoldenFixtureScratchReadingProvider(options: {
  readonly sourceRepositoryPath: string;
  readonly manifest: V17GoldenGraphFixtureManifest;
  readonly runtimeRepositoryPath: string | null;
}): (scratchWriteResult: GraphModelMigrationScratchWriteResult) => Promise<GenesisEquivalenceReading> {
  const manifest = requireManifest(options.manifest);
  const publicReadProvider = createGraphModelMigrationScratchPublicReadProvider({
    sourceRepositoryPath: requireNonEmptyString(options.sourceRepositoryPath, 'sourceRepositoryPath'),
    graphId: manifest.graphId,
    runtimeRepositoryPath: options.runtimeRepositoryPath,
  });
  return async (scratchWriteResult) => withFixtureCoverageFacts(
    await publicReadProvider(scratchWriteResult),
    scratchWriteResult,
    manifest,
  );
}

function withFixtureCoverageFacts(
  reading: GenesisEquivalenceReading,
  scratchWriteResult: GraphModelMigrationScratchWriteResult,
  manifest: V17GoldenGraphFixtureManifest,
): GenesisEquivalenceReading {
  const checkedReading = requireReading(reading);
  const scratchBoundaries = scratchBoundariesByFactKey(scratchWriteResult);
  const facts = checkedReading.facts
    .map((fact) => factWithBoundary(fact, requireScratchBoundary(fact, scratchBoundaries)))
    .concat(lifecycleCoverageFacts(manifest, checkedReading.facts.length));
  return new GenesisEquivalenceReading({
    readingId: checkedReading.readingId,
    facts: deduplicateFacts(facts),
  });
}

function scratchBoundariesByFactKey(
  scratchWriteResult: GraphModelMigrationScratchWriteResult,
): ReadonlyMap<string, GenesisEquivalenceBoundary> {
  const checkedScratch = requireScratchWriteResult(scratchWriteResult);
  const indexed = new Map<string, GenesisEquivalenceBoundary>();
  for (const patch of checkedScratch.writtenPatches) {
    indexed.set(
      factKeyForWrittenPatch(patch.operation.kind, patch.operation.targetKey),
      new GenesisEquivalenceBoundary({
        writerId: 'scratch-migration',
        patchId: patch.commitId,
        operationIndex: patch.sequence,
      }),
    );
  }
  return indexed;
}

function factKeyForWrittenPatch(
  kind: GraphModelMigrationPlannedGraphOperationKind,
  targetKey: string,
): string {
  if (kind === SCRATCH_NODE_RECORD_KIND) {
    return factKey(GENESIS_EQUIVALENCE_NODE_FACT, targetKey, FIELD_VISIBILITY);
  }
  if (kind === SCRATCH_EDGE_RECORD_KIND) {
    return factKey(GENESIS_EQUIVALENCE_EDGE_FACT, targetKey, FIELD_VISIBILITY);
  }
  if (kind === SCRATCH_PROPERTY_KIND) {
    return factKey(GENESIS_EQUIVALENCE_PROPERTY_FACT, publicPropertyFactKey(targetKey), FIELD_VALUE);
  }
  if (kind === SCRATCH_CONTENT_ATTACHMENT_KIND) {
    return factKey(
      GENESIS_EQUIVALENCE_CONTENT_ATTACHMENT_FACT,
      publicContentFactKey(targetKey),
      FIELD_PAYLOAD_OID,
    );
  }
  throw new V17GoldenFixtureScratchReadingProviderError(`unsupported scratch operation kind ${kind}`);
}

function requireScratchBoundary(
  fact: GenesisEquivalenceReadingFact,
  boundaries: ReadonlyMap<string, GenesisEquivalenceBoundary>,
): GenesisEquivalenceBoundary {
  const boundary = boundaries.get(fact.toKey());
  if (boundary === undefined) {
    throw new V17GoldenFixtureScratchReadingProviderError(
      `missing scratch boundary for migrated fact ${displayFactKey(fact.toKey())}`,
    );
  }
  return boundary;
}

function factWithBoundary(
  fact: GenesisEquivalenceReadingFact,
  boundary: GenesisEquivalenceBoundary,
): GenesisEquivalenceReadingFact {
  return new GenesisEquivalenceReadingFact({
    kind: fact.kind,
    factKey: fact.factKey,
    fieldPath: fact.fieldPath,
    value: fact.value,
    boundary,
  });
}

function lifecycleCoverageFacts(
  manifest: V17GoldenGraphFixtureManifest,
  operationOffset: number,
): readonly GenesisEquivalenceReadingFact[] {
  return Object.freeze(manifest.visibleFacts
    .map((fact, index) => lifecycleCoverageFactFor(manifest, fact, operationOffset + index))
    .filter((fact) => fact !== null));
}

function lifecycleCoverageFactFor(
  manifest: V17GoldenGraphFixtureManifest,
  fact: V17GoldenGraphFixtureVisibleFact,
  operationIndex: number,
): GenesisEquivalenceReadingFact | null {
  if (fact instanceof V17GoldenRemovalFact) {
    return publicFactWithBoundary(
      GENESIS_EQUIVALENCE_NODE_FACT,
      fact.key,
      FIELD_VISIBILITY,
      VALUE_REMOVED,
      fixtureBoundaryFor(manifest, operationIndex),
    );
  }
  if (fact instanceof V17GoldenMultiWriterFact) {
    return publicFactWithBoundary(
      GENESIS_EQUIVALENCE_PROPERTY_FACT,
      fact.key,
      FIELD_COVERAGE,
      fact.description,
      fixtureBoundaryFor(manifest, operationIndex),
    );
  }
  return null;
}

function publicFactWithBoundary(
  kind: GenesisEquivalenceReadingFactKind,
  factKeyValue: string,
  fieldPath: string,
  value: string,
  boundary: GenesisEquivalenceBoundary,
): GenesisEquivalenceReadingFact {
  return new GenesisEquivalenceReadingFact({
    kind,
    factKey: factKeyValue,
    fieldPath,
    value,
    boundary,
  });
}

function fixtureBoundaryFor(
  manifest: V17GoldenGraphFixtureManifest,
  operationIndex: number,
): GenesisEquivalenceBoundary {
  const chain = manifest.writerChains[operationIndex % manifest.writerChains.length];
  if (chain === undefined) {
    throw new V17GoldenFixtureScratchReadingProviderError(
      'v17 fixture manifest must contain writer chain evidence',
    );
  }
  return new GenesisEquivalenceBoundary({
    writerId: chain.writerId,
    patchId: chain.expectedHead,
    operationIndex,
  });
}

function deduplicateFacts(
  facts: readonly GenesisEquivalenceReadingFact[],
): readonly GenesisEquivalenceReadingFact[] {
  const seen = new Set<string>();
  const deduplicated: GenesisEquivalenceReadingFact[] = [];
  for (const fact of facts) {
    if (!seen.has(fact.toKey())) {
      seen.add(fact.toKey());
      deduplicated.push(fact);
    }
  }
  return Object.freeze(deduplicated);
}

function factKey(
  kind: GenesisEquivalenceReadingFactKind,
  factKeyValue: string,
  fieldPath: string,
): string {
  return `${kind}\0${factKeyValue}\0${fieldPath}`;
}

function requireReading(reading: GenesisEquivalenceReading): GenesisEquivalenceReading {
  if (!(reading instanceof GenesisEquivalenceReading)) {
    throw new V17GoldenFixtureScratchReadingProviderError(
      'reading must be a GenesisEquivalenceReading',
    );
  }
  return reading;
}

function requireScratchWriteResult(
  scratchWriteResult: GraphModelMigrationScratchWriteResult,
): GraphModelMigrationScratchWriteResult {
  if (!(scratchWriteResult instanceof GraphModelMigrationScratchWriteResult)) {
    throw new V17GoldenFixtureScratchReadingProviderError(
      'scratchWriteResult must be a GraphModelMigrationScratchWriteResult',
    );
  }
  return scratchWriteResult;
}

function displayFactKey(value: string): string {
  return value.replaceAll('\0', '\\0');
}

function requireManifest(manifest: V17GoldenGraphFixtureManifest): V17GoldenGraphFixtureManifest {
  if (!(manifest instanceof V17GoldenGraphFixtureManifest)) {
    throw new V17GoldenFixtureScratchReadingProviderError(
      'manifest must be a V17GoldenGraphFixtureManifest',
    );
  }
  return manifest;
}

function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new V17GoldenFixtureScratchReadingProviderError(`${name} must be a non-empty string`);
  }
  return value;
}
