import WarpError from './WarpError.ts';

/**
 * A write attempt record in layout version 1, which only clones of unreleased `main`
 * wrote before #1072. Nothing reads it: delete the ref this error names.
 */
export default class RetiredWriteAttemptError extends WarpError {
  readonly ref: string;

  constructor(ref: string) {
    super(`The write attempt record at ${ref} uses retired layout version 1 and cannot be read; delete that ref`, 'E_WRITE_ATTEMPT_RETIRED');
    this.ref = ref;
  }
}
