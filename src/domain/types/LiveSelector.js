/**
 * LiveSelector — observe the canonical worldline (all writers merged).
 *
 * @module domain/types/LiveSelector
 */

import WorldlineSelector, { validateCeiling } from './WorldlineSelector.js';

/**
 * Worldline selector pinned to the canonical (live) worldline.
 *
 * The canonical worldline merges every writer's patches via CRDT join.
 * The optional ceiling selects a tick: "observe at tick N."
 */
class LiveSelector extends WorldlineSelector {
  /**
   * Creates a LiveSelector.
   *
   * @param {number|null} [ceiling] - Lamport ceiling for time-travel. Null or non-negative integer.
   */
  constructor(ceiling) {
    super();
    /** @type {number|null} */
    this.ceiling = validateCeiling(ceiling);
    Object.freeze(this);
  }

  /**
   * Deep-clone this selector.
   *
   * @returns {LiveSelector}
   */
  clone() {
    return new LiveSelector(this.ceiling);
  }

  /**
   * Convert to a plain DTO for the public API.
   *
   * Omits ceiling when null to match the legacy WorldlineSource shape
   * (consumers may check `'ceiling' in dto`).
   *
   * @returns {{ kind: 'live', ceiling?: number|null }}
   */
  toDTO() {
    return this.ceiling !== null
      ? { kind: 'live', ceiling: this.ceiling }
      : { kind: 'live' };
  }
}

WorldlineSelector._register('live', LiveSelector);

export default LiveSelector;
