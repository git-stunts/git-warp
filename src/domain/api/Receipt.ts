import type JoinReceipt from './JoinReceipt.ts';
import type ReadReceipt from './ReadReceipt.ts';
import type { WriteIntentInput } from './IntentSequence.ts';
import type TimelineWriteReceipt from './TimelineWriteReceipt.ts';

export type Receipt = TimelineWriteReceipt<WriteIntentInput> | ReadReceipt | JoinReceipt;
