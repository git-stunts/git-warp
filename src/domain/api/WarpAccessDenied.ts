/** A typed access refusal. Its `cause` must be safe to show the caller. */
export default class WarpAccessDenied {
  readonly cause: string;

  constructor(cause: string) {
    this.cause = cause;
    Object.freeze(this);
  }
}
