import WarpError from '../errors/WarpError.ts';
import ObstructionWitness from './ObstructionWitness.ts';
import UnchangedAdmissionPosture from './UnchangedAdmissionPosture.ts';

/** Proposal blocked by destination law, authority, evidence, or basis gates. */
export default class ObstructedAdmission {
  readonly kind: 'obstruction' = 'obstruction';
  readonly witness: ObstructionWitness;
  readonly residual: UnchangedAdmissionPosture;

  constructor(witness: ObstructionWitness) {
    if (!(witness instanceof ObstructionWitness)) {
      throw new WarpError('witness must be an ObstructionWitness', 'E_VALIDATION');
    }
    this.witness = witness;
    this.residual = new UnchangedAdmissionPosture(witness.evaluation.destinationBasisRef);
    Object.freeze(this);
  }
}
