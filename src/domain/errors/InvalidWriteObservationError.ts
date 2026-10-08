import PatchError from './PatchError.ts';

/** A decoded observation violates the journal publication-basis contract. */
export default class InvalidWriteObservationError extends PatchError {
  constructor(message: string) {
    super(message, { code: 'E_PATCH_NO_STATE' });
    this.name = 'InvalidWriteObservationError';
  }
}
