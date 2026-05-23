import WarpError from '../errors/WarpError.ts';

const FIELD_SEPARATOR = '\x00';
const RESERVED_EDGE_PROP_PREFIX = '\x01';

/** Runtime-backed identifier for a graph substrate node. */
export default class NodeId {
  private readonly value: string;

  constructor(value: string) {
    this.value = requireNodeIdValue(value);
    Object.freeze(this);
  }

  /** Returns the stable protocol string for this node id. */
  toString(): string {
    return this.value;
  }

  /** Compares two node ids by runtime value. */
  equals(other: NodeId): boolean {
    return this.value === other.value;
  }
}

/** Validates a graph node id carrier. */
function requireNodeIdValue(value: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError('NodeId must be a non-empty string', 'E_VALIDATION');
  }
  if (value.includes(FIELD_SEPARATOR)) {
    throw new WarpError('NodeId must not contain NUL bytes', 'E_VALIDATION');
  }
  if (value.startsWith(RESERVED_EDGE_PROP_PREFIX)) {
    throw new WarpError('NodeId must not start with reserved edge-property prefix', 'E_VALIDATION');
  }
  return value;
}
