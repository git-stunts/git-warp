import type ObservationReceipt from './ObservationReceipt.ts';
import type SettlementReceipt from './SettlementReceipt.ts';
import type { WriteIntentInput } from './IntentSequence.ts';
import type WriteReceipt from './WriteReceipt.ts';

/** Receipts emitted by canonical public write, observe, and settle operations. */
export type Receipt =
  | WriteReceipt<WriteIntentInput>
  | ObservationReceipt
  | SettlementReceipt;
