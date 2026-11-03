export type CustodyPhase = 'reserved' | 'prepared' | 'armed' | 'settled' | 'cancelled';
export type CustodyAcknowledgedStatus = 'admitted' | 'recovered' | 'prepared' | 'armed' | 'settled' | 'cancelled';
export type CustodyStage = 'preparation' | 'settlement';
export type CustodyRefusalReason =
  | 'capacity-full' | 'binding-conflict' | 'cancelled' | 'policy-mismatch' | 'contention'
  | 'not-reserved' | 'not-prepared' | 'not-settled' | 'already-armed' | 'already-settled'
  | 'irreversible' | 'preparation-mismatch' | 'settlement-mismatch';
