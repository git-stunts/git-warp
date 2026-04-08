/**
 * ConflictTarget — runtime-backed identity of a conflict's structural target.
 *
 * Identifies what entity, edge, or property a conflict is about. Carries a
 * content-addressed `targetDigest` for grouping and deduplication.
 *
 * @module domain/types/conflict/ConflictTarget
 */

type TargetKind = 'node' | 'edge' | 'node_property' | 'edge_property';

type ConflictTargetSelector = {
  targetKind: TargetKind;
  entityId?: string;
  propertyKey?: string;
  from?: string;
  to?: string;
  label?: string;
};

const VALID_TARGET_KINDS = new Set<string>(['node', 'edge', 'node_property', 'edge_property']);

const SELECTOR_FIELDS = Object.freeze(['entityId', 'propertyKey', 'from', 'to', 'label'] as const);

/**
 * Validates that the given value is a recognized target kind.
 */
function validateTargetKind(kind: unknown): void {
  if (!VALID_TARGET_KINDS.has(kind as string)) {
    throw new TypeError(`ConflictTarget: targetKind must be one of ${[...VALID_TARGET_KINDS].join(', ')}`);
  }
}

/**
 * Tests whether all specified selector fields match the given target.
 */
function selectorFieldsMatch(target: ConflictTarget, selector: ConflictTargetSelector): boolean {
  for (const field of SELECTOR_FIELDS) {
    const selectorValue = selector[field];
    if (selectorValue !== undefined && target[field] !== selectorValue) {
      return false;
    }
  }
  return true;
}

/**
 * Validates that a value is a non-empty string.
 */
function requireNonEmptyString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`ConflictTarget: ${name} must be a non-empty string`);
  }
  return value;
}

/**
 * Validates an optional string field — must be a non-empty string or absent.
 */
function optionalString(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`ConflictTarget: ${name} must be a non-empty string when provided`);
  }
  return value;
}

/**
 * A runtime-backed identity for a conflict's structural target.
 *
 * Describes which entity, edge, or property is contested, along with
 * a content-addressed digest for deterministic grouping.
 *
 * Instances are frozen on construction. All invariants are validated eagerly.
 */
export default class ConflictTarget {
  readonly targetKind: TargetKind;
  readonly targetDigest: string;
  readonly entityId: string | undefined;
  readonly propertyKey: string | undefined;
  readonly from: string | undefined;
  readonly to: string | undefined;
  readonly label: string | undefined;
  readonly edgeKey: string | undefined;

  /**
   * Creates a new ConflictTarget with validated fields.
   */
  constructor({ targetKind, targetDigest, entityId, propertyKey, from, to, label, edgeKey }: {
    targetKind: TargetKind;
    targetDigest: string;
    entityId?: string;
    propertyKey?: string;
    from?: string;
    to?: string;
    label?: string;
    edgeKey?: string;
  }) {
    validateTargetKind(targetKind);
    this.targetKind = targetKind;
    this.targetDigest = requireNonEmptyString(targetDigest, 'targetDigest');
    this.entityId = optionalString(entityId, 'entityId');
    this.propertyKey = optionalString(propertyKey, 'propertyKey');
    this.from = optionalString(from, 'from');
    this.to = optionalString(to, 'to');
    this.label = optionalString(label, 'label');
    this.edgeKey = optionalString(edgeKey, 'edgeKey');
    Object.freeze(this);
  }

  /**
   * Tests whether this target references the given entity by id, source, or destination.
   */
  touchesEntity(entityId: string): boolean {
    if (this.entityId === entityId) {
      return true;
    }
    return this.from === entityId || this.to === entityId;
  }

  /**
   * Tests whether this target matches a user-supplied target selector filter.
   *
   * A null or undefined selector matches all targets.
   */
  matchesSelector(selector: ConflictTargetSelector | null | undefined): boolean {
    if (selector === undefined || selector === null) {
      return true;
    }
    if (this.targetKind !== selector.targetKind) {
      return false;
    }
    return selectorFieldsMatch(this, selector);
  }
}
