import { freezeAdmissionRefs } from './admissionValidation.ts';

/** Lawfully retained coordinates after concurrent non-interfering admission. */
export default class PluralAdmissionPosture {
  readonly kind: 'plural' = 'plural';
  readonly coordinateRefs: readonly string[];

  constructor(coordinateRefs: readonly string[]) {
    this.coordinateRefs = freezeAdmissionRefs(coordinateRefs, 'coordinateRefs', 2);
    Object.freeze(this);
  }
}
