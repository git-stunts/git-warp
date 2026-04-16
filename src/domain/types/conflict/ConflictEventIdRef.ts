/**
 * ConflictEventIdRef — runtime-backed event-id coordinate attached
 * to a ConflictResolution comparator.
 *
 * Identifies the specific operation (winner or loser) that drove an
 * event-id comparator decision. Same shape as the `EventId` value
 * object (lamport, writerId, patchSha, opIndex) but explicitly named
 * and frozen for transport inside a resolution payload.
 *
 * Instances are frozen on construction. All invariants are validated
 * eagerly.
 *
 * @module domain/types/conflict/ConflictEventIdRef
 */

import { requireNonEmptyString, requireNonNegativeInt } from './validation.ts';

const CTX = 'ConflictEventIdRef';

type ConflictEventIdRefFields = {
  lamport: number;
  writerId: string;
  patchSha: string;
  opIndex: number;
};

/**
 * A runtime-backed event-id reference used inside conflict
 * resolution comparators.
 */
export default class ConflictEventIdRef {
  readonly lamport: number;
  readonly writerId: string;
  readonly patchSha: string;
  readonly opIndex: number;

  /**
   * Creates a frozen ConflictEventIdRef with validated fields.
   */
  constructor({ lamport, writerId, patchSha, opIndex }: ConflictEventIdRefFields) {
    this.lamport = requireNonNegativeInt(lamport, 'lamport', CTX);
    this.writerId = requireNonEmptyString(writerId, 'writerId', CTX);
    this.patchSha = requireNonEmptyString(patchSha, 'patchSha', CTX);
    this.opIndex = requireNonNegativeInt(opIndex, 'opIndex', CTX);
    Object.freeze(this);
  }

  /**
   * Builds a ConflictEventIdRef from any carrier with matching
   * fields (an EventId, OpRecord.eventId, or already-validated
   * blob shape).
   */
  static from({ lamport, writerId, patchSha, opIndex }: ConflictEventIdRefFields): ConflictEventIdRef {
    return new ConflictEventIdRef({ lamport, writerId, patchSha, opIndex });
  }
}
