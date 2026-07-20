import WarpError from '../errors/WarpError.ts';
import ConflictWitness from './ConflictWitness.ts';
import UnsettledConflictAdmissionPosture from './UnsettledConflictAdmissionPosture.ts';

/** Honest proposal retained outside admission because exclusive claims collide. */
export default class ConflictAdmission {
  readonly kind: 'conflict' = 'conflict';
  readonly witness: ConflictWitness;
  readonly residual: UnsettledConflictAdmissionPosture;

  constructor(witness: ConflictWitness) {
    if (!(witness instanceof ConflictWitness)) {
      throw new WarpError('witness must be a ConflictWitness', 'E_VALIDATION');
    }
    this.witness = witness;
    this.residual = new UnsettledConflictAdmissionPosture(witness.conflictRef);
    Object.freeze(this);
  }
}
