/**
 * Runtime-backed immutable byte value for public snapshots.
 */
export default class ImmutableBytes {
  readonly #bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.#bytes = new Uint8Array(bytes);
    Object.freeze(this);
  }

  get length(): number {
    return this.#bytes.length;
  }

  at(index: number): number | undefined {
    return this.#bytes.at(index);
  }

  toUint8Array(): Uint8Array {
    return new Uint8Array(this.#bytes);
  }

  toArray(): readonly number[] {
    return Object.freeze([...this.#bytes]);
  }

  values(): IterableIterator<number> {
    return this.#bytes.values();
  }

  [Symbol.iterator](): IterableIterator<number> {
    return this.values();
  }
}
