import { requireNonEmptyString } from '../utils/scalarValidation.ts';

/** Operational failure outside the four-way causal admission algebra. */
export default class AdmissionRuntimeFailure {
  readonly code: string;
  readonly message: string;

  constructor(code: string, message: string) {
    requireNonEmptyString(code, 'code');
    requireNonEmptyString(message, 'message');
    this.code = code;
    this.message = message;
    Object.freeze(this);
  }
}
