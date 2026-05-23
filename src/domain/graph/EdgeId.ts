import WarpError from '../errors/WarpError.ts';

const FIELD_SEPARATOR = '\x00';
const RESERVED_EDGE_PROP_PREFIX = '\x01';

/** Runtime-backed identifier for a graph substrate edge. */
export default class EdgeId {
  private readonly value: string;

  constructor(value: string) {
    this.value = requireEdgeIdValue(value);
    Object.freeze(this);
  }

  /** Returns the stable protocol string for this edge id. */
  toString(): string {
    return this.value;
  }

  /** Compares two edge ids by runtime value. */
  equals(other: EdgeId): boolean {
    return this.value === other.value;
  }
}

/** Validates a graph edge id carrier. */
function requireEdgeIdValue(value: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError('EdgeId must be a non-empty string', 'E_VALIDATION');
  }
  if (value.includes(FIELD_SEPARATOR)) {
    throw new WarpError('EdgeId must not contain NUL bytes', 'E_VALIDATION');
  }
  if (value.startsWith(RESERVED_EDGE_PROP_PREFIX)) {
    throw new WarpError('EdgeId must not start with reserved edge-property prefix', 'E_VALIDATION');
  }
  return value;
}
