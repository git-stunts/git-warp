import WarpError from '../errors/WarpError.ts';
import AdvancedAdmissionPosture from './AdvancedAdmissionPosture.ts';
import DerivationWitness from './DerivationWitness.ts';

/** Direct frontier extension admitted by the destination runtime. */
export default class DerivedAdmission {
  readonly kind: 'derived' = 'derived';
  readonly witness: DerivationWitness;
  readonly residual: AdvancedAdmissionPosture;

  constructor(witness: DerivationWitness) {
    if (!(witness instanceof DerivationWitness)) {
      throw new WarpError('witness must be a DerivationWitness', 'E_VALIDATION');
    }
    this.witness = witness;
    this.residual = new AdvancedAdmissionPosture(witness.resultingFrontierRef);
    Object.freeze(this);
  }
}
