import WarpError from '../errors/WarpError.ts';
import PluralAdmissionPosture from './PluralAdmissionPosture.ts';
import PluralityWitness from './PluralityWitness.ts';

/** Concurrent non-interfering coordinates lawfully retained as plural. */
export default class PluralAdmission {
  readonly kind: 'plural' = 'plural';
  readonly witness: PluralityWitness;
  readonly residual: PluralAdmissionPosture;

  constructor(witness: PluralityWitness) {
    if (!(witness instanceof PluralityWitness)) {
      throw new WarpError('witness must be a PluralityWitness', 'E_VALIDATION');
    }
    this.witness = witness;
    this.residual = new PluralAdmissionPosture(witness.retainedCoordinateRefs);
    Object.freeze(this);
  }
}
