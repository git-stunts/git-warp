import { describe, expect, it } from 'vitest';

import AdmissionClassifier from '../../../../src/domain/admission/AdmissionClassifier.ts';
import AdmissionEvaluation from '../../../../src/domain/admission/AdmissionEvaluation.ts';
import AdmissionObstructionReason from '../../../../src/domain/admission/AdmissionObstructionReason.ts';
import AdmissionRetryDisposition from '../../../../src/domain/admission/AdmissionRetryDisposition.ts';
import ConflictWitness from '../../../../src/domain/admission/ConflictWitness.ts';
import DerivationWitness from '../../../../src/domain/admission/DerivationWitness.ts';
import ObstructionWitness from '../../../../src/domain/admission/ObstructionWitness.ts';
import PluralityWitness from '../../../../src/domain/admission/PluralityWitness.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';

const classifier = new AdmissionClassifier();

function evaluation(): AdmissionEvaluation {
  return new AdmissionEvaluation({
    sourceParticipantId: 'participant:source',
    destinationRuntimeId: 'runtime:destination',
    sourceBasisRef: 'frontier:source:7',
    destinationBasisRef: 'frontier:destination:11',
    proposalDigest: 'sha256:proposal',
    lawDigest: 'sha256:law',
    profileDigest: 'sha256:profile',
    evaluationCoordinateRef: 'coordinate:destination:11',
  });
}

function directExtension(): DerivationWitness {
  return new DerivationWitness({
    evaluation: evaluation(),
    admittedSuffixRef: 'suffix:source:8',
    resultingFrontierRef: 'frontier:destination:12',
    authorityEvidenceRef: 'evidence:authority',
    directExtensionEvidenceRef: 'evidence:direct-extension',
  });
}

function disjointConcurrency(): PluralityWitness {
  return new PluralityWitness({
    evaluation: evaluation(),
    localCoordinateRef: 'coordinate:local',
    incomingCoordinateRef: 'coordinate:incoming',
    retainedCoordinateRefs: ['coordinate:local', 'coordinate:incoming'],
    derivationEvidenceRef: 'evidence:derivation',
    footprintComparisonRef: 'evidence:disjoint-footprints',
    concurrencyEvidenceRef: 'evidence:concurrent',
    nonInterferenceEvidenceRef: 'evidence:non-interference',
  });
}

function exclusiveOverlap(): ConflictWitness {
  return new ConflictWitness({
    evaluation: evaluation(),
    conflictRef: 'conflict:exclusive-overlap',
    claimRefs: ['claim:local', 'claim:incoming'],
    overlappingFootprintRefs: ['footprint:exclusive-resource'],
    contestedDomain: 'resource:exclusive',
    derivationEvidenceRef: 'evidence:derivation',
    overlapEvidenceRef: 'evidence:overlap',
    resolutionProcedureRefs: ['procedure:arbitrate'],
  });
}

function obstruction(
  reason: AdmissionObstructionReason,
  retry: AdmissionRetryDisposition
): ObstructionWitness {
  return new ObstructionWitness({
    evaluation: evaluation(),
    reason,
    suppliedEvidenceRefs: ['evidence:supplied'],
    requiredEvidenceRefs: ['evidence:required'],
    failedConditionRef: 'condition:admission-gate',
    retry,
  });
}

describe('AdmissionClassifier', () => {
  it.each([
    ['direct extension', directExtension(), 'derived'],
    ['disjoint concurrency', disjointConcurrency(), 'plural'],
    ['exclusive overlap', exclusiveOverlap(), 'conflict'],
    [
      'capability denial',
      obstruction(
        AdmissionObstructionReason.capabilityDenied('continuum.capability-denied'),
        AdmissionRetryDisposition.withEvidence()
      ),
      'obstruction',
    ],
    [
      'unsupported evidence',
      obstruction(
        AdmissionObstructionReason.unsupportedEvidence('continuum.unsupported-evidence'),
        AdmissionRetryDisposition.withEvidence()
      ),
      'obstruction',
    ],
    [
      'invalid derivation',
      obstruction(
        AdmissionObstructionReason.invalidDerivation('continuum.invalid-derivation'),
        AdmissionRetryDisposition.never()
      ),
      'obstruction',
    ],
  ] as const)('classifies %s as %s', (_scenario, witness, expected) => {
    expect(classifier.classify(witness).kind).toBe(expected);
  });

  it('keeps malformed inputs outside the four-way causal classification', () => {
    expect(() =>
      classifier.classify(
        // @ts-expect-error runtime guard for JavaScript callers
        { kind: 'corrupt-envelope' }
      )
    ).toThrow(WarpError);
  });
});
