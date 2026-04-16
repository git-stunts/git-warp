/**
 * ConflictResolution — runtime-backed description of how a conflict was resolved.
 *
 * @module domain/types/conflict/ConflictResolution
 */

import WarpError from '../../errors/WarpError.ts';
import ConflictEventIdRef from './ConflictEventIdRef.ts';
import { requireNonEmptyString, requireEnum } from './validation.ts';

const CTX = 'ConflictResolution';
const VALID_WINNER_MODES = new Set(['immediate', 'eventual']);

type Basis = { code: string; reason?: string | undefined };

/**
 * Input shape for a winner/loser event-id carrier on a comparator.
 * Either an already-constructed ConflictEventIdRef or the matching
 * field bag (the normalizer converts through ConflictEventIdRef.from).
 */
type EventIdInput = ConflictEventIdRef | {
  lamport: number;
  writerId: string;
  patchSha: string;
  opIndex: number;
};

export type ConflictComparatorInput = {
  type: string;
  winnerEventId?: EventIdInput;
  loserEventId?: EventIdInput;
};

type Comparator = {
  type: string;
  winnerEventId?: ConflictEventIdRef;
  loserEventId?: ConflictEventIdRef;
};

/**
 * Validates that basis is a non-null object carrying a code.
 */
function validateBasis(basis: Basis): void {
  if (basis === null || basis === undefined || typeof basis !== 'object') {
    throw new WarpError(`${CTX}: basis must be an object with a code property`, 'E_VALIDATION');
  }
  requireNonEmptyString(basis.code, 'basis.code', CTX);
}

/**
 * Freezes the basis object after validation.
 */
function freezeBasis(basis: Basis): Readonly<Basis> {
  validateBasis(basis);
  const hasReason = typeof basis.reason === 'string' && basis.reason.length > 0;
  return Object.freeze(hasReason ? { code: basis.code, reason: basis.reason } : { code: basis.code });
}

/**
 * Normalizes an optional event-id carrier to a ConflictEventIdRef
 * instance.
 */
function toEventIdRef(eventId: EventIdInput | undefined | null): ConflictEventIdRef | undefined {
  if (eventId === undefined || eventId === null) {
    return undefined;
  }
  if (eventId instanceof ConflictEventIdRef) {
    return eventId;
  }
  return ConflictEventIdRef.from(eventId);
}

/**
 * Freezes the optional comparator, converting any plain event-id
 * carriers into ConflictEventIdRef instances.
 */
function freezeComparator(comparator: ConflictComparatorInput | undefined | null): Comparator | undefined {
  if (comparator === undefined || comparator === null) {
    return undefined;
  }
  requireNonEmptyString(comparator.type, 'comparator.type', CTX);
  const winnerEventId = toEventIdRef(comparator.winnerEventId);
  const loserEventId = toEventIdRef(comparator.loserEventId);
  const frozen: Comparator = { type: comparator.type };
  if (winnerEventId !== undefined) {
    frozen.winnerEventId = winnerEventId;
  }
  if (loserEventId !== undefined) {
    frozen.loserEventId = loserEventId;
  }
  return Object.freeze(frozen);
}

/**
 * A runtime-backed description of how a conflict was resolved by the reducer.
 *
 * Instances are frozen on construction. Nested basis and comparator objects are deep-frozen.
 */
export default class ConflictResolution {
  readonly reducerId: string;
  readonly basis: Readonly<Basis>;
  readonly winnerMode: string;
  readonly comparator: Comparator | undefined;

  /**
   * Creates a frozen ConflictResolution.
   */
  constructor({ reducerId, basis, winnerMode, comparator }: {
    reducerId: string;
    basis: Basis;
    winnerMode: 'immediate' | 'eventual';
    comparator?: ConflictComparatorInput;
  }) {
    this.reducerId = requireNonEmptyString(reducerId, 'reducerId', CTX);
    this.basis = freezeBasis(basis);
    this.winnerMode = requireEnum(winnerMode, VALID_WINNER_MODES, { name: 'winnerMode', context: CTX });
    this.comparator = freezeComparator(comparator);
    Object.freeze(this);
  }

  /**
   * Builds a ConflictResolution from conflict candidate parameters.
   */
  static fromCandidate({ reducerId, kind, code, winner, loser }: {
    reducerId: string;
    kind: string;
    code: string;
    winner: { eventId: { lamport: number; writerId: string; patchSha: string; opIndex: number } };
    loser: { receiptReason?: string; eventId: { lamport: number; writerId: string; patchSha: string; opIndex: number } };
  }): ConflictResolution {
    const basis: { code: string; reason?: string } = { code };
    if (typeof loser.receiptReason === 'string' && loser.receiptReason.length > 0) {
      basis.reason = loser.receiptReason;
    }
    const comparator: ConflictComparatorInput = kind === 'redundancy'
      ? { type: 'effect_digest' }
      : {
        type: 'event_id',
        winnerEventId: ConflictEventIdRef.from(winner.eventId),
        loserEventId: ConflictEventIdRef.from(loser.eventId),
      };
    return new ConflictResolution({
      reducerId,
      basis,
      winnerMode: kind === 'eventual_override' ? 'eventual' : 'immediate',
      comparator,
    });
  }
}
