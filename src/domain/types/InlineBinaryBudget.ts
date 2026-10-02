import WarpError from '../errors/WarpError.ts';
import type { PropValue } from './PropValue.ts';

const MAX_INLINE_BINARY_BYTES = 64 * 1024;

/** Counts binary occurrences in one already-validated property before copying. */
export default class InlineBinaryBudget {
  #remaining = MAX_INLINE_BINARY_BYTES;

  constructor() { Object.freeze(this); }

  static require(value: PropValue): void {
    new InlineBinaryBudget().#consume(value);
  }

  #consume(value: PropValue): void {
    if (value instanceof Uint8Array) {
      this.#consumeBytes(value.byteLength);
      return;
    }
    if (value === null || typeof value !== 'object') { return; }
    const entries = Object.values(value);
    for (const entry of entries) { this.#consume(entry); }
  }

  #consumeBytes(length: number): void {
    if (length > this.#remaining) {
      throw new WarpError(
        'Inline binary property exceeds 64 KiB; store the payload as a streaming content asset',
        'E_INLINE_BINARY_LIMIT',
        { context: { maximum: MAX_INLINE_BINARY_BYTES } },
      );
    }
    this.#remaining -= length;
  }
}
