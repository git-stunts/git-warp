import { readFile, writeFile } from 'node:fs/promises';

import GenesisEquivalenceComparisonBasis
  from '../../../../src/domain/migrations/GenesisEquivalenceComparisonBasis.ts';
import DryRunGraphModelMigrationPlanner
  from '../../../../src/domain/migrations/DryRunGraphModelMigrationPlanner.ts';
import { parseGraphModelMigrationDryRunRequest }
  from '../../../../src/infrastructure/adapters/GraphModelMigrationDryRunRequestJsonAdapter.ts';
import { parseGraphModelMigrationFinalizationRequest }
  from '../../../../src/infrastructure/adapters/GraphModelMigrationFinalizationRequestJsonAdapter.ts';
import { parseV17GoldenGraphFixtureManifestJson }
  from './V17GoldenGraphFixtureManifestJsonAdapter.ts';
import { runGraphModelMigrationCommand } from './GraphModelMigrationCommand.ts';
import { formatGraphModelMigrationCommandReport } from './GraphModelMigrationCommandReport.ts';
import { createGraphModelMigrationProductionRuntimeConformanceProvider }
  from './GraphModelMigrationProductionRuntimeReplayProvider.ts';
import { buildV17RestoredPublicReadLegacyReading }
  from './V17RestoredPublicReadLegacyReadingBuilder.ts';
import { createV17GoldenFixtureScratchReadingProvider }
  from './V17GoldenGraphFixtureWetRunHarness.ts';
import {
  GraphModelMigrationCommandCliArgumentError,
  GraphModelMigrationCommandCliArgs,
  graphModelMigrationCommandUsage,
  parseGraphModelMigrationCommandCliArgs,
} from './GraphModelMigrationCommandCliArgs.ts';
import type DryRunGraphModelMigrationPlan
  from '../../../../src/domain/migrations/DryRunGraphModelMigrationPlan.ts';
import type GraphModelMigrationFinalizationRequest
  from '../../../../src/domain/migrations/GraphModelMigrationFinalizationRequest.ts';
import type GraphModelMigrationNotice
  from '../../../../src/domain/migrations/GraphModelMigrationNotice.ts';

export {
  GraphModelMigrationCommandCliArgumentError,
  GraphModelMigrationCommandCliArgs,
  graphModelMigrationCommandUsage,
  parseGraphModelMigrationCommandCliArgs,
} from './GraphModelMigrationCommandCliArgs.ts';

export class GraphModelMigrationCommandCliResult {
  constructor(
    readonly exitCode: number,
    readonly stdout: string,
    readonly stderr: string,
  ) {
    Object.freeze(this);
  }
}

/** Runs the v18 graph-model migration command wrapper. */
export async function runGraphModelMigrationCommandCli(
  argv: readonly string[],
): Promise<GraphModelMigrationCommandCliResult> {
  const args = parseGraphModelMigrationCommandCliArgs(argv);
  if (args.helpRequested) {
    return new GraphModelMigrationCommandCliResult(0, `${graphModelMigrationCommandUsage()}\n`, '');
  }
  requireCommandArgs(args);

  const requestText = await readFile(requireString(args.requestPath, '--request'), 'utf8');
  const legacyManifestText = await readFile(
    requireString(args.legacyFixtureManifestPath, '--legacy-fixture-manifest'),
    'utf8',
  );
  const dryRunRequest = parseGraphModelMigrationDryRunRequest(requestText);
  const legacyManifest = parseV17GoldenGraphFixtureManifestJson(legacyManifestText);
  const finalizationRequest = args.finalizationRequestPath === null
    ? null
    : parseGraphModelMigrationFinalizationRequest(
      await readFile(args.finalizationRequestPath, 'utf8'),
    );
  const preflightPlan = new DryRunGraphModelMigrationPlanner().plan(dryRunRequest);
  if (preflightPlan.hasFatalErrors() || preflightPlan.manifest === null) {
    return new GraphModelMigrationCommandCliResult(1, preflightFailureReport(preflightPlan), '');
  }

  const repositoryPath = requireString(args.repositoryPath, '--repo');
  const scratchRefName = requireString(args.scratchRefName, '--scratch-ref');
  const result = await runGraphModelMigrationCommand({
    repositoryPath,
    dryRunRequest,
    scratchRefName,
    equivalenceBasis: new GenesisEquivalenceComparisonBasis({
      legacyBasis: preflightPlan.manifest.sourceBasis,
      migratedBasis: preflightPlan.manifest.targetBasis,
    }),
    legacyReading: null,
    scratchReading: null,
    readingProviders: {
      legacyReading: async () => await buildV17RestoredPublicReadLegacyReading({
        repositoryPath,
        manifest: legacyManifest,
      }),
      scratchReading: createV17GoldenFixtureScratchReadingProvider({
        sourceRepositoryPath: repositoryPath,
        manifest: legacyManifest,
        runtimeRepositoryPath: null,
      }),
    },
    finalization: finalizationOptions(finalizationRequest, repositoryPath, legacyManifest.graphId),
  });
  const report = formatGraphModelMigrationCommandReport(result);
  if (args.reportOutPath !== null) {
    await writeFile(args.reportOutPath, report, 'utf8');
  }
  return new GraphModelMigrationCommandCliResult(commandExitCode(result), report, '');
}

function finalizationOptions(
  request: GraphModelMigrationFinalizationRequest | null,
  repositoryPath: string,
  graphId: string,
): Parameters<typeof runGraphModelMigrationCommand>[0]['finalization'] {
  if (request === null) {
    return null;
  }
  return {
    liveRefName: request.liveRefName,
    expectedLiveHead: requireFinalizationString(request.expectedLiveHead, 'expectedLiveHead'),
    archiveRefName: requireFinalizationString(request.archiveRefName, 'archiveRefName'),
    confirmation: request.confirmation,
    runtimeConformance: createGraphModelMigrationProductionRuntimeConformanceProvider({
      sourceRepositoryPath: repositoryPath,
      graphId,
    }),
    reviewedRequest: request,
  };
}

function commandExitCode(result: Awaited<ReturnType<typeof runGraphModelMigrationCommand>>): number {
  if (
    !result.dryRunPlan.hasFatalErrors()
    && !result.loweringResult.hasFatalErrors()
    && result.scratchWriteResult !== null
    && !result.scratchWriteResult.hasFatalErrors()
    && result.gateResult !== null
    && result.gateResult.allowsPromotion()
    && (result.finalizationResult === null || result.finalizationResult.finalized())
  ) {
    return 0;
  }
  return 1;
}

function preflightFailureReport(plan: DryRunGraphModelMigrationPlan): string {
  return [
    'git-warp v18 graph-model migration report',
    'dryRun: blocked',
    `plannedOperations: ${plan.plannedOperations.length}`,
    ...fatalNoticeLines(plan.fatalErrors),
  ].join('\n');
}

function fatalNoticeLines(fatalErrors: readonly GraphModelMigrationNotice[]): readonly string[] {
  const lines = ['fatalErrors:'];
  for (const notice of fatalErrors) {
    lines.push(`- ${notice.code}: ${notice.message}`);
  }
  return Object.freeze(lines);
}

function requireCommandArgs(args: GraphModelMigrationCommandCliArgs): void {
  requireString(args.repositoryPath, '--repo');
  requireString(args.requestPath, '--request');
  requireString(args.legacyFixtureManifestPath, '--legacy-fixture-manifest');
  requireString(args.scratchRefName, '--scratch-ref');
}

function requireString(value: string | null, flag: string): string {
  if (value === null) {
    throw new GraphModelMigrationCommandCliArgumentError(`${flag} is required`);
  }
  return value;
}

function requireFinalizationString(value: string | null, label: string): string {
  if (value === null) {
    throw new GraphModelMigrationCommandCliArgumentError(`${label} is required in finalization request`);
  }
  return value;
}
