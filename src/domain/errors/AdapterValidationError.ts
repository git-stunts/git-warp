import WarpError, { type WarpErrorOptions } from './WarpError.ts';

/** Error thrown when adapter inputs fail safety or shape validation. */
export default class AdapterValidationError extends WarpError {
  constructor(message: string, options: WarpErrorOptions = {}) {
    super(message, 'E_ADAPTER_VALIDATION', options);
  }
}
