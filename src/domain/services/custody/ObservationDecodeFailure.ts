/** Stored bytes are not the one canonical encoding of a value this version reads. */
export default class ObservationDecodeFailure {
  readonly reason: string;

  constructor(reason: string) {
    this.reason = reason;
    Object.freeze(this);
  }
}
