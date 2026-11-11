import {
  IndeterminateWriteReceipt, RetainedWriteReceipt, UnpublishedWriteReceipt, UnretainedWriteReceipt,
  type WriteReceipt,
} from '../../index.ts';

/** Names a write receipt by its class, and an unpublished one by its cause too. */
export default function writeResult(receipt: WriteReceipt): string {
  if (receipt instanceof RetainedWriteReceipt) {
    return 'retained';
  }
  if (receipt instanceof UnretainedWriteReceipt) {
    return 'unretained';
  }
  if (receipt instanceof IndeterminateWriteReceipt) {
    return 'indeterminate';
  }
  if (receipt instanceof UnpublishedWriteReceipt) {
    return `unpublished: ${receipt.cause}`;
  }
  throw new TypeError('Warp returned a write receipt this witness does not know');
}
