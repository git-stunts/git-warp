import type ObservationReceipt from './ObservationReceipt.ts';
import type WriteReceipt from './WriteReceipt.ts';

/** Receipts emitted by the canonical v19 write and observe operations. */
export type Receipt = WriteReceipt | ObservationReceipt;
