import GraphModelMigrationRuntimeReplayRequest
  from '../../../../src/domain/migrations/GraphModelMigrationRuntimeReplayRequest.ts';
import {
  GraphModelMigrationScratchRuntimeReplayerError,
  GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_INVALID_OPERATION_TARGET,
} from './GraphModelMigrationScratchRuntimeReplayErrors.ts';
import { runMigrationGit } from './GitMigrationCommandRunner.ts';

export async function observedGraphModelMigrationScratchHead(
  repositoryPath: string,
  request: GraphModelMigrationRuntimeReplayRequest,
): Promise<string | null> {
  const result = await runMigrationGit(
    repositoryPath,
    ['show-ref', '--verify', '--hash', request.scratchRef.refName],
    null,
  );
  if (!result.ok()) {
    return null;
  }
  const observedHead = result.stdout.trim();
  return observedHead.length === 0 ? null : observedHead;
}

export function requireGraphModelMigrationRuntimeReplayRequest(
  request: GraphModelMigrationRuntimeReplayRequest,
): GraphModelMigrationRuntimeReplayRequest {
  if (!(request instanceof GraphModelMigrationRuntimeReplayRequest)) {
    throw new GraphModelMigrationScratchRuntimeReplayerError(
      GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_INVALID_OPERATION_TARGET,
      'request must be a GraphModelMigrationRuntimeReplayRequest',
    );
  }
  return request;
}

export function requireGraphModelMigrationRuntimeReplayString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new GraphModelMigrationScratchRuntimeReplayerError(
      GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_INVALID_OPERATION_TARGET,
      `${name} must be a non-empty string`,
    );
  }
  return value;
}
