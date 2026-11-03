import WarpError, { type WarpErrorOptions } from './WarpError.ts';

/**
 * Error class for observation identity and custody values (#1067). Expected
 * custody outcomes are returned as variants; this reports programmer misuse.
 *
 * ## Error Codes
 *
 * | Code | Description |
 * |------|-------------|
 * | `E_OBSERVATION_CUSTODY_INVALID` | A value violates its constructor invariants |
 * | `E_OBSERVATION_CUSTODY_MISUSE` | A transition was requested with inputs it can never accept |
 */
export default class ObservationCustodyError extends WarpError {
  constructor(message: string, options: WarpErrorOptions = {}) {
    super(message, 'E_OBSERVATION_CUSTODY_INVALID', options);
  }
}
