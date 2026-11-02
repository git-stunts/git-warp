/** A failed analysis cannot be mistaken for a surface with no violations. */
export default class SurfaceRefusal {
  readonly reason: string;

  constructor(reason: string) {
    if (reason.length === 0) throw new TypeError('A surface refusal requires a reason');
    this.reason = reason;
    Object.freeze(this);
  }
}
