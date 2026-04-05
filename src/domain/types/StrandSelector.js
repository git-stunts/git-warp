/**
 * StrandSelector — observe one writer's isolated worldline.
 *
 * @module domain/types/StrandSelector
 */

import WorldlineSelector, { validateCeiling } from './WorldlineSelector.js';

/**
 * Worldline selector pinned to a single strand's visible patch universe.
 *
 * Used for branch-and-compare workflows where you want one writer's
 * isolated perspective.
 */
class StrandSelector extends WorldlineSelector {
  /**
   * Creates a StrandSelector.
   *
   * @param {string} strandId - The strand identifier. Must be a non-empty string.
   * @param {number|null} [ceiling] - Lamport ceiling for time-travel.
   */
  constructor(strandId, ceiling) {
    super();

    if (typeof strandId !== 'string' || strandId.length === 0) {
      throw new TypeError('strandId must be a non-empty string');
    }

    /** @type {string} */
    this.strandId = strandId;
    /** @type {number|null} */
    this.ceiling = validateCeiling(ceiling);
    Object.freeze(this);
  }

  /**
   * Deep-clone this selector.
   *
   * @returns {StrandSelector}
   */
  clone() {
    return new StrandSelector(this.strandId, this.ceiling);
  }

  /**
   * Convert to a plain DTO for the public API.
   *
   * @returns {{ kind: 'strand', strandId: string, ceiling: number|null }}
   */
  toDTO() {
    return { kind: 'strand', strandId: this.strandId, ceiling: this.ceiling };
  }
}

WorldlineSelector._register('strand', StrandSelector);

export default StrandSelector;
