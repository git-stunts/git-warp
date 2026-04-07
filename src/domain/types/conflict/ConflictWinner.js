/**
 * ConflictWinner — runtime-backed winner of a conflict trace.
 *
 * @module domain/types/conflict/ConflictWinner
 */

import ConflictAnchor from './ConflictAnchor.js';
import { requireNonEmptyString } from './validation.js';

const CTX = 'ConflictWinner';

/**
 * A runtime-backed winner record within a conflict trace.
 *
 * Instances are frozen on construction.
 */
export default class ConflictWinner {
  /**
   * Creates a frozen ConflictWinner.
   *
   * @param {{
   *   anchor: ConflictAnchor,
   *   effectDigest: string
   * }} fields - Winner fields.
   */
  constructor({ anchor, effectDigest }) {
    if (!(anchor instanceof ConflictAnchor)) {
      throw new TypeError(`${CTX}: anchor must be a ConflictAnchor instance`);
    }
    this.anchor = anchor;
    this.effectDigest = requireNonEmptyString(effectDigest, 'effectDigest', CTX);
    Object.freeze(this);
  }
}
