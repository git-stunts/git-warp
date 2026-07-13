export type ReceiptOutcome =
  | 'accepted'
  | 'obstructed'
  | 'conflicted'
  | 'underdetermined'
  | 'rejected';

export type WriteOutcome = ReceiptOutcome;
export type ReadOutcome = ReceiptOutcome;
export type JoinOutcome = ReceiptOutcome;

export const RECEIPT_OUTCOMES: ReadonlySet<ReceiptOutcome> = new Set([
  'accepted',
  'obstructed',
  'conflicted',
  'underdetermined',
  'rejected',
]);
