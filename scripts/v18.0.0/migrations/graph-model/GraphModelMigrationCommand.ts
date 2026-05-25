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
import GraphModelMigrationFinalizationSafetyResult
  from '../../../../src/domain/migrations/GraphModelMigrationFinalizationSafetyResult.ts';
import GraphModelMigrationNotice
  from '../../../../src/domain/migrations/GraphModelMigrationNotice.ts';
import GraphModelMigrationOperationLowerer
  from '../../../../src/domain/migrations/GraphModelMigrationOperationLowerer.ts';
import GraphModelMigrationOperationLoweringResult
  from '../../../../src/domain/migrations/GraphModelMigrationOperationLoweringResult.ts';
import GraphModelMigrationRuntimeConformanceResult
  from '../../../../src/domain/migrations/GraphModelMigrationRuntimeConformanceResult.ts';
import GraphModelMigrationScratchWriteResult
  from '../../../../src/domain/migrations/GraphModelMigrationScratchWriteResult.ts';
import { finalizeGraphModelMigration } from './GraphModelMigrationFinalizer.ts';
import { writeGraphModelMigrationScratchHistory } from './GraphModelMigrationScratchWriter.ts';
import { runMigrationGit } from './GitMigrationCommandRunner.ts';

export type GraphModelMigrationRuntimeConformanceProvider = (
  scratchWriteResult: GraphModelMigrationScratchWriteResult,
) => Promise<GraphModelMigrationRuntimeConformanceResult | null>;

export type GraphModelMigrationCommandReadingProviders = {
  readonly legacyReading: () => Promise<GenesisEquivalenceReading>;
  readonly scratchReading: (
    scratchWriteResult: GraphModelMigrationScratchWriteResult,
  ) => Promise<GenesisEquivalenceReading>;
};

export type GraphModelMigrationCommandFinalizationOptions = {
  readonly liveRefName: string;
  readonly expectedLiveHead: string;
  readonly archiveRefName: string;
  readonly confirmation: GraphModelMigrationFinalizationConfirmation | null;
  readonly runtimeConformance: GraphModelMigrationRuntimeConformanceProvider | null;
  readonly reviewedRequest?: GraphModelMigrationFinalizationRequest | null;
};

export type GraphModelMigrationCommandOptions = {
  readonly repositoryPath: string;
  readonly dryRunRequest: DryRunGraphModelMigrationPlanRequest;
  readonly scratchRefName: string;
  readonly equivalenceBasis: GenesisEquivalenceComparisonBasis;
  readonly legacyReading: GenesisEquivalenceReading | null;
  readonly scratchReading: GenesisEquivalenceReading | null;
  readonly readingProviders: GraphModelMigrationCommandReadingProviders | null;
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
  const scratchRefName = requireNonEmptyString(options.scratchRefName, 'scratchRefName');
  const dryRunRequest = requireDryRunRequest(options.dryRunRequest);
  const dryRunPlan = new DryRunGraphModelMigrationPlanner().plan(dryRunRequest);
  const loweringResult = new GraphModelMigrationOperationLowerer().lower(dryRunPlan);
  if (loweringResult.hasFatalErrors() || loweringResult.patchPlan === null) {
    return new GraphModelMigrationCommandResult(dryRunPlan, loweringResult, null, null, null);
  }

  const scratchWriteResult = await writeGraphModelMigrationScratchHistory({
    repositoryPath,
    scratchRefName,
    patchPlan: loweringResult.patchPlan,
  });
  if (scratchWriteResult.hasFatalErrors()) {
    return new GraphModelMigrationCommandResult(dryRunPlan, loweringResult, scratchWriteResult, null, null);
  }

  const readings = await resolveReadings(options, scratchWriteResult);
  const gateResult = new GenesisEquivalenceGate().evaluate(
    requireBasis(options.equivalenceBasis),
    readings.legacyReading,
    readings.scratchReading,
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

async function resolveReadings(
  options: GraphModelMigrationCommandOptions,
  scratchWriteResult: GraphModelMigrationScratchWriteResult,
): Promise<{
  readonly legacyReading: GenesisEquivalenceReading;
  readonly scratchReading: GenesisEquivalenceReading;
}> {
  if (options.readingProviders !== null) {
    return Object.freeze({
      legacyReading: requireReading(
        await options.readingProviders.legacyReading(),
        'legacyReading',
      ),
      scratchReading: requireReading(
        await options.readingProviders.scratchReading(scratchWriteResult),
        'scratchReading',
      ),
    });
  }
  return Object.freeze({
    legacyReading: requireReading(options.legacyReading, 'legacyReading'),
    scratchReading: requireReading(options.scratchReading, 'scratchReading'),
  });
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
  const request = new GraphModelMigrationFinalizationRequest({
    liveRefName: options.finalization.liveRefName,
    expectedLiveHead: options.finalization.expectedLiveHead,
    observedLiveHead,
    scratchRef: options.scratchWriteResult.scratchRef,
    scratchHead: options.scratchWriteResult.scratchHead,
    archiveRefName: options.finalization.archiveRefName,
    confirmation: options.finalization.confirmation,
    gateResult: options.gateResult,
    runtimeConformance: await runtimeConformanceFromProvider(
      options.finalization.runtimeConformance,
      options.scratchWriteResult,
    ),
  });
  const safetyResult = reviewedSafetyResult(
    new GraphModelMigrationFinalizationSafety().evaluate(request),
    options.finalization.reviewedRequest ?? null,
  );
  return await finalizeGraphModelMigration({
    repositoryPath: options.repositoryPath,
    safetyResult,
  });
}

function reviewedSafetyResult(
  safetyResult: GraphModelMigrationFinalizationSafetyResult,
  reviewedRequest: GraphModelMigrationFinalizationRequest | null,
): GraphModelMigrationFinalizationSafetyResult {
  if (reviewedRequest === null) {
    return safetyResult;
  }
  const reviewFatalErrors = finalizationReviewFatalErrors(safetyResult.request, reviewedRequest);
  if (reviewFatalErrors.length === 0) {
    return safetyResult;
  }
  return new GraphModelMigrationFinalizationSafetyResult({
    request: safetyResult.request,
    fatalErrors: reviewFatalErrors.concat(safetyResult.fatalErrors),
  });
}

function finalizationReviewFatalErrors(
  actual: GraphModelMigrationFinalizationRequest,
  reviewed: GraphModelMigrationFinalizationRequest,
): readonly GraphModelMigrationNotice[] {
  const mismatches = finalizationReviewMismatches(actual, reviewed);
  if (mismatches.length === 0) {
    return Object.freeze([]);
  }
  return Object.freeze([
    GraphModelMigrationNotice.fatal(
      'E_FINALIZATION_REVIEW_MISMATCH',
      `finalization review artifact does not match observed command evidence: ${mismatches.join(', ')}`,
    ),
  ]);
}

function finalizationReviewMismatches(
  actual: GraphModelMigrationFinalizationRequest,
  reviewed: GraphModelMigrationFinalizationRequest,
): readonly string[] {
  return Object.freeze([
    stringMismatch('liveRefName', actual.liveRefName, reviewed.liveRefName),
    stringMismatch('expectedLiveHead', actual.expectedLiveHead, reviewed.expectedLiveHead),
    stringMismatch('observedLiveHead', actual.observedLiveHead, reviewed.observedLiveHead),
    stringMismatch('scratchRef', actual.scratchRef?.refName ?? null, reviewed.scratchRef?.refName ?? null),
    stringMismatch('scratchHead', actual.scratchHead, reviewed.scratchHead),
    stringMismatch('archiveRefName', actual.archiveRefName, reviewed.archiveRefName),
    stringMismatch('confirmation', actual.confirmation?.token ?? null, reviewed.confirmation?.token ?? null),
    stringMismatch('equivalence', equivalenceSummaryKey(actual), equivalenceSummaryKey(reviewed)),
    stringMismatch('runtimeConformance', runtimeConformanceKey(actual), runtimeConformanceKey(reviewed)),
  ].filter((mismatch) => mismatch !== null));
}

function stringMismatch(label: string, actual: string | null, reviewed: string | null): string | null {
  if (actual === reviewed) {
    return null;
  }
  return label;
}

function equivalenceSummaryKey(request: GraphModelMigrationFinalizationRequest): string | null {
  const gateResult = request.gateResult;
  if (gateResult === null) {
    return null;
  }
  const summary = gateResult.proofResult.summary;
  return [
    summary.basis.toKey(),
    summary.legacyFactCount,
    summary.migratedFactCount,
    summary.mismatchCount,
  ].join('\0');
}

function runtimeConformanceKey(request: GraphModelMigrationFinalizationRequest): string | null {
  const runtimeConformance = request.runtimeConformance;
  if (runtimeConformance === null) {
    return null;
  }
  return [
    runtimeConformance.scratchRef.refName,
    runtimeConformance.scratchHead,
    runtimeConformance.status,
  ].join('\0');
}

function runtimeConformanceFromProvider(
  provider: GraphModelMigrationRuntimeConformanceProvider | null,
  scratchWriteResult: GraphModelMigrationScratchWriteResult,
): Promise<GraphModelMigrationRuntimeConformanceResult | null> {
  if (provider === null) {
    return Promise.resolve(null);
  }
  return provider(scratchWriteResult);
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

function requireReading(reading: GenesisEquivalenceReading | null, label: string): GenesisEquivalenceReading {
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
