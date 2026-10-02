import WarpError from '../errors/WarpError.ts';
import { isPropValue, type PropValue } from './PropValue.ts';

const MAX_INLINE_BINARY_BYTES = 64 * 1024;

/** Snapshots one property while charging every binary allocation against its budget. */
export default class InlineBinaryBudget {
  #remaining = MAX_INLINE_BINARY_BYTES;

  constructor() { Object.freeze(this); }

  static copy(value: PropValue): PropValue {
    const snapshot = new InlineBinaryBudget().#copy(value);
    if (!isPropValue(snapshot)) {
      throw new WarpError('Inline snapshot contains an invalid property value', 'E_INLINE_PROPERTY_VALUE');
    }
    return snapshot;
  }

  #copy(value: PropValue): PropValue {
    if (value instanceof Uint8Array) {
      this.#consumeBytes(value.byteLength);
      return new Uint8Array(value);
    }
    if (value === null || typeof value !== 'object') { return value; }
    if (Array.isArray(value)) { return value.map((entry) => this.#copy(entry)); }
    requirePlainPropertyObject(value);
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, this.#copy(entry)]));
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

function requirePlainPropertyObject(value: PropValue): void {
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw new WarpError('Inline snapshot requires plain property objects', 'E_INLINE_PROPERTY_VALUE');
  }
}
