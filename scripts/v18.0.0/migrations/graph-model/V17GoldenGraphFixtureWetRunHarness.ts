import DryRunGraphModelMigrationPlanRequest
  from '../../../../src/domain/migrations/DryRunGraphModelMigrationPlanRequest.ts';
import GenesisEquivalenceComparisonBasis
  from '../../../../src/domain/migrations/GenesisEquivalenceComparisonBasis.ts';
import GraphModelMigrationBasis from '../../../../src/domain/migrations/GraphModelMigrationBasis.ts';
import GraphModelMigrationEdgeMapping
  from '../../../../src/domain/migrations/GraphModelMigrationEdgeMapping.ts';
import GraphModelMigrationNodeMapping
  from '../../../../src/domain/migrations/GraphModelMigrationNodeMapping.ts';
import GraphModelMigrationNotice
  from '../../../../src/domain/migrations/GraphModelMigrationNotice.ts';
import GraphModelMigrationRuntimeReplayRequest
  from '../../../../src/domain/migrations/GraphModelMigrationRuntimeReplayRequest.ts';
import GraphModelMigrationRuntimeReplayResult
  from '../../../../src/domain/migrations/GraphModelMigrationRuntimeReplayResult.ts';
import V17GoldenGraphFixtureManifest, {
  V17GoldenContentFact,
  V17GoldenEdgeFact,
  V17GoldenNodeFact,
} from '../../../../src/domain/migrations/V17GoldenGraphFixtureManifest.ts';
import {
  GraphModelMigrationCommandResult,
  runGraphModelMigrationCommand,
} from './GraphModelMigrationCommand.ts';
import { verifyGraphModelMigrationProductionRuntimeReplay }
  from './GraphModelMigrationProductionRuntimeReplayProvider.ts';
import { buildV17GoldenFixturePropertyMappings }
  from './V17GoldenGraphFixturePropertyMappings.ts';
import { createV17GoldenFixtureScratchReadingProvider }
  from './V17GoldenFixtureScratchReadingProvider.ts';
import { collectGraphModelMigrationSourceInventory }
  from './GraphModelMigrationSourceInventoryCollector.ts';
import { buildV17RestoredPublicReadLegacyReading }
  from './V17RestoredPublicReadLegacyReadingBuilder.ts';
import {
  restoreV17GoldenGraphFixture,
  type V17GoldenGraphFixtureRestoreResult,
} from './V17GoldenGraphFixtureRestore.ts';
import { runMigrationGit } from './GitMigrationCommandRunner.ts';

export { buildV17GoldenFixturePropertyMappings }
  from './V17GoldenGraphFixturePropertyMappings.ts';
export { createV17GoldenFixtureScratchReadingProvider }
  from './V17GoldenFixtureScratchReadingProvider.ts';

const DEFAULT_SCRATCH_REF_PREFIX = 'refs/warp-migration-scratch';
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
    propertyMappings: buildV17GoldenFixturePropertyMappings(manifest),
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
