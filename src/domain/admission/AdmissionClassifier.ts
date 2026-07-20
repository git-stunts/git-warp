import WarpError from '../errors/WarpError.ts';
import type { AdmissionOutcome } from './AdmissionOutcome.ts';
import type { AdmissionWitness } from './AdmissionWitness.ts';
import ConflictAdmission from './ConflictAdmission.ts';
import ConflictWitness from './ConflictWitness.ts';
import DerivationWitness from './DerivationWitness.ts';
import DerivedAdmission from './DerivedAdmission.ts';
import ObstructedAdmission from './ObstructedAdmission.ts';
import ObstructionWitness from './ObstructionWitness.ts';
import PluralAdmission from './PluralAdmission.ts';
import PluralityWitness from './PluralityWitness.ts';

/** Maps one runtime-backed witness to exactly one causal admission outcome. */
export default class AdmissionClassifier {
  classify(witness: DerivationWitness): DerivedAdmission;
  classify(witness: PluralityWitness): PluralAdmission;
  classify(witness: ConflictWitness): ConflictAdmission;
  classify(witness: ObstructionWitness): ObstructedAdmission;
  classify(witness: AdmissionWitness): AdmissionOutcome;
  classify(witness: AdmissionWitness): AdmissionOutcome {
    if (witness instanceof DerivationWitness) {
      return new DerivedAdmission(witness);
    }
    if (witness instanceof PluralityWitness) {
      return new PluralAdmission(witness);
    }
    if (witness instanceof ConflictWitness) {
      return new ConflictAdmission(witness);
    }
    if (witness instanceof ObstructionWitness) {
      return new ObstructedAdmission(witness);
    }
    throw new WarpError('witness must be an AdmissionWitness', 'E_VALIDATION');
  }
}
