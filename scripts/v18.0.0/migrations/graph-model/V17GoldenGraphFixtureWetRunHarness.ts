import DryRunGraphModelMigrationPlanRequest
  from '../../../../src/domain/migrations/DryRunGraphModelMigrationPlanRequest.ts';
import GenesisEquivalenceBoundary
  from '../../../../src/domain/migrations/GenesisEquivalenceBoundary.ts';
import GenesisEquivalenceComparisonBasis
  from '../../../../src/domain/migrations/GenesisEquivalenceComparisonBasis.ts';
import GenesisEquivalenceReading
  from '../../../../src/domain/migrations/GenesisEquivalenceReading.ts';
import GenesisEquivalenceReadingFact, {
  type GenesisEquivalenceReadingFactKind,
} from '../../../../src/domain/migrations/GenesisEquivalenceReadingFact.ts';
import GraphModelMigrationBasis from '../../../../src/domain/migrations/GraphModelMigrationBasis.ts';
import GraphModelMigrationEdgeMapping
  from '../../../../src/domain/migrations/GraphModelMigrationEdgeMapping.ts';
import GraphModelMigrationNodeMapping
  from '../../../../src/domain/migrations/GraphModelMigrationNodeMapping.ts';
import GraphModelMigrationPropertyMapping
  from '../../../../src/domain/migrations/GraphModelMigrationPropertyMapping.ts';
import GraphModelMigrationNotice
  from '../../../../src/domain/migrations/GraphModelMigrationNotice.ts';
import type { GraphModelMigrationPlannedGraphOperationKind }
  from '../../../../src/domain/migrations/GraphModelMigrationPlannedGraphOperation.ts';
import GraphModelMigrationRuntimeReplayRequest
  from '../../../../src/domain/migrations/GraphModelMigrationRuntimeReplayRequest.ts';
import GraphModelMigrationRuntimeReplayResult
  from '../../../../src/domain/migrations/GraphModelMigrationRuntimeReplayResult.ts';
import GraphModelMigrationScratchWriteResult
  from '../../../../src/domain/migrations/GraphModelMigrationScratchWriteResult.ts';
import V17GoldenGraphFixtureManifest, {
  V17GoldenContentFact,
  V17GoldenEdgeFact,
  type V17GoldenGraphFixtureVisibleFact,
  V17GoldenMultiWriterFact,
  V17GoldenNodeFact,
  V17GoldenPropertyFact,
  V17GoldenRemovalFact,
} from '../../../../src/domain/migrations/V17GoldenGraphFixtureManifest.ts';
import {
  decodeLegacyEdgePropNode,
  encodeLegacyEdgePropNode,
  isLegacyEdgePropNode,
} from '../../../../src/domain/services/KeyCodec.ts';
import {
  GraphModelMigrationCommandResult,
  runGraphModelMigrationCommand,
} from './GraphModelMigrationCommand.ts';
import { createGraphModelMigrationScratchPublicReadProvider }
  from './GraphModelMigrationScratchPublicReadBuilder.ts';
import { verifyGraphModelMigrationProductionRuntimeReplay }
  from './GraphModelMigrationProductionRuntimeReplayProvider.ts';
import { collectGraphModelMigrationSourceInventory }
  from './GraphModelMigrationSourceInventoryCollector.ts';
import { buildV17RestoredPublicReadLegacyReading }
  from './V17RestoredPublicReadLegacyReadingBuilder.ts';
import {
  restoreV17GoldenGraphFixture,
  type V17GoldenGraphFixtureRestoreResult,
} from './V17GoldenGraphFixtureRestore.ts';
import { runMigrationGit } from './GitMigrationCommandRunner.ts';

const DEFAULT_SCRATCH_REF_PREFIX = 'refs/warp-migration-scratch';
const CONTENT_ATTACHMENT_TARGET_PREFIX = 'content-attachment:';
const PROPERTY_TARGET_KEY_PREFIX = 'property-target-key:length-prefixed-v1:';
export const V17_WET_RUN_DRIFT_CHECK_PASSED = 'passed';
export const V17_WET_RUN_DRIFT_CHECK_FAILED = 'failed';

export type V17GoldenGraphFixtureWetRunDriftCheckStatus =
  | typeof V17_WET_RUN_DRIFT_CHECK_PASSED
  | typeof V17_WET_RUN_DRIFT_CHECK_FAILED;

export type V17GoldenGraphFixtureWetRunHarnessOptions = {
  readonly manifestPath: string;
  readonly targetDirectory: string;
  readonly scratchRefName?: string | null;
  readonly runtimeRepositoryPath?: string | null;
};

/** Evidence produced by the v17 fixture wet-run harness. */
export class V17GoldenGraphFixtureWetRunHarnessResult {
  constructor(
    readonly restoreResult: V17GoldenGraphFixtureRestoreResult,
    readonly commandResult: GraphModelMigrationCommandResult,
    readonly runtimeReplayResult: GraphModelMigrationRuntimeReplayResult | null,
    readonly driftCheckResult: V17GoldenGraphFixtureWetRunDriftCheckResult,
  ) {
    Object.freeze(this);
  }
}

/** Source-ref drift evidence captured before any future finalization step. */
export class V17GoldenGraphFixtureWetRunDriftCheckResult {
  constructor(
    readonly status: V17GoldenGraphFixtureWetRunDriftCheckStatus,
    readonly checkedRefCount: number,
    readonly fatalErrors: readonly GraphModelMigrationNotice[],
  ) {
    Object.freeze(this);
  }
}

export class V17GoldenGraphFixtureWetRunHarnessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'V17GoldenGraphFixtureWetRunHarnessError';
  }
}

/** Restores the v17 fixture and runs the v18 migration path against scratch history. */
export async function runV17GoldenGraphFixtureWetRun(
  options: V17GoldenGraphFixtureWetRunHarnessOptions,
): Promise<V17GoldenGraphFixtureWetRunHarnessResult> {
  const restoreResult = await restoreV17GoldenGraphFixture({
    manifestPath: requireNonEmptyString(options.manifestPath, 'manifestPath'),
    targetDirectory: requireNonEmptyString(options.targetDirectory, 'targetDirectory'),
  });
  const scratchRefName = requireNonEmptyString(
    options.scratchRefName ?? defaultScratchRefName(restoreResult.manifest),
    'scratchRefName',
  );
  const inventory = await collectGraphModelMigrationSourceInventory({
    repositoryPath: restoreResult.repositoryPath,
    graphId: restoreResult.manifest.graphId,
    fixtureManifest: restoreResult.manifest,
  });
  const dryRunRequest = dryRunRequestForManifest(restoreResult.manifest, inventory);
  const commandResult = await runGraphModelMigrationCommand({
    repositoryPath: restoreResult.repositoryPath,
    dryRunRequest,
    scratchRefName,
    equivalenceBasis: equivalenceBasisForRequest(dryRunRequest),
    legacyReading: null,
    scratchReading: null,
    readingProviders: {
      legacyReading: async () => await buildV17RestoredPublicReadLegacyReading({
        repositoryPath: restoreResult.repositoryPath,
        manifest: restoreResult.manifest,
      }),
      scratchReading: createV17GoldenFixtureScratchReadingProvider({
        sourceRepositoryPath: restoreResult.repositoryPath,
        manifest: restoreResult.manifest,
        runtimeRepositoryPath: options.runtimeRepositoryPath ?? null,
      }),
    },
    finalization: null,
  });
  const scratchWriteResult = commandResult.scratchWriteResult;
  const runtimeReplayResult = scratchWriteResult !== null
    && scratchWriteResult.scratchRef !== null
    && scratchWriteResult.scratchHead !== null
    ? await verifyGraphModelMigrationProductionRuntimeReplay({
      sourceRepositoryPath: restoreResult.repositoryPath,
      runtimeRepositoryPath: options.runtimeRepositoryPath ?? null,
      request: new GraphModelMigrationRuntimeReplayRequest({
        graphId: restoreResult.manifest.graphId,
        writerId: 'scratch-migration',
        scratchRef: scratchWriteResult.scratchRef,
        scratchHead: scratchWriteResult.scratchHead,
      }),
    })
    : null;
  const driftCheckResult = await checkV17GoldenGraphFixtureWetRunDrift({
    repositoryPath: restoreResult.repositoryPath,
    manifest: restoreResult.manifest,
  });
  return new V17GoldenGraphFixtureWetRunHarnessResult(
    restoreResult,
    commandResult,
    runtimeReplayResult,
    driftCheckResult,
  );
}

/** Verifies restored source writer refs still match manifest evidence. */
export async function checkV17GoldenGraphFixtureWetRunDrift(options: {
  readonly repositoryPath: string;
  readonly manifest: V17GoldenGraphFixtureManifest;
}): Promise<V17GoldenGraphFixtureWetRunDriftCheckResult> {
  const repositoryPath = requireNonEmptyString(options.repositoryPath, 'repositoryPath');
  const manifest = requireManifest(options.manifest);
  const fatalErrors: GraphModelMigrationNotice[] = [];
  for (const chain of manifest.writerChains) {
    const observedHead = await gitTextOrNull(repositoryPath, [
      'show-ref',
      '--verify',
      '--hash',
      chain.refName,
    ]);
    if (observedHead !== chain.expectedHead) {
      fatalErrors.push(GraphModelMigrationNotice.fatal(
        'E_WET_RUN_SOURCE_REF_DRIFT',
        `source ref ${chain.refName} expected ${chain.expectedHead}, got ${observedHead ?? '(missing)'}`,
      ));
      continue;
    }
    const observedPatchCount = Number(await gitTextOrNull(repositoryPath, [
      'rev-list',
      '--count',
      chain.refName,
    ]));
    if (observedPatchCount !== chain.patchCount) {
      fatalErrors.push(GraphModelMigrationNotice.fatal(
        'E_WET_RUN_SOURCE_REF_PATCH_COUNT_DRIFT',
        `source ref ${chain.refName} expected ${chain.patchCount} patches, got ${observedPatchCount}`,
      ));
    }
  }
  return new V17GoldenGraphFixtureWetRunDriftCheckResult(
    fatalErrors.length === 0 ? V17_WET_RUN_DRIFT_CHECK_PASSED : V17_WET_RUN_DRIFT_CHECK_FAILED,
    manifest.writerChains.length,
    fatalErrors,
  );
}

function dryRunRequestForManifest(
  manifest: V17GoldenGraphFixtureManifest,
  inventory: Awaited<ReturnType<typeof collectGraphModelMigrationSourceInventory>>,
): DryRunGraphModelMigrationPlanRequest {
  return new DryRunGraphModelMigrationPlanRequest({
    inventory,
    requiredContentKeys: manifest.visibleFacts
      .filter((fact) => fact instanceof V17GoldenContentFact)
      .map((fact) => fact.key),
    nodeMappings: manifest.visibleFacts
      .filter((fact) => fact instanceof V17GoldenNodeFact)
      .map((fact) => new GraphModelMigrationNodeMapping({
        legacyNodeId: fact.key,
        targetNodeId: fact.key,
      })),
    edgeMappings: manifest.visibleFacts
      .filter((fact) => fact instanceof V17GoldenEdgeFact)
      .map((fact) => new GraphModelMigrationEdgeMapping({
        legacyEdgeId: fact.key,
        targetEdgeId: fact.key,
      })),
    propertyMappings: manifest.visibleFacts
      .filter((fact) => fact instanceof V17GoldenPropertyFact)
      .map(propertyMappingFromFact),
  });
}

function propertyMappingFromFact(fact: V17GoldenPropertyFact): GraphModelMigrationPropertyMapping {
  const separator = fact.key.lastIndexOf(':');
  if (separator <= 0 || separator === fact.key.length - 1) {
    throw new V17GoldenGraphFixtureWetRunHarnessError(
      `property fact ${fact.key} must use owner:property public key format`,
    );
  }
  const ownerId = fact.key.slice(0, separator);
  const propertyKey = fact.key.slice(separator + 1);
  return new GraphModelMigrationPropertyMapping({
    legacyOwnerId: ownerId,
    legacyPropertyKey: propertyKey,
    targetOwnerId: targetPropertyOwnerId(ownerId),
    targetPropertyKey: propertyKey,
  });
}

function targetPropertyOwnerId(ownerId: string): string {
  const edge = parsePublicEdgeFactKey(ownerId);
  if (edge === null) {
    return ownerId;
  }
  return encodeLegacyEdgePropNode(edge.from, edge.to, edge.label);
}

function parsePublicEdgeFactKey(ownerId: string): {
  readonly from: string;
  readonly to: string;
  readonly label: string;
} | null {
  const arrowIndex = ownerId.indexOf('->');
  const labelIndex = ownerId.lastIndexOf(':');
  if (arrowIndex <= 0 || labelIndex <= arrowIndex + 2 || labelIndex === ownerId.length - 1) {
    return null;
  }
  return Object.freeze({
    from: ownerId.slice(0, arrowIndex),
    to: ownerId.slice(arrowIndex + 2, labelIndex),
    label: ownerId.slice(labelIndex + 1),
  });
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
  if (kind === 'node-record') {
    return factKey('node', targetKey, 'visibility');
  }
  if (kind === 'edge-record') {
    return factKey('edge', targetKey, 'visibility');
  }
  if (kind === 'property') {
    return factKey('property', publicPropertyFactKey(targetKey), 'value');
  }
  if (kind === 'content-attachment') {
    return factKey('content-attachment', publicContentFactKey(targetKey), 'payload.oid');
  }
  throw new V17GoldenGraphFixtureWetRunHarnessError(`unsupported scratch operation kind ${kind}`);
}

function publicContentFactKey(targetKey: string): string {
  if (!targetKey.startsWith(CONTENT_ATTACHMENT_TARGET_PREFIX)) {
    throw new V17GoldenGraphFixtureWetRunHarnessError(
      `content attachment target ${targetKey} must use content-attachment prefix`,
    );
  }
  return targetKey.slice(CONTENT_ATTACHMENT_TARGET_PREFIX.length);
}

function publicPropertyFactKey(targetKey: string): string {
  const decoded = decodePropertyTargetKey(targetKey);
  if (isLegacyEdgePropNode(decoded.ownerId)) {
    const edge = decodeLegacyEdgePropNode(decoded.ownerId);
    return `${edge.from}->${edge.to}:${edge.label}:${decoded.propertyKey}`;
  }
  return `${decoded.ownerId}:${decoded.propertyKey}`;
}

function decodePropertyTargetKey(targetKey: string): {
  readonly ownerId: string;
  readonly propertyKey: string;
} {
  if (!targetKey.startsWith(PROPERTY_TARGET_KEY_PREFIX)) {
    throw new V17GoldenGraphFixtureWetRunHarnessError(
      `property target ${targetKey} must use length-prefixed target format`,
    );
  }
  let cursor = PROPERTY_TARGET_KEY_PREFIX.length;
  const ownerLength = readLength(targetKey, cursor);
  cursor = ownerLength.nextCursor;
  const ownerId = readSizedField(targetKey, cursor, ownerLength.value, 'ownerId', true);
  cursor = ownerId.nextCursor;
  const propertyLength = readLength(targetKey, cursor);
  cursor = propertyLength.nextCursor;
  const propertyKey = readSizedField(targetKey, cursor, propertyLength.value, 'propertyKey', false);
  if (propertyKey.nextCursor !== targetKey.length) {
    throw new V17GoldenGraphFixtureWetRunHarnessError('property target has trailing data');
  }
  return Object.freeze({ ownerId: ownerId.value, propertyKey: propertyKey.value });
}

function readLength(text: string, cursor: number): {
  readonly value: number;
  readonly nextCursor: number;
} {
  const separator = text.indexOf(':', cursor);
  if (separator <= cursor) {
    throw new V17GoldenGraphFixtureWetRunHarnessError('length-prefixed field is malformed');
  }
  const raw = text.slice(cursor, separator);
  if (!/^[0-9]+$/u.test(raw)) {
    throw new V17GoldenGraphFixtureWetRunHarnessError('length-prefixed field length is invalid');
  }
  return Object.freeze({ value: Number(raw), nextCursor: separator + 1 });
}

function readSizedField(
  text: string,
  cursor: number,
  length: number,
  label: string,
  separatorRequired: boolean,
): {
  readonly value: string;
  readonly nextCursor: number;
} {
  const value = text.slice(cursor, cursor + length);
  if (value.length !== length) {
    throw new V17GoldenGraphFixtureWetRunHarnessError(`${label} field is truncated`);
  }
  const nextCursor = cursor + length;
  if (!separatorRequired) {
    return Object.freeze({ value, nextCursor });
  }
  if (text[nextCursor] !== ':') {
    throw new V17GoldenGraphFixtureWetRunHarnessError(`${label} field is missing separator`);
  }
  return Object.freeze({ value, nextCursor: nextCursor + 1 });
}

function requireScratchBoundary(
  fact: GenesisEquivalenceReadingFact,
  boundaries: ReadonlyMap<string, GenesisEquivalenceBoundary>,
): GenesisEquivalenceBoundary {
  const boundary = boundaries.get(fact.toKey());
  if (boundary === undefined) {
    throw new V17GoldenGraphFixtureWetRunHarnessError(
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
      'node',
      fact.key,
      'visibility',
      'removed',
      fixtureBoundaryFor(manifest, operationIndex),
    );
  }
  if (fact instanceof V17GoldenMultiWriterFact) {
    return publicFactWithBoundary(
      'property',
      fact.key,
      'coverage',
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
    throw new V17GoldenGraphFixtureWetRunHarnessError(
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
    throw new V17GoldenGraphFixtureWetRunHarnessError(
      'reading must be a GenesisEquivalenceReading',
    );
  }
  return reading;
}

function requireScratchWriteResult(
  scratchWriteResult: GraphModelMigrationScratchWriteResult,
): GraphModelMigrationScratchWriteResult {
  if (!(scratchWriteResult instanceof GraphModelMigrationScratchWriteResult)) {
    throw new V17GoldenGraphFixtureWetRunHarnessError(
      'scratchWriteResult must be a GraphModelMigrationScratchWriteResult',
    );
  }
  return scratchWriteResult;
}

function displayFactKey(value: string): string {
  return value.replaceAll('\0', '\\0');
}

function equivalenceBasisForRequest(
  request: DryRunGraphModelMigrationPlanRequest,
): GenesisEquivalenceComparisonBasis {
  const sourceBasis = request.inventory.sourceBasis;
  if (sourceBasis === null) {
    throw new V17GoldenGraphFixtureWetRunHarnessError(
      'wet-run request must have a source basis',
    );
  }
  return new GenesisEquivalenceComparisonBasis({
    legacyBasis: sourceBasis,
    migratedBasis: new GraphModelMigrationBasis({
      graphId: sourceBasis.graphId,
      basisId: `${sourceBasis.basisId}:v18-dry-run`,
    }),
  });
}

function defaultScratchRefName(manifest: V17GoldenGraphFixtureManifest): string {
  return `${DEFAULT_SCRATCH_REF_PREFIX}/${manifest.graphId}/wet-run`;
}

function requireManifest(manifest: V17GoldenGraphFixtureManifest): V17GoldenGraphFixtureManifest {
  if (!(manifest instanceof V17GoldenGraphFixtureManifest)) {
    throw new V17GoldenGraphFixtureWetRunHarnessError(
      'manifest must be a V17GoldenGraphFixtureManifest',
    );
  }
  return manifest;
}

function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new V17GoldenGraphFixtureWetRunHarnessError(`${name} must be a non-empty string`);
  }
  return value;
}

async function gitTextOrNull(repositoryPath: string, args: readonly string[]): Promise<string | null> {
  const result = await runMigrationGit(repositoryPath, args, null);
  if (!result.ok()) {
    return null;
  }
  return result.stdout.trim();
}
