import type ConflictAdmission from './ConflictAdmission.ts';
import type DerivedAdmission from './DerivedAdmission.ts';
import type ObstructedAdmission from './ObstructedAdmission.ts';
import type PluralAdmission from './PluralAdmission.ts';

/** Exhaustive causal classification for a completed, well-formed admission. */
export type AdmissionOutcome =
  | DerivedAdmission
  | PluralAdmission
  | ConflictAdmission
  | ObstructedAdmission;
