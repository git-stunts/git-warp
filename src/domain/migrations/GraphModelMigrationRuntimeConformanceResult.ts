import GraphModelMigrationNotice from './GraphModelMigrationNotice.ts';
import GraphModelMigrationScratchRef from './GraphModelMigrationScratchRef.ts';
import WarpError from '../errors/WarpError.ts';

export const GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_PASSED = 'passed';
export const GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_FAILED = 'failed';

export type GraphModelMigrationRuntimeConformanceStatus =
  | typeof GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_PASSED
  | typeof GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_FAILED;

export type GraphModelMigrationRuntimeConformanceResultFields = {
  readonly scratchRef: GraphModelMigrationScratchRef;
  readonly scratchHead: string;
  readonly status: GraphModelMigrationRuntimeConformanceStatus;
  readonly witness: string;
  readonly fatalErrors: readonly GraphModelMigrationNotice[];
};

/** Runtime conformance evidence for post-migration scratch history. */
export default class GraphModelMigrationRuntimeConformanceResult {
  readonly scratchRef: GraphModelMigrationScratchRef;
  readonly scratchHead: string;
  readonly status: GraphModelMigrationRuntimeConformanceStatus;
  readonly witness: string;
  readonly fatalErrors: readonly GraphModelMigrationNotice[];

  constructor(fields: GraphModelMigrationRuntimeConformanceResultFields) {
    const checkedFields = requireFields(fields);
    this.scratchRef = requireScratchRef(checkedFields.scratchRef);
    this.scratchHead = requireNonEmptyString(checkedFields.scratchHead, 'scratchHead');
    this.status = requireStatus(checkedFields.status);
    this.witness = requireNonEmptyString(checkedFields.witness, 'witness');
    this.fatalErrors = freezeFatalNotices(checkedFields.fatalErrors);
    requireStatusMatchesFatalErrors(this.status, this.fatalErrors);
    Object.freeze(this);
  }

  /** Returns true when scratch output is proven runtime-readable. */
  allowsFinalization(): boolean {
    return this.status === GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_PASSED;
  }
}

function requireFields(
  fields: GraphModelMigrationRuntimeConformanceResultFields | null | undefined,
): GraphModelMigrationRuntimeConformanceResultFields {
  if (fields === null || fields === undefined) {
    throw new WarpError(
      'GraphModelMigrationRuntimeConformanceResult fields must be provided',
      'E_VALIDATION',
    );
  }
  return fields;
}

function requireScratchRef(scratchRef: GraphModelMigrationScratchRef): GraphModelMigrationScratchRef {
  if (!(scratchRef instanceof GraphModelMigrationScratchRef)) {
    throw new WarpError('scratchRef must be a GraphModelMigrationScratchRef', 'E_VALIDATION');
  }
  return scratchRef;
}

function requireStatus(
  status: GraphModelMigrationRuntimeConformanceStatus,
): GraphModelMigrationRuntimeConformanceStatus {
  if (status !== GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_PASSED
    && status !== GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_FAILED) {
    throw new WarpError('runtime conformance status is unsupported', 'E_VALIDATION');
  }
  return status;
}

function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError(`${name} must be a non-empty string`, 'E_VALIDATION');
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
  status: GraphModelMigrationRuntimeConformanceStatus,
  fatalErrors: readonly GraphModelMigrationNotice[],
): void {
  if (status === GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_PASSED && fatalErrors.length > 0) {
    throw new WarpError('passed runtime conformance must not contain fatal errors', 'E_VALIDATION');
  }
  if (status === GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_FAILED && fatalErrors.length === 0) {
    throw new WarpError('failed runtime conformance must contain fatal errors', 'E_VALIDATION');
  }
}
