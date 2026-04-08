/**
 * StrandSelector — observe one writer's isolated worldline.
 *
 * @module domain/types/StrandSelector
 */

import QueryError from '../errors/QueryError.ts';
import WorldlineSelector, { validateCeiling } from './WorldlineSelector.ts';

/**
 * Worldline selector pinned to a single strand's visible patch universe.
 *
 * Used for branch-and-compare workflows where you want one writer's
 * isolated perspective.
 */
class StrandSelector extends WorldlineSelector {
  /** The strand identifier. */
  readonly strandId: string;

  /** Lamport ceiling for time-travel. */
  readonly ceiling: number | null;

  /**
   * Creates a StrandSelector.
   */
  constructor(strandId: string, ceiling?: number | null) {
    super();

    if (typeof strandId !== 'string' || strandId.length === 0) {
      throw new QueryError('strandId must be a non-empty string', { code: 'E_SELECTOR_INVALID' });
    }

    this.strandId = strandId;
    this.ceiling = validateCeiling(ceiling);
    Object.freeze(this);
  }

  /**
   * Deep-clone this selector.
   */
  clone(): StrandSelector {
    return new StrandSelector(this.strandId, this.ceiling);
  }

  /**
   * Convert to a plain DTO for the public API.
   */
  toDTO(): { kind: 'strand'; strandId: string; ceiling: number | null } {
    return { kind: 'strand', strandId: this.strandId, ceiling: this.ceiling };
  }
}

WorldlineSelector._register('strand', StrandSelector);

export default StrandSelector;
