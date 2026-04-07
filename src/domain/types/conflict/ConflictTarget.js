/**
 * ConflictTarget — runtime-backed identity of a conflict's structural target.
 *
 * Identifies what entity, edge, or property a conflict is about. Carries a
 * content-addressed `targetDigest` for grouping and deduplication.
 *
 * @module domain/types/conflict/ConflictTarget
 */


const VALID_TARGET_KINDS = new Set(['node', 'edge', 'node_property', 'edge_property']);

const SELECTOR_FIELDS = Object.freeze(['entityId', 'propertyKey', 'from', 'to', 'label']);

/**
 * Validates that the given value is a recognized target kind.
 *
 * @param {unknown} kind - The value to check.
 */
function validateTargetKind(kind) {
  if (!VALID_TARGET_KINDS.has(kind)) {
    throw new TypeError(`ConflictTarget: targetKind must be one of ${[...VALID_TARGET_KINDS].join(', ')}`);
  }
}

/**
 * Tests whether all specified selector fields match the given target.
 *
 * @param {ConflictTarget} target - The conflict target.
 * @param {ConflictTargetSelector} selector - The selector to check against.
 * @returns {boolean} True if every specified selector field matches.
 */
function selectorFieldsMatch(target, selector) {
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
 *
 * @param {unknown} value - The value to check.
 * @param {string} name - Field name for error messages.
 * @returns {string} The validated string.
 */
function requireNonEmptyString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`ConflictTarget: ${name} must be a non-empty string`);
  }
  return value;
}

/**
 * Validates an optional string field — must be a non-empty string or absent.
 *
 * @param {unknown} value - The value to check.
 * @param {string} name - Field name for error messages.
 * @returns {string|undefined} The validated string or undefined.
 */
function optionalString(value, name) {
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
  /**
   * Creates a new ConflictTarget with validated fields.
   *
   * @param {{
   *   targetKind: 'node'|'edge'|'node_property'|'edge_property',
   *   targetDigest: string,
   *   entityId?: string,
   *   propertyKey?: string,
   *   from?: string,
   *   to?: string,
   *   label?: string,
   *   edgeKey?: string
   * }} fields - Target identity fields.
   */
  constructor({ targetKind, targetDigest, entityId, propertyKey, from, to, label, edgeKey }) {
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
   *
   * @param {string} entityId - The entity identifier to match.
   * @returns {boolean} True if the target touches the entity.
   */
  touchesEntity(entityId) {
    if (this.entityId === entityId) {
      return true;
    }
    return this.from === entityId || this.to === entityId;
  }

  /**
   * Tests whether this target matches a user-supplied target selector filter.
   *
   * A null or undefined selector matches all targets.
   *
   * @param {ConflictTargetSelector|null|undefined} selector - The filter selector.
   * @returns {boolean} True if the target satisfies all selector constraints.
   */
  matchesSelector(selector) {
    if (selector === undefined || selector === null) {
      return true;
    }
    if (this.targetKind !== selector.targetKind) {
      return false;
    }
    return selectorFieldsMatch(this, selector);
  }
}
