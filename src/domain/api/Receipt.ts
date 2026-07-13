import type JoinReceipt from './JoinReceipt.ts';
import type ReadReceipt from './ReadReceipt.ts';
import type WriteReceipt from './WriteReceipt.ts';

export type Receipt = WriteReceipt | ReadReceipt | JoinReceipt;
