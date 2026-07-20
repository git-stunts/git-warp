import type { EvidenceHandle } from './Evidence.ts';

export type AdmissionObstructionFamily =
  | 'capability-denied'
  | 'unsupported-evidence'
  | 'law-violation'
  | 'stale-basis'
  | 'budget-exceeded'
  | 'invalid-derivation'
  | 'unsupported-contract';

export type AdmissionRetryDisposition = 'after-change' | 'with-evidence' | 'never' | 'unknown'; // nosemgrep: ts-no-unknown-outside-adapters -- semantic value

export type AdmissionEvaluation = Readonly<{
  sourceParticipant: string;
  destinationRuntime: string;
  sourceBasis: EvidenceHandle;
  destinationBasis: EvidenceHandle;
  proposal: EvidenceHandle;
  law: EvidenceHandle;
  profile: EvidenceHandle;
  coordinate: EvidenceHandle;
}>;

export type DerivationWitness = Readonly<{
  evaluation: AdmissionEvaluation;
  admittedSuffix: EvidenceHandle;
  resultingFrontier: EvidenceHandle;
  authorityEvidence: EvidenceHandle;
  directExtensionEvidence: EvidenceHandle;
}>;

export type PluralityWitness = Readonly<{
  evaluation: AdmissionEvaluation;
  localCoordinate: EvidenceHandle;
  incomingCoordinate: EvidenceHandle;
  retainedCoordinates: readonly EvidenceHandle[];
  derivationEvidence: EvidenceHandle;
  footprintComparison: EvidenceHandle;
  concurrencyEvidence: EvidenceHandle;
  nonInterferenceEvidence: EvidenceHandle;
}>;

export type ConflictWitness = Readonly<{
  evaluation: AdmissionEvaluation;
  conflict: EvidenceHandle;
  claims: readonly EvidenceHandle[];
  overlappingFootprints: readonly EvidenceHandle[];
  contestedDomain: string;
  derivationEvidence: EvidenceHandle;
  overlapEvidence: EvidenceHandle;
  resolutionProcedures: readonly EvidenceHandle[];
}>;

export type ObstructionWitness = Readonly<{
  evaluation: AdmissionEvaluation;
  reason: Readonly<{
    family: AdmissionObstructionFamily;
    code: string;
  }>;
  suppliedEvidence: readonly EvidenceHandle[];
  requiredEvidence: readonly EvidenceHandle[];
  failedCondition: EvidenceHandle;
  retry: Readonly<{ disposition: AdmissionRetryDisposition }>;
}>;

export type DerivedAdmission = Readonly<{
  kind: 'derived';
  witness: DerivationWitness;
  residual: Readonly<{ kind: 'advanced'; frontier: EvidenceHandle }>;
}>;

export type PluralAdmission = Readonly<{
  kind: 'plural';
  witness: PluralityWitness;
  residual: Readonly<{ kind: 'plural'; coordinates: readonly EvidenceHandle[] }>;
}>;

export type ConflictAdmission = Readonly<{
  kind: 'conflict';
  witness: ConflictWitness;
  residual: Readonly<{ kind: 'unsettled-conflict'; conflict: EvidenceHandle }>;
}>;

export type ObstructedAdmission = Readonly<{
  kind: 'obstruction';
  witness: ObstructionWitness;
  residual: Readonly<{ kind: 'unchanged'; frontier: EvidenceHandle }>;
}>;

export type AdmissionOutcome =
  | DerivedAdmission
  | PluralAdmission
  | ConflictAdmission
  | ObstructedAdmission;
