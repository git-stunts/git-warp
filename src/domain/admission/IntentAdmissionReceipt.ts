import type DerivedIntentAdmissionReceipt from './DerivedIntentAdmissionReceipt.ts';
import type ObstructedIntentAdmissionReceipt from './ObstructedIntentAdmissionReceipt.ts';

/** Outcomes reachable through the migration-only descriptor journal admission path. */
export type IntentAdmissionReceipt =
  | DerivedIntentAdmissionReceipt
  | ObstructedIntentAdmissionReceipt;
