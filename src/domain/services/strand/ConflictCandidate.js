/**
 * ConflictCandidate — runtime-backed intermediate conflict record before trace assembly.
 *
 * @module domain/services/strand/ConflictCandidate
 */

import ConflictTarget from '../../types/conflict/ConflictTarget.js';
import ConflictResolution from '../../types/conflict/ConflictResolution.js';
import OpRecord from './OpRecord.js';
import { requireEnum } from '../../types/conflict/validation.js';

const CTX = 'ConflictCandidate';
const VALID_KINDS = new Set(['supersession', 'eventual_override', 'redundancy']);

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
    if (!(target instanceof ConflictTarget)) {
      throw new TypeError(`${CTX}: target must be a ConflictTarget instance`);
    }
    if (!(winner instanceof OpRecord)) {
      throw new TypeError(`${CTX}: winner must be an OpRecord instance`);
    }
    if (!(loser instanceof OpRecord)) {
      throw new TypeError(`${CTX}: loser must be an OpRecord instance`);
    }
    if (!(resolution instanceof ConflictResolution)) {
      throw new TypeError(`${CTX}: resolution must be a ConflictResolution instance`);
    }
    this.kind = requireEnum(kind, VALID_KINDS, { name: 'kind', context: CTX });
    this.target = target;
    this.winner = winner;
    this.loser = loser;
    this.resolution = resolution;
    this.noteCodes = Object.freeze(noteCodes.slice());
    Object.freeze(this);
  }
}
