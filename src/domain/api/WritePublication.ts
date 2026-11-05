/** Opaque evidence of the exact patch a write published. */
export default class WritePublication {
  readonly #evidence: string;

  constructor(evidence: string) {
    this.#evidence = evidence;
    Object.freeze(this);
  }

  toString(): string {
    return this.#evidence;
  }
}
