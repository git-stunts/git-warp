import WarpError from '../errors/WarpError.ts';
import ReadReceipt from './ReadReceipt.ts';
import type { ReadingValue } from './ReadingValue.ts';
import { isReadingValue } from './ReadingValueRuntime.ts';

export type { ReadingValue } from './ReadingValue.ts';

export type ReadingResultOptions<TValue extends ReadingValue = ReadingValue> = {
  readonly value: TValue;
  readonly receipt: ReadReceipt;
};

export default class ReadingResult<TValue extends ReadingValue = ReadingValue> {
  readonly receipt: ReadReceipt;
  readonly value: TValue;

  constructor(options: ReadingResultOptions<TValue> | null | undefined) {
    const fields = requireReadingResultOptions(options);
    if (!isReadingValue(fields.value)) {
      throw new WarpError('ReadingResult value must be snapshot-compatible data', 'E_READING_RESULT_VALUE');
    }
    if (!(fields.receipt instanceof ReadReceipt)) {
      throw new WarpError('ReadingResult requires a ReadReceipt', 'E_READING_RESULT_RECEIPT');
    }

    this.value = fields.value;
    this.receipt = fields.receipt;
    Object.freeze(this);
  }
}

function requireReadingResultOptions<TValue extends ReadingValue>(
  options: ReadingResultOptions<TValue> | null | undefined,
): ReadingResultOptions<TValue> {
  if (options === null || options === undefined) {
    throw new WarpError('ReadingResult options are required', 'E_READING_RESULT_OPTIONS');
  }
  return options;
}
