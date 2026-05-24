import GraphModelMigrationScratchRef from './GraphModelMigrationScratchRef.ts';
import WarpError from '../errors/WarpError.ts';

export type GraphModelMigrationRuntimeReplayRequestFields = {
  readonly graphId: string;
  readonly writerId: string;
  readonly scratchRef: GraphModelMigrationScratchRef;
  readonly scratchHead: string;
};

/** Request to replay scratch migration output through normal graph runtime. */
export default class GraphModelMigrationRuntimeReplayRequest {
  readonly graphId: string;
  readonly writerId: string;
  readonly scratchRef: GraphModelMigrationScratchRef;
  readonly scratchHead: string;

  constructor(fields: GraphModelMigrationRuntimeReplayRequestFields) {
    const checkedFields = requireFields(fields);
    this.graphId = requireNonEmptyString(checkedFields.graphId, 'graphId');
    this.writerId = requireNonEmptyString(checkedFields.writerId, 'writerId');
    this.scratchRef = requireScratchRef(checkedFields.scratchRef);
    this.scratchHead = requireNonEmptyString(checkedFields.scratchHead, 'scratchHead');
    Object.freeze(this);
  }
}

function requireFields(
  fields: GraphModelMigrationRuntimeReplayRequestFields | null | undefined,
): GraphModelMigrationRuntimeReplayRequestFields {
  if (fields === null || fields === undefined) {
    throw new WarpError(
      'GraphModelMigrationRuntimeReplayRequest fields must be provided',
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

function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError(`${name} must be a non-empty string`, 'E_VALIDATION');
  }
  return value;
}
