import WarpError from '../errors/WarpError.ts';

/** Exact cumulative plaintext count; failed additions leave the count unchanged. */
export default class AssetByteCount {
  #value = 0;

  constructor() { Object.freeze(this); }

  get value(): number { return this.#value; }

  add(bytes: number): void {
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > Number.MAX_SAFE_INTEGER - this.#value) {
      throw new WarpError('Consumed asset size exceeds safe integer range', 'E_ASSET_SIZE_INVALID');
    }
    this.#value += bytes;
  }
}
