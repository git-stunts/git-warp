import GraphModelMigrationNotice from './GraphModelMigrationNotice.ts';
import GraphModelMigrationRuntimeReplayRequest from './GraphModelMigrationRuntimeReplayRequest.ts';
import WarpError from '../errors/WarpError.ts';

export const GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_PASSED = 'passed';
export const GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_FAILED = 'failed';

export type GraphModelMigrationRuntimeReplayStatus =
  | typeof GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_PASSED
  | typeof GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_FAILED;

export type GraphModelMigrationRuntimeReplayResultFields = {
  readonly request: GraphModelMigrationRuntimeReplayRequest;
  readonly status: GraphModelMigrationRuntimeReplayStatus;
  readonly witness: string;
  readonly replayedOperationCount: number;
  readonly fatalErrors: readonly GraphModelMigrationNotice[];
};

/** Result of opening migrated scratch output through normal graph runtime. */
export default class GraphModelMigrationRuntimeReplayResult {
  readonly request: GraphModelMigrationRuntimeReplayRequest;
  readonly status: GraphModelMigrationRuntimeReplayStatus;
  readonly witness: string;
  readonly replayedOperationCount: number;
  readonly fatalErrors: readonly GraphModelMigrationNotice[];

  constructor(fields: GraphModelMigrationRuntimeReplayResultFields) {
    const checkedFields = requireFields(fields);
    this.request = requireRequest(checkedFields.request);
    this.status = requireStatus(checkedFields.status);
    this.witness = requireNonEmptyString(checkedFields.witness, 'witness');
    this.replayedOperationCount = requireNonNegativeSafeInteger(
      checkedFields.replayedOperationCount,
      'replayedOperationCount',
    );
    this.fatalErrors = freezeFatalNotices(checkedFields.fatalErrors);
    requireStatusMatchesFatalErrors(this.status, this.fatalErrors);
    Object.freeze(this);
  }

  /** Returns true when scratch output was materialized by the production runtime. */
  allowsFinalization(): boolean {
    return this.status === GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_PASSED;
  }
}

function requireFields(
  fields: GraphModelMigrationRuntimeReplayResultFields | null | undefined,
): GraphModelMigrationRuntimeReplayResultFields {
  if (fields === null || fields === undefined) {
    throw new WarpError(
      'GraphModelMigrationRuntimeReplayResult fields must be provided',
      'E_VALIDATION',
    );
  }
  return fields;
}

function requireRequest(
  request: GraphModelMigrationRuntimeReplayRequest,
): GraphModelMigrationRuntimeReplayRequest {
  if (!(request instanceof GraphModelMigrationRuntimeReplayRequest)) {
    throw new WarpError('request must be a GraphModelMigrationRuntimeReplayRequest', 'E_VALIDATION');
  }
  return request;
}

function requireStatus(status: GraphModelMigrationRuntimeReplayStatus): GraphModelMigrationRuntimeReplayStatus {
  if (
    status !== GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_PASSED
    && status !== GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_FAILED
  ) {
    throw new WarpError('runtime replay status is unsupported', 'E_VALIDATION');
  }
  return status;
}

function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError(`${name} must be a non-empty string`, 'E_VALIDATION');
  }
  return value;
}

function requireNonNegativeSafeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new WarpError(`${name} must be a non-negative safe integer`, 'E_VALIDATION');
  }
  return value;
}

function freezeFatalNotices(
  fatalErrors: readonly GraphModelMigrationNotice[],
): readonly GraphModelMigrationNotice[] {
  if (!Array.isArray(fatalErrors)) {
    throw new WarpError('fatalErrors must be an array', 'E_VALIDATION');
  }
  return Object.freeze(fatalErrors.map(requireFatalNotice));
}

function requireFatalNotice(notice: GraphModelMigrationNotice): GraphModelMigrationNotice {
  if (!(notice instanceof GraphModelMigrationNotice) || !notice.isFatal()) {
    throw new WarpError('fatalErrors must contain fatal migration notices', 'E_VALIDATION');
  }
  return notice;
}

function requireStatusMatchesFatalErrors(
  status: GraphModelMigrationRuntimeReplayStatus,
  fatalErrors: readonly GraphModelMigrationNotice[],
): void {
  if (status === GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_PASSED && fatalErrors.length > 0) {
    throw new WarpError('passed runtime replay must not contain fatal errors', 'E_VALIDATION');
  }
  if (status === GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_FAILED && fatalErrors.length === 0) {
    throw new WarpError('failed runtime replay must contain fatal errors', 'E_VALIDATION');
  }
}
