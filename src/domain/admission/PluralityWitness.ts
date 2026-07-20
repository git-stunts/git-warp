import WarpError from '../errors/WarpError.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';
import AdmissionEvaluation from './AdmissionEvaluation.ts';
import { freezeAdmissionRefs } from './admissionValidation.ts';

export type PluralityWitnessFields = {
  readonly evaluation: AdmissionEvaluation;
  readonly localCoordinateRef: string;
  readonly incomingCoordinateRef: string;
  readonly retainedCoordinateRefs: readonly string[];
  readonly derivationEvidenceRef: string;
  readonly footprintComparisonRef: string;
  readonly concurrencyEvidenceRef: string;
  readonly nonInterferenceEvidenceRef: string;
};

/** Evidence that concurrent coordinates may lawfully coexist without interference. */
export default class PluralityWitness {
  readonly evaluation: AdmissionEvaluation;
  readonly localCoordinateRef: string;
  readonly incomingCoordinateRef: string;
  readonly retainedCoordinateRefs: readonly string[];
  readonly derivationEvidenceRef: string;
  readonly footprintComparisonRef: string;
  readonly concurrencyEvidenceRef: string;
  readonly nonInterferenceEvidenceRef: string;

  constructor(fields: PluralityWitnessFields) {
    const checked = requireFields(fields);
    const retainedCoordinateRefs = requireRetainedCoordinates(checked);
    requireNonEmptyString(checked.derivationEvidenceRef, 'derivationEvidenceRef');
    requireNonEmptyString(checked.footprintComparisonRef, 'footprintComparisonRef');
    requireNonEmptyString(checked.concurrencyEvidenceRef, 'concurrencyEvidenceRef');
    requireNonEmptyString(checked.nonInterferenceEvidenceRef, 'nonInterferenceEvidenceRef');
    this.evaluation = checked.evaluation;
    this.localCoordinateRef = checked.localCoordinateRef;
    this.incomingCoordinateRef = checked.incomingCoordinateRef;
    this.retainedCoordinateRefs = retainedCoordinateRefs;
    this.derivationEvidenceRef = checked.derivationEvidenceRef;
    this.footprintComparisonRef = checked.footprintComparisonRef;
    this.concurrencyEvidenceRef = checked.concurrencyEvidenceRef;
    this.nonInterferenceEvidenceRef = checked.nonInterferenceEvidenceRef;
    Object.freeze(this);
  }
}

function requireFields(fields: PluralityWitnessFields): PluralityWitnessFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('PluralityWitness fields are required', 'E_VALIDATION');
  }
  if (!(fields.evaluation instanceof AdmissionEvaluation)) {
    throw new WarpError('evaluation must be an AdmissionEvaluation', 'E_VALIDATION');
  }
  requireNonEmptyString(fields.localCoordinateRef, 'localCoordinateRef');
  requireNonEmptyString(fields.incomingCoordinateRef, 'incomingCoordinateRef');
  if (fields.localCoordinateRef === fields.incomingCoordinateRef) {
    throw new WarpError('Plural admission requires distinct coordinates', 'E_VALIDATION');
  }
  return fields;
}

function requireRetainedCoordinates(fields: PluralityWitnessFields): readonly string[] {
  const retained = freezeAdmissionRefs(fields.retainedCoordinateRefs, 'retainedCoordinateRefs', 2);
  if (
    !retained.includes(fields.localCoordinateRef) ||
    !retained.includes(fields.incomingCoordinateRef)
  ) {
    throw new WarpError(
      'retainedCoordinateRefs must include the local and incoming coordinates',
      'E_VALIDATION'
    );
  }
  return retained;
}
