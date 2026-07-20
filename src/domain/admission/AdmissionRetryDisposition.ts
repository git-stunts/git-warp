import WarpError from '../errors/WarpError.ts';

const AFTER_CHANGE = 'after-change';
const WITH_EVIDENCE = 'with-evidence';
const NEVER = 'never';
const UNKNOWN = 'unknown'; // nosemgrep: ts-no-unknown-outside-adapters -- semantic value

export type AdmissionRetryDispositionValue =
  | typeof AFTER_CHANGE
  | typeof WITH_EVIDENCE
  | typeof NEVER
  | typeof UNKNOWN;

const VALUES: readonly AdmissionRetryDispositionValue[] = Object.freeze([
  AFTER_CHANGE,
  WITH_EVIDENCE,
  NEVER,
  UNKNOWN,
]);

/** States whether retry can become meaningful and what must change first. */
export default class AdmissionRetryDisposition {
  readonly value: AdmissionRetryDispositionValue;

  constructor(value: string) {
    const supported = VALUES.find((candidate) => candidate === value);
    if (supported === undefined) {
      throw new WarpError(
        `Admission retry disposition must be one of: ${VALUES.join(', ')}`,
        'E_VALIDATION'
      );
    }
    this.value = supported;
    Object.freeze(this);
  }

  static afterChange(): AdmissionRetryDisposition {
    return new AdmissionRetryDisposition(AFTER_CHANGE);
  }

  static withEvidence(): AdmissionRetryDisposition {
    return new AdmissionRetryDisposition(WITH_EVIDENCE);
  }

  static never(): AdmissionRetryDisposition {
    return new AdmissionRetryDisposition(NEVER);
  }

  static unknown(): AdmissionRetryDisposition { // nosemgrep: ts-no-unknown-outside-adapters -- semantic constructor
    return new AdmissionRetryDisposition(UNKNOWN);
  }
}
