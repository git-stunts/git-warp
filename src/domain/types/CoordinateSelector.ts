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
  readonly checkpointSha: string | null;

  /**
   * Creates a CoordinateSelector.
   */
  constructor(
    frontier: Map<string, string> | Record<string, string>,
    ceiling?: number | null,
    checkpointSha?: string | null,
  ) {
    super();

    if (frontier === null || frontier === undefined || typeof frontier !== 'object') {
      throw new QueryError('frontier must be a Map or plain object', { code: 'E_SELECTOR_INVALID' });
    }

    this.#frontier = frontier instanceof Map
      ? new Map(frontier)
      : new Map(Object.entries(frontier));

    this.ceiling = validateCeiling(ceiling);
    this.checkpointSha = validateCheckpointSha(checkpointSha);
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
  override clone(): CoordinateSelector {
    return new CoordinateSelector(new Map(this.#frontier), this.ceiling, this.checkpointSha);
  }

  /**
   * Convert to a plain DTO for the public API.
   */
  override toDTO(): {
    kind: 'coordinate';
    frontier: Map<string, string>;
    ceiling: number | null;
    checkpointSha?: string;
  } {
    return {
      kind: 'coordinate',
      frontier: new Map(this.#frontier),
      ceiling: this.ceiling,
      ...(this.checkpointSha !== null ? { checkpointSha: this.checkpointSha } : {}),
    };
  }
}

WorldlineSelector._register('coordinate', CoordinateSelector);

function validateCheckpointSha(checkpointSha: string | null | undefined): string | null {
  if (checkpointSha === undefined || checkpointSha === null) {
    return null;
  }
  if (typeof checkpointSha !== 'string' || checkpointSha.length === 0) {
    throw new QueryError('checkpointSha must be a non-empty string when provided', {
      code: 'E_SELECTOR_INVALID',
    });
  }
  return checkpointSha;
}

export default CoordinateSelector;
