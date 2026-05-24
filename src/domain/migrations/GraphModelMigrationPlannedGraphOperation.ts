import WarpError from '../errors/WarpError.ts';

const PLANNED_NODE_RECORD = 'node-record';
const PLANNED_EDGE_RECORD = 'edge-record';
const PLANNED_PROPERTY = 'property';
const PLANNED_CONTENT_ATTACHMENT = 'content-attachment';

export type GraphModelMigrationPlannedGraphOperationKind =
  | typeof PLANNED_NODE_RECORD
  | typeof PLANNED_EDGE_RECORD
  | typeof PLANNED_PROPERTY
  | typeof PLANNED_CONTENT_ATTACHMENT;

export type GraphModelMigrationPlannedGraphOperationFields = {
  readonly kind: GraphModelMigrationPlannedGraphOperationKind;
  readonly sourceKey: string;
  readonly targetKey: string;
};

/** Runtime-backed dry-run graph operation fact, not a write instruction. */
export default class GraphModelMigrationPlannedGraphOperation {
  readonly kind: GraphModelMigrationPlannedGraphOperationKind;
  readonly sourceKey: string;
  readonly targetKey: string;

  constructor(fields: GraphModelMigrationPlannedGraphOperationFields) {
    const checkedFields = requireFields(fields);
    this.kind = requireKind(checkedFields.kind);
    this.sourceKey = requireNonEmptyString(checkedFields.sourceKey, 'sourceKey');
    this.targetKey = requireNonEmptyString(checkedFields.targetKey, 'targetKey');
    Object.freeze(this);
  }

  /** Creates a planned node-record operation fact. */
  static nodeRecord(sourceKey: string, targetKey: string): GraphModelMigrationPlannedGraphOperation {
    return new GraphModelMigrationPlannedGraphOperation({
      kind: PLANNED_NODE_RECORD,
      sourceKey,
      targetKey,
    });
  }

  /** Creates a planned edge-record operation fact. */
  static edgeRecord(sourceKey: string, targetKey: string): GraphModelMigrationPlannedGraphOperation {
    return new GraphModelMigrationPlannedGraphOperation({
      kind: PLANNED_EDGE_RECORD,
      sourceKey,
      targetKey,
    });
  }

  /** Creates a planned property operation fact. */
  static property(sourceKey: string, targetKey: string): GraphModelMigrationPlannedGraphOperation {
    return new GraphModelMigrationPlannedGraphOperation({
      kind: PLANNED_PROPERTY,
      sourceKey,
      targetKey,
    });
  }

  /** Creates a planned content-attachment operation fact. */
  static contentAttachment(
    sourceKey: string,
    targetKey: string,
  ): GraphModelMigrationPlannedGraphOperation {
    return new GraphModelMigrationPlannedGraphOperation({
      kind: PLANNED_CONTENT_ATTACHMENT,
      sourceKey,
      targetKey,
    });
  }

  /** Returns a deterministic operation key. */
  toKey(): string {
    return `${this.kind}\0${this.sourceKey}\0${this.targetKey}`;
  }
}

/** Validates the constructor envelope. */
function requireFields(
  fields: GraphModelMigrationPlannedGraphOperationFields | null | undefined,
): GraphModelMigrationPlannedGraphOperationFields {
  if (fields === null || fields === undefined) {
    throw new WarpError(
      'GraphModelMigrationPlannedGraphOperation fields must be provided',
      'E_VALIDATION',
    );
  }
  return fields;
}

/** Validates a planned operation kind. */
function requireKind(
  kind: GraphModelMigrationPlannedGraphOperationKind,
): GraphModelMigrationPlannedGraphOperationKind {
  if (
    kind !== PLANNED_NODE_RECORD
    && kind !== PLANNED_EDGE_RECORD
    && kind !== PLANNED_PROPERTY
    && kind !== PLANNED_CONTENT_ATTACHMENT
  ) {
    throw new WarpError(
      'GraphModelMigrationPlannedGraphOperation kind is unsupported',
      'E_VALIDATION',
    );
  }
  return kind;
}

/** Validates a required non-empty string. */
function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError(`${name} must be a non-empty string`, 'E_VALIDATION');
  }
  return value;
}
