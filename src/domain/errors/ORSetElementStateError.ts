import WarpError, { type WarpErrorOptions } from "./WarpError.ts";

/**
 * Error class for ORSetElementState construction invariants.
 */
export default class ORSetElementStateError extends WarpError {
  constructor(message: string, options: WarpErrorOptions = {}) {
    super(message, "E_ORSET_ELEMENT_STATE_INPUT", options);
  }
}
