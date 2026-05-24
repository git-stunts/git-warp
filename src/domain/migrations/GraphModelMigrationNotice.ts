import WarpError from '../errors/WarpError.ts';

const WARNING_NOTICE = 'warning';
const FATAL_NOTICE = 'fatal';

export type GraphModelMigrationNoticeKind = typeof WARNING_NOTICE | typeof FATAL_NOTICE;

export type GraphModelMigrationNoticeFields = {
  readonly kind: GraphModelMigrationNoticeKind;
  readonly code: string;
  readonly message: string;
};

/** Runtime-backed warning or fatal planning notice for graph-model migration. */
export default class GraphModelMigrationNotice {
  readonly kind: GraphModelMigrationNoticeKind;
  readonly code: string;
  readonly message: string;

  constructor(fields: GraphModelMigrationNoticeFields) {
    const checkedFields = requireFields(fields);
    this.kind = requireKind(checkedFields.kind);
    this.code = requireNonEmptyString(checkedFields.code, 'code');
    this.message = requireNonEmptyString(checkedFields.message, 'message');
    Object.freeze(this);
  }

  /** Builds a warning notice. */
  static warning(code: string, message: string): GraphModelMigrationNotice {
    return new GraphModelMigrationNotice({ kind: WARNING_NOTICE, code, message });
  }

  /** Builds a fatal planning notice. */
  static fatal(code: string, message: string): GraphModelMigrationNotice {
    return new GraphModelMigrationNotice({ kind: FATAL_NOTICE, code, message });
  }

  /** Returns true when this notice blocks planning. */
  isFatal(): boolean {
    return this.kind === FATAL_NOTICE;
  }
}

/** Validates the constructor envelope. */
function requireFields(
  fields: GraphModelMigrationNoticeFields | null | undefined,
): GraphModelMigrationNoticeFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GraphModelMigrationNotice fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

/** Validates a notice kind. */
function requireKind(kind: GraphModelMigrationNoticeKind): GraphModelMigrationNoticeKind {
  if (kind !== WARNING_NOTICE && kind !== FATAL_NOTICE) {
    throw new WarpError('GraphModelMigrationNotice kind must be warning or fatal', 'E_VALIDATION');
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
