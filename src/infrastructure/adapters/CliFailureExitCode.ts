import AdapterValidationError from '../../domain/errors/AdapterValidationError.ts';

const MAXIMUM_PROCESS_EXIT_CODE = 255;

/** A failure status can never report successful termination. */
export default class CliFailureExitCode {
  readonly value: number;

  constructor(value: number) {
    if (!Number.isInteger(value) || value < 1 || value > MAXIMUM_PROCESS_EXIT_CODE) {
      throw new AdapterValidationError('CLI failure exit status must be nonzero and bounded');
    }
    this.value = value;
    Object.freeze(this);
  }
}
