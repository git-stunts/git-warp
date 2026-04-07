/**
 * ConflictResolution — runtime-backed description of how a conflict was resolved.
 *
 * @module domain/types/conflict/ConflictResolution
 */

import { requireNonEmptyString, requireEnum } from './validation.js';

const CTX = 'ConflictResolution';
const VALID_WINNER_MODES = new Set(['immediate', 'eventual']);

/**
 * Deep-freezes the basis object.
 *
 * @param {{ code: string, reason?: string }} basis - The basis to freeze.
 * @returns {Readonly<{ code: string, reason?: string }>} Frozen basis.
 */
function validateBasis(basis) {
  if (basis === null || basis === undefined || typeof basis !== 'object') {
    throw new TypeError(`${CTX}: basis must be an object with a code property`);
  }
  requireNonEmptyString(basis.code, 'basis.code', CTX);
}

/**
 * Deep-freezes the basis object after validation.
 *
 * @param {{ code: string, reason?: string }} basis - The basis to freeze.
 * @returns {Readonly<{ code: string, reason?: string }>} Frozen basis.
 */
function freezeBasis(basis) {
  validateBasis(basis);
  const hasReason = typeof basis.reason === 'string' && basis.reason.length > 0;
  return Object.freeze(hasReason ? { code: basis.code, reason: basis.reason } : { code: basis.code });
}

/**
 * Deep-freezes the optional comparator object.
 *
 * @param {unknown} comparator - The comparator to freeze.
 * @returns {Readonly<{ type: string, winnerEventId?: Record<string, unknown>, loserEventId?: Record<string, unknown> }>|undefined} Frozen comparator.
 */
/**
 * Freezes an optional event ID sub-object.
 *
 * @param {unknown} eventId - The event ID to freeze.
 * @returns {Readonly<Record<string, unknown>>|undefined} Frozen event ID or undefined.
 */
function freezeEventId(eventId) {
  if (eventId === undefined || eventId === null) {
    return undefined;
  }
  return Object.freeze({ .../** @type {object} */ (eventId) });
}

/**
 * Deep-freezes the optional comparator object, including nested event IDs.
 *
 * @param {unknown} comparator - The raw comparator.
 * @returns {{ type: string, winnerEventId?: Readonly<Record<string, unknown>>, loserEventId?: Readonly<Record<string, unknown>> }|undefined} Frozen comparator.
 */
function freezeComparator(comparator) {
  if (comparator === undefined || comparator === null) {
    return undefined;
  }
  const raw = /** @type {{ type: unknown, winnerEventId?: unknown, loserEventId?: unknown }} */ (comparator);
  requireNonEmptyString(raw.type, 'comparator.type', CTX);
  const winnerEventId = freezeEventId(raw.winnerEventId);
  const loserEventId = freezeEventId(raw.loserEventId);
  /** @type {{ type: string, winnerEventId?: Readonly<Record<string, unknown>>, loserEventId?: Readonly<Record<string, unknown>> }} */
  const frozen = { type: /** @type {string} */ (raw.type) };
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
  /**
   * Creates a frozen ConflictResolution.
   *
   * @param {{
   *   reducerId: string,
   *   basis: { code: string, reason?: string },
   *   winnerMode: 'immediate'|'eventual',
   *   comparator?: { type: string, winnerEventId?: Record<string, unknown>, loserEventId?: Record<string, unknown> }
   * }} fields - Resolution fields.
   */
  constructor({ reducerId, basis, winnerMode, comparator }) {
    this.reducerId = requireNonEmptyString(reducerId, 'reducerId', CTX);
    this.basis = freezeBasis(basis);
    this.winnerMode = requireEnum(winnerMode, VALID_WINNER_MODES, { name: 'winnerMode', context: CTX });
    this.comparator = freezeComparator(comparator);
    Object.freeze(this);
  }

  /**
   * Builds a ConflictResolution from conflict candidate parameters.
   *
   * @param {{
   *   reducerId: string,
   *   kind: string,
   *   code: string,
   *   winner: { eventId: { lamport: number, writerId: string, patchSha: string, opIndex: number } },
   *   loser: { receiptReason?: string, eventId: { lamport: number, writerId: string, patchSha: string, opIndex: number } }
   * }} options - Candidate resolution parameters.
   * @returns {ConflictResolution}
   */
  static fromCandidate({ reducerId, kind, code, winner, loser }) {
    const basis = { code };
    if (typeof loser.receiptReason === 'string' && loser.receiptReason.length > 0) {
      /** @type {{ code: string, reason?: string }} */ (basis).reason = loser.receiptReason;
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
