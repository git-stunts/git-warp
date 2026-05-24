import DryRunGraphModelMigrationPlanRequest
  from '../../../../src/domain/migrations/DryRunGraphModelMigrationPlanRequest.ts';
import GenesisEquivalenceComparisonBasis
  from '../../../../src/domain/migrations/GenesisEquivalenceComparisonBasis.ts';
import GraphModelMigrationBasis from '../../../../src/domain/migrations/GraphModelMigrationBasis.ts';
import GraphModelMigrationEdgeMapping
  from '../../../../src/domain/migrations/GraphModelMigrationEdgeMapping.ts';
import GraphModelMigrationNodeMapping
  from '../../../../src/domain/migrations/GraphModelMigrationNodeMapping.ts';
import GraphModelMigrationPropertyMapping
  from '../../../../src/domain/migrations/GraphModelMigrationPropertyMapping.ts';
import GraphModelMigrationRuntimeReplayRequest
  from '../../../../src/domain/migrations/GraphModelMigrationRuntimeReplayRequest.ts';
import GraphModelMigrationRuntimeReplayResult
  from '../../../../src/domain/migrations/GraphModelMigrationRuntimeReplayResult.ts';
import V17GoldenGraphFixtureManifest, {
  V17GoldenContentFact,
  V17GoldenEdgeFact,
  V17GoldenNodeFact,
  V17GoldenPropertyFact,
} from '../../../../src/domain/migrations/V17GoldenGraphFixtureManifest.ts';
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

const DEFAULT_SCRATCH_REF_PREFIX = 'refs/warp-migration-scratch';

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
      scratchReading: createGraphModelMigrationScratchPublicReadProvider({
        sourceRepositoryPath: restoreResult.repositoryPath,
        graphId: restoreResult.manifest.graphId,
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
  return new V17GoldenGraphFixtureWetRunHarnessResult(
    restoreResult,
    commandResult,
    runtimeReplayResult,
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
    targetOwnerId: ownerId,
    targetPropertyKey: propertyKey,
  });
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

function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new V17GoldenGraphFixtureWetRunHarnessError(`${name} must be a non-empty string`);
  }
  return value;
}
