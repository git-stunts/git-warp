import WarpError from '../errors/WarpError.ts';

export type GraphModelMigrationPatchDescriptorFields = {
  readonly patchId: string;
  readonly writerId: string;
  readonly writerSequence: number;
};

/** Runtime-backed source patch descriptor for graph-model migration planning. */
export default class GraphModelMigrationPatchDescriptor {
  readonly patchId: string;
  readonly writerId: string;
  readonly writerSequence: number;

  constructor(fields: GraphModelMigrationPatchDescriptorFields) {
    const checkedFields = requireFields(fields);
    this.patchId = requireNonEmptyString(checkedFields.patchId, 'patchId');
    this.writerId = requireNonEmptyString(checkedFields.writerId, 'writerId');
    this.writerSequence = requireWriterSequence(checkedFields.writerSequence);
    Object.freeze(this);
  }

  /** Returns the per-writer sequence uniqueness key. */
  writerSequenceKey(): string {
    return `${this.writerId}\0${this.writerSequence}`;
  }
}

/** Validates the constructor envelope. */
function requireFields(
  fields: GraphModelMigrationPatchDescriptorFields | null | undefined,
): GraphModelMigrationPatchDescriptorFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GraphModelMigrationPatchDescriptor fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

/** Validates a required non-empty string. */
function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError(`${name} must be a non-empty string`, 'E_VALIDATION');
  }
  return value;
}

/** Validates a deterministic per-writer sequence number. */
function requireWriterSequence(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new WarpError('writerSequence must be a non-negative safe integer', 'E_VALIDATION');
  }
  return value;
}
