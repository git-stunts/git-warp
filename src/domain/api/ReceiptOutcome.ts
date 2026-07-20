export type ReadJoinReceiptOutcome =
  | 'accepted'
  | 'obstructed'
  | 'conflicted'
  | 'underdetermined'
  | 'rejected';

export const READ_JOIN_RECEIPT_OUTCOMES: ReadonlySet<ReadJoinReceiptOutcome> = new Set([
  'accepted',
  'obstructed',
  'conflicted',
  'underdetermined',
  'rejected',
]);
