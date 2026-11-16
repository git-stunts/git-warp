/** A read that did not produce a complete result, retaining its receipt context. */
export default class MarginsUnavailable {
  readonly observer: string;
  readonly status: string;
  readonly reason: string;

  constructor(observer: string, status: string, reason: string) {
    if (observer.length === 0 || status.length === 0 || reason.length === 0) {
      throw new TypeError('an incomplete margins read needs observer, status and reason');
    }
    this.observer = observer;
    this.status = status;
    this.reason = reason;
    Object.freeze(this);
  }
}
