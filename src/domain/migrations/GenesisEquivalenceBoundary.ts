import WarpError from '../errors/WarpError.ts';

export type GenesisEquivalenceBoundaryFields = {
  readonly writerId: string;
  readonly patchId: string;
  readonly operationIndex: number;
};

/** Runtime-backed patch boundary evidence for a genesis equivalence fact. */
export default class GenesisEquivalenceBoundary {
  readonly writerId: string;
  readonly patchId: string;
  readonly operationIndex: number;

  constructor(fields: GenesisEquivalenceBoundaryFields) {
    const checkedFields = requireFields(fields);
    this.writerId = requireNonEmptyString(checkedFields.writerId, 'writerId');
    this.patchId = requireNonEmptyString(checkedFields.patchId, 'patchId');
    this.operationIndex = requireOperationIndex(checkedFields.operationIndex);
    Object.freeze(this);
  }

  /** Returns a deterministic boundary key. */
  toKey(): string {
    return `${this.writerId}\0${this.patchId}\0${this.operationIndex}`;
  }
}

/** Validates the constructor envelope. */
function requireFields(
  fields: GenesisEquivalenceBoundaryFields | null | undefined,
): GenesisEquivalenceBoundaryFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GenesisEquivalenceBoundary fields must be provided', 'E_VALIDATION');
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

/** Validates a deterministic operation index. */
function requireOperationIndex(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new WarpError('operationIndex must be a non-negative safe integer', 'E_VALIDATION');
  }
  return value;
}
