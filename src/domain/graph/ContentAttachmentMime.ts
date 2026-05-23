import WarpError from '../errors/WarpError.ts';

const FIELD_SEPARATOR = '\x00';

/** Runtime-backed MIME hint for a content attachment. */
export default class ContentAttachmentMime {
  private readonly value: string;

  constructor(value: string) {
    this.value = requireMimeValue(value);
    Object.freeze(this);
  }

  /** Returns the stable MIME hint string. */
  toString(): string {
    return this.value;
  }

  /** Compares two MIME hints by runtime value. */
  equals(other: ContentAttachmentMime | null | undefined): boolean {
    if (!(other instanceof ContentAttachmentMime)) {
      return false;
    }
    return this.value === other.value;
  }
}

/** Validates a content attachment MIME hint. */
function requireMimeValue(value: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError('ContentAttachmentMime must be a non-empty string', 'E_VALIDATION');
  }
  if (value.includes(FIELD_SEPARATOR)) {
    throw new WarpError('ContentAttachmentMime must not contain NUL bytes', 'E_VALIDATION');
  }
  return value;
}
