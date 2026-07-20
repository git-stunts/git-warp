import { requireNonEmptyString } from '../utils/scalarValidation.ts';

/** Destination frontier after a direct extension is admitted. */
export default class AdvancedAdmissionPosture {
  readonly kind: 'advanced' = 'advanced';
  readonly frontierRef: string;

  constructor(frontierRef: string) {
    requireNonEmptyString(frontierRef, 'frontierRef');
    this.frontierRef = frontierRef;
    Object.freeze(this);
  }
}
