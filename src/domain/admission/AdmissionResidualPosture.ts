import type AdvancedAdmissionPosture from './AdvancedAdmissionPosture.ts';
import type PluralAdmissionPosture from './PluralAdmissionPosture.ts';
import type UnchangedAdmissionPosture from './UnchangedAdmissionPosture.ts';
import type UnsettledConflictAdmissionPosture from './UnsettledConflictAdmissionPosture.ts';

export type AdmissionResidualPosture =
  | AdvancedAdmissionPosture
  | PluralAdmissionPosture
  | UnsettledConflictAdmissionPosture
  | UnchangedAdmissionPosture;
