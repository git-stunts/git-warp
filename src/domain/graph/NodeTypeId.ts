import WarpError from '../errors/WarpError.ts';

const FIELD_SEPARATOR = '\x00';

/** Transitional node type used for legacy NodeAdd operations without type ids. */
export const DEFAULT_NODE_TYPE_ID = 'untyped-node';

/** Runtime-backed identifier for a graph substrate node type. */
export default class NodeTypeId {
  private readonly value: string;

  constructor(value: string) {
    this.value = requireNodeTypeIdValue(value);
    Object.freeze(this);
  }

  /** Returns the stable protocol string for this node type id. */
  toString(): string {
    return this.value;
  }

  /** Compares two node type ids by runtime value. */
  equals(other: NodeTypeId): boolean {
    return this.value === other.value;
  }
}

/** Validates a graph node type id carrier. */
function requireNodeTypeIdValue(value: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError('NodeTypeId must be a non-empty string', 'E_VALIDATION');
  }
  if (value.includes(FIELD_SEPARATOR)) {
    throw new WarpError('NodeTypeId must not contain NUL bytes', 'E_VALIDATION');
  }
  return value;
}
