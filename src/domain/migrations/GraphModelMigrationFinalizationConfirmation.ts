import WarpError from '../errors/WarpError.ts';

export const V18_GRAPH_MODEL_FINALIZATION_CONFIRMATION =
  'CONFIRM_GRAPH_MODEL_MIGRATION_FINALIZATION';

export type GraphModelMigrationFinalizationConfirmationFields = {
  readonly token: string;
};

/** Explicit operator confirmation for graph-model migration finalization. */
export default class GraphModelMigrationFinalizationConfirmation {
  readonly token: string;

  constructor(fields: GraphModelMigrationFinalizationConfirmationFields) {
    const checkedFields = requireFields(fields);
    this.token = requireFinalizationToken(checkedFields.token);
    Object.freeze(this);
  }
}

function requireFields(
  fields: GraphModelMigrationFinalizationConfirmationFields | null | undefined,
): GraphModelMigrationFinalizationConfirmationFields {
  if (fields === null || fields === undefined) {
    throw new WarpError(
      'GraphModelMigrationFinalizationConfirmation fields must be provided',
      'E_VALIDATION',
    );
  }
  return fields;
}

function requireFinalizationToken(token: string): string {
  if (token !== V18_GRAPH_MODEL_FINALIZATION_CONFIRMATION) {
    throw new WarpError('finalization confirmation token is invalid', 'E_VALIDATION');
  }
  return token;
}
