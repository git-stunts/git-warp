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
    throw new TypeError(`ceiling must be null or a non-negative integer, got ${String(ceiling)}`);
  }
  return ceiling;
}

/**
 * Subclass registry — populated by each subclass module on import.
 *
 * @type {{ live?: typeof import('./LiveSelector.js').default, coordinate?: typeof import('./CoordinateSelector.js').default, strand?: typeof import('./StrandSelector.js').default }}
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

    if (raw === null || raw === undefined) {
      const Live = registry['live'];
      if (!Live) { throw new Error('LiveSelector not registered'); }
      return new Live();
    }

    const kind = raw.kind;

    if (kind === 'live') {
      const Live = registry['live'];
      if (!Live) { throw new Error('LiveSelector not registered'); }
      return new Live(raw.ceiling);
    }

    if (kind === 'coordinate') {
      const Coordinate = registry['coordinate'];
      if (!Coordinate) { throw new Error('CoordinateSelector not registered'); }
      return new Coordinate(raw.frontier, raw.ceiling);
    }

    if (kind === 'strand') {
      const Strand = registry['strand'];
      if (!Strand) { throw new Error('StrandSelector not registered'); }
      return new Strand(raw.strandId, raw.ceiling);
    }

    throw new TypeError(`unknown worldline selector kind: ${String(kind)}`);
  }
}

export { validateCeiling };
export default WorldlineSelector;
