import GraphModelMigrationNotice
  from '../../../../src/domain/migrations/GraphModelMigrationNotice.ts';
import {
  GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_FAILED,
} from '../../../../src/domain/migrations/GraphModelMigrationRuntimeReplayResult.ts';
import { formatGraphModelMigrationCommandReport }
  from './GraphModelMigrationCommandReport.ts';
import { V17GoldenGraphFixtureWetRunHarnessResult }
  from './V17GoldenGraphFixtureWetRunHarness.ts';

/** Formats deterministic operator evidence for a v17 fixture wet run. */
export function formatV17GoldenGraphFixtureWetRunReport(
  result: V17GoldenGraphFixtureWetRunHarnessResult,
): string {
  const checkedResult = requireHarnessResult(result);
  return [
    'git-warp v18 v17 fixture wet-run report',
    `fixtureId: ${checkedResult.restoreResult.manifest.fixtureId}`,
    `graphId: ${checkedResult.restoreResult.manifest.graphId}`,
    `sourceVersion: ${checkedResult.restoreResult.manifest.sourceVersion}`,
    `restoredRefs: ${checkedResult.restoreResult.restoredRefs.length}`,
    ...restoredRefLines(checkedResult),
    ...commandLines(checkedResult),
    ...runtimeReplayLines(checkedResult),
  ].join('\n');
}

function restoredRefLines(result: V17GoldenGraphFixtureWetRunHarnessResult): readonly string[] {
  return Object.freeze(result.restoreResult.restoredRefs.map(
    (ref) => `restoredRef: ${ref.refName} ${ref.head} patches=${ref.patchCount}`,
  ));
}

function commandLines(result: V17GoldenGraphFixtureWetRunHarnessResult): readonly string[] {
  return Object.freeze(formatGraphModelMigrationCommandReport(result.commandResult)
    .split('\n')
    .map((line) => `command.${line}`));
}

function runtimeReplayLines(result: V17GoldenGraphFixtureWetRunHarnessResult): readonly string[] {
  const runtimeReplay = result.runtimeReplayResult;
  if (runtimeReplay === null) {
    return Object.freeze(['runtimeReplay: skipped']);
  }
  const lines = [
    `runtimeReplay: ${runtimeReplay.status}`,
    `runtimeReplayOperations: ${runtimeReplay.replayedOperationCount}`,
    `runtimeReplayWitness: ${runtimeReplay.witness}`,
  ];
  if (runtimeReplay.status === GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_FAILED) {
    lines.push('runtimeReplayFatalErrors:');
    lines.push(...fatalNoticeLines(runtimeReplay.fatalErrors));
  }
  return Object.freeze(lines);
}

function fatalNoticeLines(fatalErrors: readonly GraphModelMigrationNotice[]): readonly string[] {
  return Object.freeze(fatalErrors.map((notice) => `- ${notice.code}: ${notice.message}`));
}

function requireHarnessResult(
  result: V17GoldenGraphFixtureWetRunHarnessResult,
): V17GoldenGraphFixtureWetRunHarnessResult {
  if (!(result instanceof V17GoldenGraphFixtureWetRunHarnessResult)) {
    throw new V17GoldenGraphFixtureWetRunReportError(
      'result must be a V17GoldenGraphFixtureWetRunHarnessResult',
    );
  }
  return result;
}

export class V17GoldenGraphFixtureWetRunReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'V17GoldenGraphFixtureWetRunReportError';
  }
}
