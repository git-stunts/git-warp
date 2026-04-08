/**
 * CoordinateSelector — observe a hypothetical worldline at specific writer tips.
 *
 * @module domain/types/CoordinateSelector
 */

import QueryError from '../errors/QueryError.ts';
import WorldlineSelector, { validateCeiling } from './WorldlineSelector.ts';

/**
 * Worldline selector pinned to an explicit writer-tip coordinate.
 *
 * The coordinate specifies a hypothetical worldline that would result
 * from merging only these writers at these commit SHAs. The frontier
 * may be empty (produces empty materialized state).
 */
class CoordinateSelector extends WorldlineSelector {
  #frontier: Map<string, string>;

  /** Lamport ceiling for time-travel. */
  readonly ceiling: number | null;

  /**
   * Creates a CoordinateSelector.
   */
  constructor(frontier: Map<string, string> | Record<string, string>, ceiling?: number | null) {
    super();

    if (frontier === null || frontier === undefined || typeof frontier !== 'object') {
      throw new QueryError('frontier must be a Map or plain object', { code: 'E_SELECTOR_INVALID' });
    }

    this.#frontier = frontier instanceof Map
      ? new Map(frontier)
      : new Map(Object.entries(frontier));

    this.ceiling = validateCeiling(ceiling);
    Object.freeze(this);
  }

  /**
   * Returns a defensive copy of the frontier.
   */
  get frontier(): Map<string, string> {
    return new Map(this.#frontier);
  }

  /**
   * Deep-clone this selector, copying the frontier.
   */
  clone(): CoordinateSelector {
    return new CoordinateSelector(new Map(this.#frontier), this.ceiling);
  }

  /**
   * Convert to a plain DTO for the public API.
   */
  toDTO(): { kind: 'coordinate'; frontier: Map<string, string>; ceiling: number | null } {
    return { kind: 'coordinate', frontier: new Map(this.#frontier), ceiling: this.ceiling };
  }
}

WorldlineSelector._register('coordinate', CoordinateSelector);

export default CoordinateSelector;
