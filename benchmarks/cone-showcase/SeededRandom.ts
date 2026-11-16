/** A seeded mulberry32 stream, so every run draws the same corpus and the same saves. */
export default class SeededRandom {
  #state: number;

  constructor(seed: number) {
    if (!Number.isSafeInteger(seed)) {
      throw new RangeError('SeededRandom needs an integer seed');
    }
    this.#state = seed >>> 0;
  }

  next(): number {
    this.#state = (this.#state + 0x6d2b79f5) >>> 0;
    let value = this.#state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  pick<TValue>(items: readonly TValue[]): TValue {
    const item = items[Math.floor(this.next() * items.length)];
    if (item === undefined) {
      throw new RangeError('cannot pick from an empty list');
    }
    return item;
  }
}
