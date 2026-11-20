import WarpError, { type WarpErrorOptions } from './WarpError.ts';

/**
 * Thrown when an observer identity fails its constructor invariants.
 */
export default class ObserverIdentityError extends WarpError {
  constructor(message: string, options: WarpErrorOptions | null = {}) {
    super(message, 'E_OBSERVER_IDENTITY', options);
  }
}
