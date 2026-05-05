/**
 * ConflictWinner — runtime-backed winner of a conflict trace.
 *
 * @module domain/types/conflict/ConflictWinner
 */

import WarpError from '../../errors/WarpError.ts';
import ConflictAnchor from './ConflictAnchor.ts';
import { requireNonEmptyString } from './validation.ts';

const CTX = 'ConflictWinner';

/**
 * A runtime-backed winner record within a conflict trace.
 *
 * Instances are frozen on construction.
 */
export default class ConflictWinner {
  readonly anchor: ConflictAnchor;
  readonly effectDigest: string;

  /**
   * Creates a frozen ConflictWinner.
   */
  constructor({ anchor, effectDigest }: {
    anchor: ConflictAnchor;
    effectDigest: string;
  }) {
    if (!(anchor instanceof ConflictAnchor)) {
      throw new WarpError(`${CTX}: anchor must be a ConflictAnchor instance`, 'E_VALIDATION');
    }
    this.anchor = anchor;
    this.effectDigest = requireNonEmptyString(effectDigest, 'effectDigest', CTX);
    Object.freeze(this);
  }

  /**
   * Creates a ConflictWinner from an OpRecord.
   */
  static fromRecord(record: {
    patchSha: string;
    writerId: string;
    lamport: number;
    opIndex: number;
    receiptOpIndex: number;
    effectDigest: string;
  }): ConflictWinner {
    return new ConflictWinner({
      anchor: ConflictAnchor.fromRecord(record),
      effectDigest: record.effectDigest,
    });
  }
}
