import WarpError, { type WarpErrorOptions } from './WarpError.ts';

/**
 * Error class for cone-bounded records, keys and bases (#1039).
 *
 * ## Error Codes
 *
 * | Code | Description |
 * |------|-------------|
 * | `E_CONE_RECORD_INVALID` | A record, key or basis violates its constructor invariants |
 * | `E_CONE_RECORD_CORRUPT` | A stored record or basis does not decode to the requested identity |
 */
export default class ConeRecordError extends WarpError {
  constructor(message: string, options: WarpErrorOptions = {}) {
    super(message, 'E_CONE_RECORD_INVALID', options);
  }
}
