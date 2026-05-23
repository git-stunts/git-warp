import WarpError from '../errors/WarpError.ts';

const FIELD_SEPARATOR = '\x00';

/** Runtime-backed reference to content storage used by a content attachment. */
export default class ContentAttachmentOid {
  private readonly value: string;

  constructor(value: string) {
    this.value = requireOidValue(value);
    Object.freeze(this);
  }

  /** Returns the stable content storage reference string. */
  toString(): string {
    return this.value;
  }

  /** Compares two content storage references by runtime value. */
  equals(other: ContentAttachmentOid | null | undefined): boolean {
    if (!(other instanceof ContentAttachmentOid)) {
      return false;
    }
    return this.value === other.value;
  }
}

/** Validates a content attachment storage reference. */
function requireOidValue(value: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError('ContentAttachmentOid must be a non-empty string', 'E_VALIDATION');
  }
  if (value.includes(FIELD_SEPARATOR)) {
    throw new WarpError('ContentAttachmentOid must not contain NUL bytes', 'E_VALIDATION');
  }
  return value;
}
