import WarpError from '../errors/WarpError.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';
import type AdmissionEvaluation from './AdmissionEvaluation.ts';
import { freezeAdmissionRefs, requireAdmissionEvaluation } from './admissionValidation.ts';

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
  const checked = requireAdmissionEvaluation(fields, 'PluralityWitness');
  requireNonEmptyString(checked.localCoordinateRef, 'localCoordinateRef');
  requireNonEmptyString(checked.incomingCoordinateRef, 'incomingCoordinateRef');
  if (checked.localCoordinateRef === checked.incomingCoordinateRef) {
    throw new WarpError('Plural admission requires distinct coordinates', 'E_VALIDATION');
  }
  return checked;
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
