/**
 * CoordinateSelector — observe a hypothetical worldline at specific writer tips.
 *
 * @module domain/types/CoordinateSelector
 */

import WorldlineSelector, { validateCeiling } from './WorldlineSelector.js';

/**
 * Worldline selector pinned to an explicit writer-tip coordinate.
 *
 * The coordinate specifies a hypothetical worldline that would result
 * from merging only these writers at these commit SHAs. The frontier
 * may be empty (produces empty materialized state).
 */
class CoordinateSelector extends WorldlineSelector {
  /** @type {Map<string, string>} */
  #frontier;

  /**
   * Creates a CoordinateSelector.
   *
   * @param {Map<string, string>|Record<string, string>} frontier - Writer-tip frontier. May be empty.
   * @param {number|null} [ceiling] - Lamport ceiling for time-travel.
   */
  constructor(frontier, ceiling) {
    super();

    if (frontier === null || frontier === undefined || typeof frontier !== 'object') {
      throw new TypeError('frontier must be a Map or plain object');
    }

    this.#frontier = frontier instanceof Map
      ? new Map(frontier)
      : new Map(Object.entries(frontier));

    /** @type {number|null} */
    this.ceiling = validateCeiling(ceiling);
    Object.freeze(this);
  }

  /**
   * Returns a defensive copy of the frontier.
   *
   * @returns {Map<string, string>}
   */
  get frontier() {
    return new Map(this.#frontier);
  }

  /**
   * Deep-clone this selector, copying the frontier.
   *
   * @returns {CoordinateSelector}
   */
  clone() {
    return new CoordinateSelector(new Map(this.#frontier), this.ceiling);
  }

  /**
   * Convert to a plain DTO for the public API.
   *
   * @returns {{ kind: 'coordinate', frontier: Map<string, string>, ceiling: number|null }}
   */
  toDTO() {
    return { kind: 'coordinate', frontier: new Map(this.#frontier), ceiling: this.ceiling };
  }
}

WorldlineSelector._register('coordinate', CoordinateSelector);

export default CoordinateSelector;
