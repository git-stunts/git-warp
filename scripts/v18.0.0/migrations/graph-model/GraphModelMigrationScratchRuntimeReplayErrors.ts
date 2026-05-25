export const GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_SCRATCH_REF_UNREADABLE =
  'E_RUNTIME_REPLAY_SCRATCH_REF_UNREADABLE';
export const GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_SCRATCH_HEAD_CHANGED =
  'E_RUNTIME_REPLAY_SCRATCH_HEAD_CHANGED';
export const GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_INVALID_OPERATION_TARGET =
  'E_RUNTIME_REPLAY_INVALID_OPERATION_TARGET';

export type GraphModelMigrationScratchRuntimeReplayErrorCode =
  | typeof GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_SCRATCH_REF_UNREADABLE
  | typeof GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_SCRATCH_HEAD_CHANGED
  | typeof GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_INVALID_OPERATION_TARGET;

export class GraphModelMigrationScratchRuntimeReplayerError extends Error {
  readonly code: GraphModelMigrationScratchRuntimeReplayErrorCode;

  constructor(code: GraphModelMigrationScratchRuntimeReplayErrorCode, message: string) {
    super(message);
    this.name = 'GraphModelMigrationScratchRuntimeReplayerError';
    this.code = code;
    Object.freeze(this);
  }
}
