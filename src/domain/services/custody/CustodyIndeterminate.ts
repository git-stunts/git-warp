/** The transition's outcome could not be established; it may or may not have happened. */
export default class CustodyIndeterminate {
  readonly cause: Error;

  constructor(cause: Error) {
    this.cause = cause;
    Object.freeze(this);
  }
}
