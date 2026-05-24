import DryRunGraphModelMigrationPlan
  from '../../../../src/domain/migrations/DryRunGraphModelMigrationPlan.ts';
import DryRunGraphModelMigrationPlanRequest
  from '../../../../src/domain/migrations/DryRunGraphModelMigrationPlanRequest.ts';
import DryRunGraphModelMigrationPlanner
  from '../../../../src/domain/migrations/DryRunGraphModelMigrationPlanner.ts';
import GenesisEquivalenceComparisonBasis
  from '../../../../src/domain/migrations/GenesisEquivalenceComparisonBasis.ts';
import GenesisEquivalenceGate from '../../../../src/domain/migrations/GenesisEquivalenceGate.ts';
import GenesisEquivalenceGateResult
  from '../../../../src/domain/migrations/GenesisEquivalenceGateResult.ts';
import GenesisEquivalenceReading
  from '../../../../src/domain/migrations/GenesisEquivalenceReading.ts';
import GraphModelMigrationFinalizationConfirmation
  from '../../../../src/domain/migrations/GraphModelMigrationFinalizationConfirmation.ts';
import GraphModelMigrationFinalizationRequest
  from '../../../../src/domain/migrations/GraphModelMigrationFinalizationRequest.ts';
import GraphModelMigrationFinalizationResult
  from '../../../../src/domain/migrations/GraphModelMigrationFinalizationResult.ts';
import GraphModelMigrationFinalizationSafety
  from '../../../../src/domain/migrations/GraphModelMigrationFinalizationSafety.ts';
import GraphModelMigrationOperationLowerer
  from '../../../../src/domain/migrations/GraphModelMigrationOperationLowerer.ts';
import GraphModelMigrationOperationLoweringResult
  from '../../../../src/domain/migrations/GraphModelMigrationOperationLoweringResult.ts';
import GraphModelMigrationScratchWriteResult
  from '../../../../src/domain/migrations/GraphModelMigrationScratchWriteResult.ts';
import { finalizeGraphModelMigration } from './GraphModelMigrationFinalizer.ts';
import { writeGraphModelMigrationScratchHistory } from './GraphModelMigrationScratchWriter.ts';
import { runMigrationGit } from './GitMigrationCommandRunner.ts';

export type GraphModelMigrationCommandFinalizationOptions = {
  readonly liveRefName: string;
  readonly expectedLiveHead: string;
  readonly archiveRefName: string;
  readonly confirmation: GraphModelMigrationFinalizationConfirmation | null;
};

export type GraphModelMigrationCommandOptions = {
  readonly repositoryPath: string;
  readonly dryRunRequest: DryRunGraphModelMigrationPlanRequest;
  readonly scratchRefName: string;
  readonly equivalenceBasis: GenesisEquivalenceComparisonBasis;
  readonly legacyReading: GenesisEquivalenceReading;
  readonly scratchReading: GenesisEquivalenceReading;
  readonly finalization: GraphModelMigrationCommandFinalizationOptions | null;
};

/** Result of the wired v18 graph-model migration command flow. */
export class GraphModelMigrationCommandResult {
  constructor(
    readonly dryRunPlan: DryRunGraphModelMigrationPlan,
    readonly loweringResult: GraphModelMigrationOperationLoweringResult,
    readonly scratchWriteResult: GraphModelMigrationScratchWriteResult | null,
    readonly gateResult: GenesisEquivalenceGateResult | null,
    readonly finalizationResult: GraphModelMigrationFinalizationResult | null,
  ) {
    Object.freeze(this);
  }
}

export class GraphModelMigrationCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphModelMigrationCommandError';
  }
}

/** Runs dry-run planning, lowering, scratch writing, equivalence, and optional finalization. */
export async function runGraphModelMigrationCommand(
  options: GraphModelMigrationCommandOptions,
): Promise<GraphModelMigrationCommandResult> {
  const repositoryPath = requireNonEmptyString(options.repositoryPath, 'repositoryPath');
  const dryRunRequest = requireDryRunRequest(options.dryRunRequest);
  const dryRunPlan = new DryRunGraphModelMigrationPlanner().plan(dryRunRequest);
  const loweringResult = new GraphModelMigrationOperationLowerer().lower(dryRunPlan);
  if (loweringResult.hasFatalErrors() || loweringResult.patchPlan === null) {
    return new GraphModelMigrationCommandResult(dryRunPlan, loweringResult, null, null, null);
  }

  const scratchWriteResult = await writeGraphModelMigrationScratchHistory({
    repositoryPath,
    scratchRefName: options.scratchRefName,
    patchPlan: loweringResult.patchPlan,
  });
  if (scratchWriteResult.hasFatalErrors()) {
    return new GraphModelMigrationCommandResult(dryRunPlan, loweringResult, scratchWriteResult, null, null);
  }

  const gateResult = new GenesisEquivalenceGate().evaluate(
    requireBasis(options.equivalenceBasis),
    requireReading(options.legacyReading, 'legacyReading'),
    requireReading(options.scratchReading, 'scratchReading'),
  );
  if (options.finalization === null) {
    return new GraphModelMigrationCommandResult(
      dryRunPlan,
      loweringResult,
      scratchWriteResult,
      gateResult,
      null,
    );
  }

  const finalizationResult = await runFinalization({
    repositoryPath,
    scratchWriteResult,
    gateResult,
    finalization: options.finalization,
  });
  return new GraphModelMigrationCommandResult(
    dryRunPlan,
    loweringResult,
    scratchWriteResult,
    gateResult,
    finalizationResult,
  );
}

async function runFinalization(options: {
  readonly repositoryPath: string;
  readonly scratchWriteResult: GraphModelMigrationScratchWriteResult;
  readonly gateResult: GenesisEquivalenceGateResult;
  readonly finalization: GraphModelMigrationCommandFinalizationOptions;
}): Promise<GraphModelMigrationFinalizationResult> {
  const observedLiveHead = await gitTextOrNull(options.repositoryPath, [
    'show-ref',
    '--verify',
    '--hash',
    options.finalization.liveRefName,
  ]);
  const safetyResult = new GraphModelMigrationFinalizationSafety().evaluate(
    new GraphModelMigrationFinalizationRequest({
      liveRefName: options.finalization.liveRefName,
      expectedLiveHead: options.finalization.expectedLiveHead,
      observedLiveHead,
      scratchRef: options.scratchWriteResult.scratchRef,
      scratchHead: options.scratchWriteResult.scratchHead,
      archiveRefName: options.finalization.archiveRefName,
      confirmation: options.finalization.confirmation,
      gateResult: options.gateResult,
    }),
  );
  return await finalizeGraphModelMigration({
    repositoryPath: options.repositoryPath,
    safetyResult,
  });
}

function requireDryRunRequest(
  request: DryRunGraphModelMigrationPlanRequest,
): DryRunGraphModelMigrationPlanRequest {
  if (!(request instanceof DryRunGraphModelMigrationPlanRequest)) {
    throw new GraphModelMigrationCommandError('dryRunRequest must be a DryRunGraphModelMigrationPlanRequest');
  }
  return request;
}

function requireBasis(
  basis: GenesisEquivalenceComparisonBasis,
): GenesisEquivalenceComparisonBasis {
  if (!(basis instanceof GenesisEquivalenceComparisonBasis)) {
    throw new GraphModelMigrationCommandError('equivalenceBasis must be a GenesisEquivalenceComparisonBasis');
  }
  return basis;
}

function requireReading(reading: GenesisEquivalenceReading, label: string): GenesisEquivalenceReading {
  if (!(reading instanceof GenesisEquivalenceReading)) {
    throw new GraphModelMigrationCommandError(`${label} must be a GenesisEquivalenceReading`);
  }
  return reading;
}

function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new GraphModelMigrationCommandError(`${name} must be a non-empty string`);
  }
  return value;
}

async function gitTextOrNull(cwd: string, args: readonly string[]): Promise<string | null> {
  const result = await runMigrationGit(cwd, args, null);
  if (!result.ok()) {
    return null;
  }
  return result.stdout.trim();
}
