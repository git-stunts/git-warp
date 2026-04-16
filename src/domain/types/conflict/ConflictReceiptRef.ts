/**
 * ConflictReceiptRef — runtime-backed reference to a tick-receipt
 * coordinate used as evidence inside a conflict trace.
 *
 * Points at a specific operation within a specific patch's tick
 * receipt, carrying only the fields needed to look up the receipt
 * entry: the patch SHA, the Lamport timestamp of the patch, and the
 * operation index within the receipt.
 *
 * Instances are frozen on construction. All invariants are validated
 * eagerly.
 *
 * @module domain/types/conflict/ConflictReceiptRef
 */

import { requireNonEmptyString, requireNonNegativeInt, compareStrings } from './validation.ts';

const CTX = 'ConflictReceiptRef';

type ConflictReceiptRefFields = {
  patchSha: string;
  lamport: number;
  opIndex: number;
};

/**
 * A runtime-backed receipt-coordinate reference for evidence
 * construction.
 */
export default class ConflictReceiptRef {
  readonly patchSha: string;
  readonly lamport: number;
  readonly opIndex: number;

  /**
   * Creates a frozen ConflictReceiptRef with validated fields.
   */
  constructor({ patchSha, lamport, opIndex }: ConflictReceiptRefFields) {
    this.patchSha = requireNonEmptyString(patchSha, 'patchSha', CTX);
    this.lamport = requireNonNegativeInt(lamport, 'lamport', CTX);
    this.opIndex = requireNonNegativeInt(opIndex, 'opIndex', CTX);
    Object.freeze(this);
  }

  /**
   * Builds a ConflictReceiptRef from any carrier with matching fields
   * (an `OpRecord`, another `ConflictReceiptRef`, or a parsed blob
   * that has already been validated at its boundary).
   */
  static from({ patchSha, lamport, opIndex }: ConflictReceiptRefFields): ConflictReceiptRef {
    return new ConflictReceiptRef({ patchSha, lamport, opIndex });
  }

  /**
   * Compares two ConflictReceiptRefs deterministically by patch SHA
   * then by operation index. Used for stable ordering in evidence
   * arrays.
   */
  static compare(a: ConflictReceiptRef, b: ConflictReceiptRef): number {
    const shaCmp = compareStrings(a.patchSha, b.patchSha);
    if (shaCmp !== 0) {
      return shaCmp;
    }
    return a.opIndex === b.opIndex ? 0 : (a.opIndex < b.opIndex ? -1 : 1);
  }
}
