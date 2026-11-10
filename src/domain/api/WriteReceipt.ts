import type IndeterminateWriteReceipt from './IndeterminateWriteReceipt.ts';
import type RetainedWriteReceipt from './RetainedWriteReceipt.ts';
import type UnpublishedWriteReceipt from './UnpublishedWriteReceipt.ts';
import type UnretainedWriteReceipt from './UnretainedWriteReceipt.ts';

/** What `execute` returns. Narrow the variant before reading its success fields. */
export type WriteReceipt =
  | RetainedWriteReceipt | UnretainedWriteReceipt | UnpublishedWriteReceipt | IndeterminateWriteReceipt;
