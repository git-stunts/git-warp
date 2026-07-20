import { requireNonEmptyString } from '../utils/scalarValidation.ts';

/** Destination frontier after an obstruction prevents admission. */
export default class UnchangedAdmissionPosture {
  readonly kind: 'unchanged' = 'unchanged';
  readonly frontierRef: string;

  constructor(frontierRef: string) {
    requireNonEmptyString(frontierRef, 'frontierRef');
    this.frontierRef = frontierRef;
    Object.freeze(this);
  }
}
