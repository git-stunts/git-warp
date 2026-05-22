import WarpError, { type WarpErrorOptions } from './WarpError.ts';

/** Error thrown when a Continuum artifact would create shadow authority. */
export default class ContinuumArtifactAuthorityError extends WarpError {
  constructor(message: string, options: WarpErrorOptions = {}) {
    super(message, 'E_CONTINUUM_ARTIFACT_AUTHORITY', options);
  }
}
