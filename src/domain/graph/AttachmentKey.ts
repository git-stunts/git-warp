import WarpError from '../errors/WarpError.ts';

const FIELD_SEPARATOR = '\x00';

/** Runtime-backed identifier for a graph attachment slot. */
export default class AttachmentKey {
  private readonly value: string;

  constructor(value: string) {
    this.value = requireAttachmentKeyValue(value);
    Object.freeze(this);
  }

  /** Returns the stable protocol string for this attachment slot. */
  toString(): string {
    return this.value;
  }

  /** Compares two attachment keys by runtime value. */
  equals(other: AttachmentKey): boolean {
    return this.value === other.value;
  }
}

/** Validates a graph attachment key carrier. */
function requireAttachmentKeyValue(value: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError('AttachmentKey must be a non-empty string', 'E_VALIDATION');
  }
  if (value.includes(FIELD_SEPARATOR)) {
    throw new WarpError('AttachmentKey must not contain NUL bytes', 'E_VALIDATION');
  }
  return value;
}
