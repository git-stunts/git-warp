import WarpError from '../errors/WarpError.ts';

export const CURRENT_ATTACHMENT_SCHEMA_VERSION = 1;

/** Runtime-backed version for graph attachment records. */
export default class AttachmentSchemaVersion {
  private readonly value: number;

  constructor(value: number) {
    this.value = requireSchemaVersionValue(value);
    Object.freeze(this);
  }

  /** Returns the numeric attachment schema version. */
  toNumber(): number {
    return this.value;
  }

  /** Compares two attachment schema versions by runtime value. */
  equals(other: AttachmentSchemaVersion): boolean {
    return this.value === other.value;
  }

  /** Returns the current attachment schema version. */
  static current(): AttachmentSchemaVersion {
    return new AttachmentSchemaVersion(CURRENT_ATTACHMENT_SCHEMA_VERSION);
  }
}

/** Validates an attachment schema version carrier. */
function requireSchemaVersionValue(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new WarpError('AttachmentSchemaVersion must be a positive integer', 'E_VALIDATION');
  }
  return value;
}
