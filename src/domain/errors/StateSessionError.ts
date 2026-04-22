import WarpError, { type WarpErrorOptions } from "./WarpError.ts";

/**
 * Error class for StateSession-owned invariants and lifecycle misuse.
 */
export default class StateSessionError extends WarpError {
  constructor(message: string, options: WarpErrorOptions = {}) {
    super(message, "E_STATE_SESSION_INPUT", options);
  }
}
