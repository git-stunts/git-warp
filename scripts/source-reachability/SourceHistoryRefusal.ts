/** Unavailable or invalid Git history cannot authorize an allowance. */
export default class SourceHistoryRefusal {
  readonly reason: string;

  constructor(reason: string) {
    this.reason = reason;
    Object.freeze(this);
  }
}
