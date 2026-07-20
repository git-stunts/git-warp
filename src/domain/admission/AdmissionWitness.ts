import type ConflictWitness from './ConflictWitness.ts';
import type DerivationWitness from './DerivationWitness.ts';
import type ObstructionWitness from './ObstructionWitness.ts';
import type PluralityWitness from './PluralityWitness.ts';

/** Evidence variants accepted by the exhaustive admission classifier. */
export type AdmissionWitness =
  | DerivationWitness
  | PluralityWitness
  | ConflictWitness
  | ObstructionWitness;
