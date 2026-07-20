import { requireNonEmptyString } from '../utils/scalarValidation.ts';

/** Contested relation retained without admitting the proposed suffix. */
export default class UnsettledConflictAdmissionPosture {
  readonly kind: 'unsettled-conflict' = 'unsettled-conflict';
  readonly conflictRef: string;

  constructor(conflictRef: string) {
    requireNonEmptyString(conflictRef, 'conflictRef');
    this.conflictRef = conflictRef;
    Object.freeze(this);
  }
}
