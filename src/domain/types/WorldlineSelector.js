/**
 * WorldlineSelector — abstract base for worldline selector descriptors.
 *
 * A worldline selector specifies which worldline an observer projects.
 * Three variants: LiveSelector (canonical worldline),
 * CoordinateSelector (hypothetical worldline at specific writer tips),
 * StrandSelector (single writer's isolated worldline).
 *
 * @module domain/types/WorldlineSelector
 */

/**
 * Validates a ceiling value. Must be null, undefined, or a non-negative integer.
 *
 * @param {unknown} ceiling
 * @returns {number|null} normalized ceiling
 */
function validateCeiling(ceiling) {
  if (ceiling === undefined || ceiling === null) {
    return null;
  }
  if (typeof ceiling !== 'number' || !Number.isInteger(ceiling) || ceiling < 0) {
    throw new TypeError(`ceiling must be null or a non-negative integer, got ${typeof ceiling === 'number' ? ceiling : typeof ceiling}`);
  }
  return ceiling;
}

/**
 * Subclass registry — populated by each subclass module on import.
 *
 * @type {Record<string, Function>}
 */
const registry = {};

/**
 * Abstract base for worldline selectors.
 *
 * Subclasses: LiveSelector, CoordinateSelector, StrandSelector.
 * Use WorldlineSelector.from() to convert plain { kind } objects
 * at API boundaries.
 */
class WorldlineSelector {
  /**
   * Deep-clone this selector.
   *
   * @abstract
   * @returns {WorldlineSelector}
   */
  clone() {
    throw new Error('WorldlineSelector.clone() is abstract');
  }

  /**
   * Convert this selector to a plain DTO matching the WorldlineSource shape.
   *
   * @abstract
   * @returns {{ kind: string, [key: string]: unknown }}
   */
  toDTO() {
    throw new Error('WorldlineSelector.toDTO() is abstract');
  }

  /**
   * Register a subclass for use in from().
   *
   * @param {string} kind
   * @param {Function} ctor
   */
  static _register(kind, ctor) {
    if (Object.isFrozen(registry)) {
      throw new Error('WorldlineSelector registry is frozen — cannot register after first use');
    }
    registry[kind] = ctor;
  }

  /**
   * Normalize a raw source descriptor into a WorldlineSelector instance.
   *
   * Accepts class instances (returned as-is), plain { kind } objects
   * (converted to the appropriate subclass), and null/undefined
   * (defaults to LiveSelector).
   *
   * @param {WorldlineSelector|{ kind: string, [key: string]: unknown }|null|undefined} raw
   * @returns {WorldlineSelector}
   */
  static from(raw) {
    if (raw instanceof WorldlineSelector) {
      return raw;
    }
    // Freeze registry on first use — prevents post-init hijacking
    if (!Object.isFrozen(registry)) {
      Object.freeze(registry);
    }
    return fromPlainObject(raw);
  }
}

/**
 * Builds a WorldlineSelector from a plain object or null/undefined.
 *
 * Note: the kind→constructor-args mapping is hardcoded for the three
 * known selector kinds. Adding a new kind requires editing this function.
 *
 * Kept separate from the class to reduce static from() complexity.
 *
 * @param {{ kind: string, [key: string]: unknown }|null|undefined} raw
 * @returns {WorldlineSelector}
 */
function fromPlainObject(raw) {
  const value = raw ?? { kind: 'live' };
  const { kind } = value;
  if (!(kind in registry)) {
    throw new TypeError(`unknown worldline selector kind: ${String(kind)}`);
  }
  const Ctor = /** @type {new (...args: unknown[]) => WorldlineSelector} */ (registry[kind]);
  if (kind === 'live') {
    return new Ctor(value['ceiling']);
  }
  if (kind === 'coordinate') {
    return new Ctor(value['frontier'], value['ceiling']);
  }
  return new Ctor(value['strandId'], value['ceiling']);
}

export { validateCeiling };
export default WorldlineSelector;
