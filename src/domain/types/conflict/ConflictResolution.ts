/**
 * ConflictResolution — runtime-backed description of how a conflict was resolved.
 *
 * @module domain/types/conflict/ConflictResolution
 */

import WarpError from '../../errors/WarpError.ts';
import { requireNonEmptyString, requireEnum } from './validation.ts';

const CTX = 'ConflictResolution';
const VALID_WINNER_MODES = new Set(['immediate', 'eventual']);

type Basis = { code: string; reason?: string | undefined };
type Comparator = { type: string; winnerEventId?: Readonly<Record<string, unknown>>; loserEventId?: Readonly<Record<string, unknown>> };

/**
 * Deep-freezes the basis object.
 */
function validateBasis(basis: Basis): void {
  if (basis === null || basis === undefined || typeof basis !== 'object') {
    throw new WarpError(`${CTX}: basis must be an object with a code property`, 'E_VALIDATION');
  }
  requireNonEmptyString(basis.code, 'basis.code', CTX);
}

/**
 * Deep-freezes the basis object after validation.
 */
function freezeBasis(basis: Basis): Readonly<Basis> {
  validateBasis(basis);
  const hasReason = typeof basis.reason === 'string' && basis.reason.length > 0;
  return Object.freeze(hasReason ? { code: basis.code, reason: basis.reason } : { code: basis.code });
}

/**
 * Freezes an optional event ID sub-object.
 */
function freezeEventId(eventId: Record<string, unknown> | undefined | null): Readonly<Record<string, unknown>> | undefined {
  if (eventId === undefined || eventId === null) {
    return undefined;
  }
  return Object.freeze({ ...eventId });
}

/**
 * Deep-freezes the optional comparator object, including nested event IDs.
 */
function freezeComparator(comparator: { type: string; winnerEventId?: Record<string, unknown>; loserEventId?: Record<string, unknown> } | undefined | null): Comparator | undefined {
  if (comparator === undefined || comparator === null) {
    return undefined;
  }
  const raw = comparator;
  requireNonEmptyString(raw.type, 'comparator.type', CTX);
  const winnerEventId = freezeEventId(raw.winnerEventId);
  const loserEventId = freezeEventId(raw.loserEventId);
  const frozen: { type: string; winnerEventId?: Readonly<Record<string, unknown>>; loserEventId?: Readonly<Record<string, unknown>> } = { type: raw.type };
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
    comparator?: { type: string; winnerEventId?: Record<string, unknown>; loserEventId?: Record<string, unknown> };
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
    const comparator = kind === 'redundancy'
      ? { type: 'effect_digest' }
      : {
        type: 'event_id',
        winnerEventId: { ...winner.eventId },
        loserEventId: { ...loser.eventId },
      };
    return new ConflictResolution({
      reducerId,
      basis,
      winnerMode: kind === 'eventual_override' ? 'eventual' : 'immediate',
      comparator,
    });
  }
}
