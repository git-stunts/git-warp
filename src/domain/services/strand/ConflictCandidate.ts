/**
 * ConflictCandidate — runtime-backed intermediate conflict record before trace assembly.
 *
 * @module domain/services/strand/ConflictCandidate
 */

import ConflictTarget from '../../types/conflict/ConflictTarget.ts';
import ConflictResolution from '../../types/conflict/ConflictResolution.ts';
import OpRecord from './OpRecord.ts';
import { requireEnum } from '../../types/conflict/validation.ts';
import StrandError from '../../errors/StrandError.ts';

const CTX = 'ConflictCandidate';
const VALID_KINDS = new Set(['supersession', 'eventual_override', 'redundancy']);

type ConflictKind = 'supersession' | 'eventual_override' | 'redundancy';

type ConflictCandidateFields = {
  kind: ConflictKind;
  target: ConflictTarget;
  winner: OpRecord;
  loser: OpRecord;
  resolution: ConflictResolution;
  noteCodes: string[];
};

/**
 * Asserts that an instance matches its expected constructor, else throws StrandError.
 */
function assertInstance(
  value: unknown,
  expectedClass: Function,
  options: { fieldName: string; code: string; expectedLabel: string },
): void {
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
  readonly kind: string;
  readonly target: ConflictTarget;
  readonly winner: OpRecord;
  readonly loser: OpRecord;
  readonly resolution: ConflictResolution;
  readonly noteCodes: readonly string[];

  constructor({ kind, target, winner, loser, resolution, noteCodes }: ConflictCandidateFields) {
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
