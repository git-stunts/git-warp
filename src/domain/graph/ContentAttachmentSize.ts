import WarpError from '../errors/WarpError.ts';

/** Runtime-backed byte length for a content attachment. */
export default class ContentAttachmentSize {
  private readonly value: number;

  constructor(value: number) {
    this.value = requireSizeValue(value);
    Object.freeze(this);
  }

  /** Returns the byte length. */
  toNumber(): number {
    return this.value;
  }

  /** Compares two content sizes by runtime value. */
  equals(other: ContentAttachmentSize | null | undefined): boolean {
    if (!(other instanceof ContentAttachmentSize)) {
      return false;
    }
    return this.value === other.value;
  }
}

/** Validates a content attachment byte length. */
function requireSizeValue(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new WarpError('ContentAttachmentSize must be a non-negative integer', 'E_VALIDATION');
  }
  return value;
}
