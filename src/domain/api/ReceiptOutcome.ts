export type ReceiptOutcome =
  | 'accepted'
  | 'resolved'
  | 'obstructed'
  | 'conflicted'
  | 'underdetermined'
  | 'rejected';

export type WriteOutcome = Exclude<ReceiptOutcome, 'resolved'>;
export type ReadOutcome = Exclude<ReceiptOutcome, 'accepted' | 'conflicted'>;
export type JoinOutcome = WriteOutcome;
