/**
 * ConflictCandidate — runtime-backed intermediate conflict record before trace assembly.
 *
 * @module domain/services/strand/ConflictCandidate
 */

import ConflictTarget from '../../types/conflict/ConflictTarget.ts';
import ConflictResolution from '../../types/conflict/ConflictResolution.ts';
import OpRecord from './OpRecord.js';
import { requireEnum } from '../../types/conflict/validation.ts';
import StrandError from '../../errors/StrandError.ts';

const CTX = 'ConflictCandidate';
const VALID_KINDS = new Set(['supersession', 'eventual_override', 'redundancy']);

/**
 * Asserts that an instance matches its expected constructor, else throws StrandError.
 *
 * @param {unknown} value - The value to type-check
 * @param {Function} expectedClass - The class the value must be an instance of
 * @param {{ fieldName: string, code: string, expectedLabel: string }} options - Error metadata
 */
function assertInstance(value, expectedClass, options) {
  if (!(value instanceof expectedClass)) {
    throw new StrandError(
      `${CTX}: ${options.fieldName} must be ${options.expectedLabel}`,
      { code: options.code },
    );
  }
}

/**
 * A runtime-backed intermediate conflict record classified during candidate collection.
 *
 * Instances are frozen on construction.
 */
export default class ConflictCandidate {
  /**
   * Creates a frozen ConflictCandidate.
   *
   * @param {{
   *   kind: 'supersession'|'eventual_override'|'redundancy',
   *   target: ConflictTarget,
   *   winner: OpRecord,
   *   loser: OpRecord,
   *   resolution: ConflictResolution,
   *   noteCodes: string[]
   * }} fields - Candidate fields.
   */
  constructor({ kind, target, winner, loser, resolution, noteCodes }) {
    assertInstance(target, ConflictTarget, { fieldName: 'target', code: 'E_CANDIDATE_INVALID_TARGET', expectedLabel: 'a ConflictTarget instance' });
    assertInstance(winner, OpRecord, { fieldName: 'winner', code: 'E_CANDIDATE_INVALID_WINNER', expectedLabel: 'an OpRecord instance' });
    assertInstance(loser, OpRecord, { fieldName: 'loser', code: 'E_CANDIDATE_INVALID_LOSER', expectedLabel: 'an OpRecord instance' });
    assertInstance(resolution, ConflictResolution, { fieldName: 'resolution', code: 'E_CANDIDATE_INVALID_RESOLUTION', expectedLabel: 'a ConflictResolution instance' });
    this.kind = requireEnum(kind, VALID_KINDS, { name: 'kind', context: CTX });
    this.target = target;
    this.winner = winner;
    this.loser = loser;
    this.resolution = resolution;
    this.noteCodes = Object.freeze(noteCodes.slice());
    Object.freeze(this);
  }
}
