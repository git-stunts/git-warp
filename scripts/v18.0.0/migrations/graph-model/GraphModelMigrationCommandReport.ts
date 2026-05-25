import { GraphModelMigrationCommandResult }
  from './GraphModelMigrationCommand.ts';
import GraphModelMigrationNotice
  from '../../../../src/domain/migrations/GraphModelMigrationNotice.ts';

/** Formats a deterministic operator report for the v18 graph-model migration command. */
export function formatGraphModelMigrationCommandReport(
  result: GraphModelMigrationCommandResult,
): string {
  const checkedResult = requireCommandResult(result);
  return [
    'git-warp v18 graph-model migration report',
    ...dryRunLines(checkedResult),
    ...loweringLines(checkedResult),
    ...scratchLines(checkedResult),
    ...equivalenceLines(checkedResult),
    ...finalizationLines(checkedResult),
  ].join('\n');
}

function dryRunLines(result: GraphModelMigrationCommandResult): readonly string[] {
  return Object.freeze([
    `dryRun: ${result.dryRunPlan.hasFatalErrors() ? 'blocked' : 'passed'}`,
    `plannedOperations: ${result.dryRunPlan.plannedOperations.length}`,
  ]);
}

function loweringLines(result: GraphModelMigrationCommandResult): readonly string[] {
  if (result.loweringResult.patchPlan === null) {
    return Object.freeze([
      `lowering: ${result.loweringResult.hasFatalErrors() ? 'blocked' : 'missing'}`,
      'loweredOperations: 0',
    ]);
  }
  return Object.freeze([
    `lowering: ${result.loweringResult.hasFatalErrors() ? 'blocked' : 'passed'}`,
    `loweredOperations: ${result.loweringResult.patchPlan.operations.length}`,
  ]);
}

function scratchLines(result: GraphModelMigrationCommandResult): readonly string[] {
  if (result.scratchWriteResult === null) {
    return Object.freeze(['scratch: skipped']);
  }
  return Object.freeze([
    `scratch: ${result.scratchWriteResult.hasFatalErrors() ? 'blocked' : 'written'}`,
    `scratchRef: ${displayNullable(result.scratchWriteResult.scratchRef?.refName ?? null)}`,
    `scratchHead: ${displayNullable(result.scratchWriteResult.scratchHead)}`,
    `scratchPatches: ${result.scratchWriteResult.writtenPatches.length}`,
  ]);
}

function equivalenceLines(result: GraphModelMigrationCommandResult): readonly string[] {
  if (result.gateResult === null) {
    return Object.freeze(['equivalence: skipped']);
  }
  return Object.freeze([
    `equivalence: ${result.gateResult.allowsPromotion() ? 'passed' : 'blocked'}`,
    `mismatches: ${result.gateResult.proofResult.summary.mismatchCount}`,
    `legacyFacts: ${result.gateResult.proofResult.summary.legacyFactCount}`,
    `migratedFacts: ${result.gateResult.proofResult.summary.migratedFactCount}`,
  ]);
}

function finalizationLines(result: GraphModelMigrationCommandResult): readonly string[] {
  if (result.finalizationResult === null) {
    return Object.freeze(['finalization: skipped']);
  }
  const evidence = finalizationEvidenceLines(result);
  if (result.finalizationResult.fatalErrors.length > 0) {
    return Object.freeze([
      `finalization: ${result.finalizationResult.status}`,
      ...evidence,
      ...fatalNoticeLines(result.finalizationResult.fatalErrors),
    ]);
  }
  return Object.freeze([
    `finalization: ${result.finalizationResult.status}`,
    ...evidence,
  ]);
}

function finalizationEvidenceLines(result: GraphModelMigrationCommandResult): readonly string[] {
  const finalization = result.finalizationResult;
  if (finalization === null) {
    return Object.freeze([]);
  }
  return Object.freeze([
    `liveRef: ${finalization.liveRefName}`,
    `archiveRef: ${displayNullable(finalization.archiveRefName)}`,
    `previousLiveHead: ${displayNullable(finalization.previousLiveHead)}`,
    `archiveHead: ${displayNullable(finalization.previousLiveHead)}`,
    `finalizedLiveHead: ${displayNullable(finalization.finalizedLiveHead)}`,
    `archivePreserved: ${finalization.previousLiveHead === null ? 'no' : 'yes'}`,
  ]);
}

function fatalNoticeLines(fatalErrors: readonly GraphModelMigrationNotice[]): readonly string[] {
  const lines = ['fatalErrors:'];
  for (const notice of fatalErrors) {
    lines.push(`- ${notice.code}: ${notice.message}`);
  }
  return Object.freeze(lines);
}

function displayNullable(value: string | null): string {
  if (value === null) {
    return '(none)';
  }
  return value;
}

function requireCommandResult(
  result: GraphModelMigrationCommandResult,
): GraphModelMigrationCommandResult {
  if (!(result instanceof GraphModelMigrationCommandResult)) {
    throw new GraphModelMigrationCommandReportError('result must be a GraphModelMigrationCommandResult');
  }
  return result;
}

export class GraphModelMigrationCommandReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphModelMigrationCommandReportError';
  }
}
