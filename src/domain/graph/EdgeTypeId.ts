import WarpError from '../errors/WarpError.ts';

const FIELD_SEPARATOR = '\x00';

/** Runtime-backed identifier for a graph substrate edge type. */
export default class EdgeTypeId {
  private readonly value: string;

  constructor(value: string) {
    this.value = requireEdgeTypeIdValue(value);
    Object.freeze(this);
  }

  /** Returns the stable protocol string for this edge type id. */
  toString(): string {
    return this.value;
  }

  /** Compares two edge type ids by runtime value. */
  equals(other: EdgeTypeId): boolean {
    return this.value === other.value;
  }
}

/** Validates a graph edge type id carrier. */
function requireEdgeTypeIdValue(value: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError('EdgeTypeId must be a non-empty string', 'E_VALIDATION');
  }
  if (value.includes(FIELD_SEPARATOR)) {
    throw new WarpError('EdgeTypeId must not contain NUL bytes', 'E_VALIDATION');
  }
  return value;
}
