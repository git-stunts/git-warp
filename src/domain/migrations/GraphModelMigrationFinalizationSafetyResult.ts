import GraphModelMigrationFinalizationRequest from './GraphModelMigrationFinalizationRequest.ts';
import GraphModelMigrationNotice from './GraphModelMigrationNotice.ts';
import WarpError from '../errors/WarpError.ts';

export type GraphModelMigrationFinalizationSafetyResultFields = {
  readonly request: GraphModelMigrationFinalizationRequest;
  readonly fatalErrors: readonly GraphModelMigrationNotice[];
};

/** Pure safety decision for graph-model migration finalization. */
export default class GraphModelMigrationFinalizationSafetyResult {
  readonly request: GraphModelMigrationFinalizationRequest;
  readonly fatalErrors: readonly GraphModelMigrationNotice[];

  constructor(fields: GraphModelMigrationFinalizationSafetyResultFields) {
    const checkedFields = requireFields(fields);
    this.request = requireRequest(checkedFields.request);
    this.fatalErrors = freezeFatalNotices(checkedFields.fatalErrors);
    Object.freeze(this);
  }

  /** Returns true when finalization may move to the Git ref update step. */
  allowsFinalization(): boolean {
    return this.fatalErrors.length === 0;
  }
}

function requireFields(
  fields: GraphModelMigrationFinalizationSafetyResultFields | null | undefined,
): GraphModelMigrationFinalizationSafetyResultFields {
  if (fields === null || fields === undefined) {
    throw new WarpError(
      'GraphModelMigrationFinalizationSafetyResult fields must be provided',
      'E_VALIDATION',
    );
  }
  return fields;
}

function requireRequest(
  request: GraphModelMigrationFinalizationRequest,
): GraphModelMigrationFinalizationRequest {
  if (!(request instanceof GraphModelMigrationFinalizationRequest)) {
    throw new WarpError('request must be a GraphModelMigrationFinalizationRequest', 'E_VALIDATION');
  }
  return request;
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
