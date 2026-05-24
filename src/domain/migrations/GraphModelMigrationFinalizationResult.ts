import GraphModelMigrationNotice from './GraphModelMigrationNotice.ts';
import WarpError from '../errors/WarpError.ts';

export const GRAPH_MODEL_MIGRATION_FINALIZATION_BLOCKED = 'blocked';
export const GRAPH_MODEL_MIGRATION_FINALIZATION_PARTIAL_ARCHIVE = 'partial-archive';
export const GRAPH_MODEL_MIGRATION_FINALIZATION_COMPLETED = 'completed';

export type GraphModelMigrationFinalizationStatus =
  | typeof GRAPH_MODEL_MIGRATION_FINALIZATION_BLOCKED
  | typeof GRAPH_MODEL_MIGRATION_FINALIZATION_PARTIAL_ARCHIVE
  | typeof GRAPH_MODEL_MIGRATION_FINALIZATION_COMPLETED;

export type GraphModelMigrationFinalizationResultFields = {
  readonly status: GraphModelMigrationFinalizationStatus;
  readonly liveRefName: string;
  readonly archiveRefName: string | null;
  readonly previousLiveHead: string | null;
  readonly finalizedLiveHead: string | null;
  readonly fatalErrors: readonly GraphModelMigrationNotice[];
};

/** Result of an archive-preserving graph-model migration finalization attempt. */
export default class GraphModelMigrationFinalizationResult {
  readonly status: GraphModelMigrationFinalizationStatus;
  readonly liveRefName: string;
  readonly archiveRefName: string | null;
  readonly previousLiveHead: string | null;
  readonly finalizedLiveHead: string | null;
  readonly fatalErrors: readonly GraphModelMigrationNotice[];

  constructor(fields: GraphModelMigrationFinalizationResultFields) {
    const checkedFields = requireFields(fields);
    this.status = requireStatus(checkedFields.status);
    this.liveRefName = requireNonEmptyString(checkedFields.liveRefName, 'liveRefName');
    this.archiveRefName = requireOptionalString(checkedFields.archiveRefName, 'archiveRefName');
    this.previousLiveHead = requireOptionalString(checkedFields.previousLiveHead, 'previousLiveHead');
    this.finalizedLiveHead = requireOptionalString(checkedFields.finalizedLiveHead, 'finalizedLiveHead');
    this.fatalErrors = freezeFatalNotices(checkedFields.fatalErrors);
    requireStatusMatchesEvidence(this);
    Object.freeze(this);
  }

  /** Returns true when the live ref was advanced to the scratch head. */
  finalized(): boolean {
    return this.status === GRAPH_MODEL_MIGRATION_FINALIZATION_COMPLETED;
  }
}

function requireFields(
  fields: GraphModelMigrationFinalizationResultFields | null | undefined,
): GraphModelMigrationFinalizationResultFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GraphModelMigrationFinalizationResult fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

function requireStatus(
  status: GraphModelMigrationFinalizationStatus,
): GraphModelMigrationFinalizationStatus {
  if (status !== GRAPH_MODEL_MIGRATION_FINALIZATION_BLOCKED
    && status !== GRAPH_MODEL_MIGRATION_FINALIZATION_PARTIAL_ARCHIVE
    && status !== GRAPH_MODEL_MIGRATION_FINALIZATION_COMPLETED) {
    throw new WarpError('finalization status is unsupported', 'E_VALIDATION');
  }
  return status;
}

function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError(`${name} must be a non-empty string`, 'E_VALIDATION');
  }
  return value;
}

function requireOptionalString(value: string | null, name: string): string | null {
  if (value !== null && (typeof value !== 'string' || value.length === 0)) {
    throw new WarpError(`${name} must be a non-empty string or null`, 'E_VALIDATION');
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

function requireStatusMatchesEvidence(result: GraphModelMigrationFinalizationResult): void {
  if (result.status === GRAPH_MODEL_MIGRATION_FINALIZATION_COMPLETED) {
    requireCompletedEvidence(result);
    return;
  }
  if (result.fatalErrors.length === 0) {
    throw new WarpError('non-completed finalization results require fatal errors', 'E_VALIDATION');
  }
}

function requireCompletedEvidence(result: GraphModelMigrationFinalizationResult): void {
  if (result.fatalErrors.length > 0) {
    throw new WarpError('completed finalization results must not include fatal errors', 'E_VALIDATION');
  }
  if (result.archiveRefName === null || result.previousLiveHead === null || result.finalizedLiveHead === null) {
    throw new WarpError('completed finalization results require archive and head evidence', 'E_VALIDATION');
  }
}
