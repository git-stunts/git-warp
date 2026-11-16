/** Derived count statistics; null means no measured samples. */
export default class CountSpread {
  readonly min: number | null;
  readonly p50: number | null;
  readonly max: number | null;

  constructor(values: readonly number[]) {
    if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
      throw new RangeError('process count statistics require nonnegative integers');
    }
    const sorted = [...values].sort((left, right) => left - right);
    this.min = sorted[0] ?? null;
    this.p50 = sorted[Math.max(0, Math.ceil(sorted.length / 2) - 1)] ?? null;
    this.max = sorted[sorted.length - 1] ?? null;
    Object.freeze(this);
  }
}
