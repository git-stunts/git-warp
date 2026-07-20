import WarpError from '../errors/WarpError.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';

const CAPABILITY_DENIED = 'capability-denied';
const UNSUPPORTED_EVIDENCE = 'unsupported-evidence';
const LAW_VIOLATION = 'law-violation';
const STALE_BASIS = 'stale-basis';
const BUDGET_EXCEEDED = 'budget-exceeded';
const INVALID_DERIVATION = 'invalid-derivation';
const UNSUPPORTED_CONTRACT = 'unsupported-contract';

export type AdmissionObstructionFamily =
  | typeof CAPABILITY_DENIED
  | typeof UNSUPPORTED_EVIDENCE
  | typeof LAW_VIOLATION
  | typeof STALE_BASIS
  | typeof BUDGET_EXCEEDED
  | typeof INVALID_DERIVATION
  | typeof UNSUPPORTED_CONTRACT;

const FAMILIES: readonly AdmissionObstructionFamily[] = Object.freeze([
  CAPABILITY_DENIED,
  UNSUPPORTED_EVIDENCE,
  LAW_VIOLATION,
  STALE_BASIS,
  BUDGET_EXCEEDED,
  INVALID_DERIVATION,
  UNSUPPORTED_CONTRACT,
]);

/** Stable obstruction family plus a lawpack-qualified reason code. */
export default class AdmissionObstructionReason {
  readonly family: AdmissionObstructionFamily;
  readonly code: string;

  constructor(family: string, code: string) {
    const supported = FAMILIES.find((candidate) => candidate === family);
    if (supported === undefined) {
      throw new WarpError(
        `Admission obstruction family must be one of: ${FAMILIES.join(', ')}`,
        'E_VALIDATION'
      );
    }
    requireQualifiedCode(code);
    this.family = supported;
    this.code = code;
    Object.freeze(this);
  }

  static invalidDerivation(code: string): AdmissionObstructionReason {
    return new AdmissionObstructionReason(INVALID_DERIVATION, code);
  }

  static staleBasis(code: string): AdmissionObstructionReason {
    return new AdmissionObstructionReason(STALE_BASIS, code);
  }
}

function requireQualifiedCode(code: string): void {
  requireNonEmptyString(code, 'code');
  const separator = code.indexOf('.');
  if (separator < 1 || separator === code.length - 1) {
    throw new WarpError('Admission obstruction code must be namespace-qualified', 'E_VALIDATION');
  }
}
