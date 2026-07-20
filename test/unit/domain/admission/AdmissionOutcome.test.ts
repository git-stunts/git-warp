import { describe, expect, it } from 'vitest';

import AdmissionEvaluation from '../../../../src/domain/admission/AdmissionEvaluation.ts';
import AdmissionObstructionReason from '../../../../src/domain/admission/AdmissionObstructionReason.ts';
import AdmissionRetryDisposition from '../../../../src/domain/admission/AdmissionRetryDisposition.ts';
import AdmissionRuntimeFailure from '../../../../src/domain/admission/AdmissionRuntimeFailure.ts';
import AdvancedAdmissionPosture from '../../../../src/domain/admission/AdvancedAdmissionPosture.ts';
import CompletedAdmissionExecution from '../../../../src/domain/admission/CompletedAdmissionExecution.ts';
import ConflictAdmission from '../../../../src/domain/admission/ConflictAdmission.ts';
import ConflictWitness from '../../../../src/domain/admission/ConflictWitness.ts';
import DerivationWitness from '../../../../src/domain/admission/DerivationWitness.ts';
import DerivedAdmission from '../../../../src/domain/admission/DerivedAdmission.ts';
import FailedAdmissionExecution from '../../../../src/domain/admission/FailedAdmissionExecution.ts';
import ObstructedAdmission from '../../../../src/domain/admission/ObstructedAdmission.ts';
import ObstructionWitness from '../../../../src/domain/admission/ObstructionWitness.ts';
import PluralAdmission from '../../../../src/domain/admission/PluralAdmission.ts';
import PluralAdmissionPosture from '../../../../src/domain/admission/PluralAdmissionPosture.ts';
import PluralityWitness from '../../../../src/domain/admission/PluralityWitness.ts';
import UnchangedAdmissionPosture from '../../../../src/domain/admission/UnchangedAdmissionPosture.ts';
import UnsettledConflictAdmissionPosture from '../../../../src/domain/admission/UnsettledConflictAdmissionPosture.ts';
import { freezeAdmissionRefs } from '../../../../src/domain/admission/admissionValidation.ts';
import matchAdmission from '../../../../src/domain/admission/matchAdmission.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';

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

function derivationWitness(): DerivationWitness {
  return new DerivationWitness({
    evaluation: evaluation(),
    admittedSuffixRef: 'suffix:source:8',
    resultingFrontierRef: 'frontier:destination:12',
    authorityEvidenceRef: 'evidence:authority',
    directExtensionEvidenceRef: 'evidence:direct-extension',
  });
}

function pluralityWitness(): PluralityWitness {
  return new PluralityWitness({
    evaluation: evaluation(),
    localCoordinateRef: 'coordinate:local',
    incomingCoordinateRef: 'coordinate:incoming',
    retainedCoordinateRefs: ['coordinate:third', 'coordinate:incoming', 'coordinate:local'],
    derivationEvidenceRef: 'evidence:derivation',
    footprintComparisonRef: 'evidence:footprint-comparison',
    concurrencyEvidenceRef: 'evidence:concurrency',
    nonInterferenceEvidenceRef: 'evidence:non-interference',
  });
}

function conflictWitness(): ConflictWitness {
  return new ConflictWitness({
    evaluation: evaluation(),
    conflictRef: 'conflict:reservation-overlap',
    claimRefs: ['claim:remote', 'claim:local'],
    overlappingFootprintRefs: ['footprint:laser:14:10-14:30'],
    contestedDomain: 'laser://north-cutter',
    derivationEvidenceRef: 'evidence:derivation',
    overlapEvidenceRef: 'evidence:overlap',
    resolutionProcedureRefs: ['procedure:reschedule', 'procedure:priority'],
  });
}

function obstructionWitness(): ObstructionWitness {
  return new ObstructionWitness({
    evaluation: evaluation(),
    reason: AdmissionObstructionReason.invalidDerivation('continuum.invalid-signature'),
    suppliedEvidenceRefs: ['evidence:signature:invalid'],
    requiredEvidenceRefs: ['evidence:signature:valid'],
    failedConditionRef: 'condition:source-derivation-honest',
    retry: AdmissionRetryDisposition.withEvidence(),
  });
}

describe('AdmissionOutcome', () => {
  it('binds every outcome to its required witness and residual posture', () => {
    const derived = new DerivedAdmission(derivationWitness());
    const plural = new PluralAdmission(pluralityWitness());
    const conflict = new ConflictAdmission(conflictWitness());
    const obstruction = new ObstructedAdmission(obstructionWitness());

    expect(derived.kind).toBe('derived');
    expect(derived.residual.kind).toBe('advanced');
    expect(derived.residual.frontierRef).toBe('frontier:destination:12');
    expect(plural.kind).toBe('plural');
    expect(plural.residual.coordinateRefs).toEqual([
      'coordinate:incoming',
      'coordinate:local',
      'coordinate:third',
    ]);
    expect(conflict.kind).toBe('conflict');
    expect(conflict.residual.conflictRef).toBe('conflict:reservation-overlap');
    expect(obstruction.kind).toBe('obstruction');
    expect(obstruction.residual.frontierRef).toBe('frontier:destination:11');
    expect(obstruction.witness.reason.family).toBe('invalid-derivation');
    expect(obstruction.witness.retry.value).toBe('with-evidence');
    expect(
      [
        derived,
        plural,
        conflict,
        obstruction,
        derived.witness,
        plural.witness,
        conflict.witness,
        obstruction.witness,
        derived.residual,
        plural.residual,
        conflict.residual,
        obstruction.residual,
      ].every(Object.isFrozen)
    ).toBe(true);
  });

  it('keeps plural admission distinct from conflict and preserves plurality', () => {
    const witness = pluralityWitness();
    const outcome = new PluralAdmission(witness);

    expect(outcome).toBeInstanceOf(PluralAdmission);
    expect(outcome).not.toBeInstanceOf(ConflictAdmission);
    expect(witness.localCoordinateRef).toBe('coordinate:local');
    expect(witness.incomingCoordinateRef).toBe('coordinate:incoming');
    expect(witness.derivationEvidenceRef).toBe('evidence:derivation');
    expect(witness.footprintComparisonRef).toBe('evidence:footprint-comparison');
    expect(witness.concurrencyEvidenceRef).toBe('evidence:concurrency');
    expect(witness.nonInterferenceEvidenceRef).toBe('evidence:non-interference');
    expect(Object.isFrozen(witness.retainedCoordinateRefs)).toBe(true);
  });

  it('retains bounded conflict facts for resolution without admitting the proposal', () => {
    const witness = conflictWitness();
    const outcome = new ConflictAdmission(witness);

    expect(outcome.residual.kind).toBe('unsettled-conflict');
    expect(witness.claimRefs).toEqual(['claim:local', 'claim:remote']);
    expect(witness.overlappingFootprintRefs).toEqual(['footprint:laser:14:10-14:30']);
    expect(witness.contestedDomain).toBe('laser://north-cutter');
    expect(witness.derivationEvidenceRef).toBe('evidence:derivation');
    expect(witness.overlapEvidenceRef).toBe('evidence:overlap');
    expect(witness.resolutionProcedureRefs).toEqual(['procedure:priority', 'procedure:reschedule']);
  });

  it('matches all four admission variants exhaustively without a default handler', () => {
    const labels = [
      matchAdmission(new DerivedAdmission(derivationWitness()), {
        derived: (outcome) => outcome.kind,
        plural: (outcome) => outcome.kind,
        conflict: (outcome) => outcome.kind,
        obstruction: (outcome) => outcome.kind,
      }),
      matchAdmission(new PluralAdmission(pluralityWitness()), {
        derived: (outcome) => outcome.kind,
        plural: (outcome) => outcome.kind,
        conflict: (outcome) => outcome.kind,
        obstruction: (outcome) => outcome.kind,
      }),
      matchAdmission(new ConflictAdmission(conflictWitness()), {
        derived: (outcome) => outcome.kind,
        plural: (outcome) => outcome.kind,
        conflict: (outcome) => outcome.kind,
        obstruction: (outcome) => outcome.kind,
      }),
      matchAdmission(new ObstructedAdmission(obstructionWitness()), {
        derived: (outcome) => outcome.kind,
        plural: (outcome) => outcome.kind,
        conflict: (outcome) => outcome.kind,
        obstruction: (outcome) => outcome.kind,
      }),
    ];

    expect(labels).toEqual(['derived', 'plural', 'conflict', 'obstruction']);
  });

  it('separates completed causal classifications from runtime failures', () => {
    const outcomes = [
      new DerivedAdmission(derivationWitness()),
      new PluralAdmission(pluralityWitness()),
      new ConflictAdmission(conflictWitness()),
      new ObstructedAdmission(obstructionWitness()),
    ];
    const completed = outcomes.map((outcome) => new CompletedAdmissionExecution(outcome));
    const failure = new AdmissionRuntimeFailure('E_ADMISSION_IO', 'history port unavailable');
    const failed = new FailedAdmissionExecution(failure);

    expect(completed.map((execution) => execution.status)).toEqual([
      'completed',
      'completed',
      'completed',
      'completed',
    ]);
    expect(completed.map((execution) => execution.outcome.kind)).toEqual([
      'derived',
      'plural',
      'conflict',
      'obstruction',
    ]);
    expect(failed.status).toBe('failed');
    expect(failed.failure).toBe(failure);
    expect(Object.isFrozen(failure)).toBe(true);
    expect(Object.isFrozen(failed)).toBe(true);
  });

  it('models every retry disposition and validates obstruction families', () => {
    expect(AdmissionRetryDisposition.afterChange().value).toBe('after-change');
    expect(AdmissionRetryDisposition.withEvidence().value).toBe('with-evidence');
    expect(AdmissionRetryDisposition.never().value).toBe('never');
    expect(AdmissionRetryDisposition.unknown().value).toBe('unknown');
    expect(AdmissionObstructionReason.staleBasis('continuum.stale-plan').family).toBe(
      'stale-basis'
    );
    expect(
      new AdmissionObstructionReason('capability-denied', 'continuum.capability-denied').family
    ).toBe('capability-denied');
    expect(
      new AdmissionObstructionReason('unsupported-evidence', 'continuum.unsupported-evidence')
        .family
    ).toBe('unsupported-evidence');
    expect(
      new AdmissionObstructionReason('law-violation', 'LabMachine.v1.CooldownBlocksReservation')
        .family
    ).toBe('law-violation');
    expect(
      new AdmissionObstructionReason('budget-exceeded', 'continuum.budget-exceeded').family
    ).toBe('budget-exceeded');
    expect(
      new AdmissionObstructionReason('unsupported-contract', 'continuum.unsupported-contract')
        .family
    ).toBe('unsupported-contract');
  });

  it('rejects malformed evaluations, witnesses, postures, and outcomes', () => {
    expect(
      () =>
        new AdmissionEvaluation(
          // @ts-expect-error runtime guard for JavaScript callers
          undefined
        )
    ).toThrow(WarpError);
    expect(
      () =>
        new AdmissionEvaluation(
          // @ts-expect-error runtime guard for JavaScript callers
          null
        )
    ).toThrow(WarpError);
    expect(
      () =>
        new AdmissionEvaluation({
          sourceParticipantId: '',
          destinationRuntimeId: 'runtime:destination',
          sourceBasisRef: 'frontier:source',
          destinationBasisRef: 'frontier:destination',
          proposalDigest: 'sha256:proposal',
          lawDigest: 'sha256:law',
          profileDigest: 'sha256:profile',
          evaluationCoordinateRef: 'coordinate:destination',
        })
    ).toThrow(WarpError);
    expect(
      () =>
        new DerivationWitness(
          // @ts-expect-error runtime guard for JavaScript callers
          undefined
        )
    ).toThrow(WarpError);
    expect(
      () =>
        new DerivationWitness({
          // @ts-expect-error runtime guard for JavaScript callers
          evaluation: {},
          admittedSuffixRef: 'suffix:source',
          resultingFrontierRef: 'frontier:destination',
          authorityEvidenceRef: 'evidence:authority',
          directExtensionEvidenceRef: 'evidence:direct-extension',
        })
    ).toThrow(WarpError);
    expect(
      () =>
        new PluralityWitness(
          // @ts-expect-error runtime guard for JavaScript callers
          null
        )
    ).toThrow(WarpError);
    expect(
      () =>
        new PluralityWitness({
          // @ts-expect-error runtime guard for JavaScript callers
          evaluation: {},
          localCoordinateRef: 'coordinate:local',
          incomingCoordinateRef: 'coordinate:incoming',
          retainedCoordinateRefs: ['coordinate:local', 'coordinate:incoming'],
          derivationEvidenceRef: 'evidence:derivation',
          footprintComparisonRef: 'evidence:footprints',
          concurrencyEvidenceRef: 'evidence:concurrency',
          nonInterferenceEvidenceRef: 'evidence:non-interference',
        })
    ).toThrow(WarpError);
    expect(
      () =>
        new PluralityWitness({
          evaluation: evaluation(),
          localCoordinateRef: 'coordinate:same',
          incomingCoordinateRef: 'coordinate:same',
          retainedCoordinateRefs: ['coordinate:same', 'coordinate:third'],
          derivationEvidenceRef: 'evidence:derivation',
          footprintComparisonRef: 'evidence:footprints',
          concurrencyEvidenceRef: 'evidence:concurrency',
          nonInterferenceEvidenceRef: 'evidence:non-interference',
        })
    ).toThrow(WarpError);
    expect(
      () =>
        new PluralityWitness({
          evaluation: evaluation(),
          localCoordinateRef: 'coordinate:local',
          incomingCoordinateRef: 'coordinate:incoming',
          retainedCoordinateRefs: ['coordinate:local'],
          derivationEvidenceRef: 'evidence:derivation',
          footprintComparisonRef: 'evidence:footprints',
          concurrencyEvidenceRef: 'evidence:concurrency',
          nonInterferenceEvidenceRef: 'evidence:non-interference',
        })
    ).toThrow(WarpError);
    expect(
      () =>
        new PluralityWitness({
          evaluation: evaluation(),
          localCoordinateRef: 'coordinate:local',
          incomingCoordinateRef: 'coordinate:incoming',
          retainedCoordinateRefs: ['coordinate:incoming', 'coordinate:third'],
          derivationEvidenceRef: 'evidence:derivation',
          footprintComparisonRef: 'evidence:footprints',
          concurrencyEvidenceRef: 'evidence:concurrency',
          nonInterferenceEvidenceRef: 'evidence:non-interference',
        })
    ).toThrow(WarpError);
    expect(
      () =>
        new PluralityWitness({
          evaluation: evaluation(),
          localCoordinateRef: 'coordinate:local',
          incomingCoordinateRef: 'coordinate:incoming',
          retainedCoordinateRefs: ['coordinate:local', 'coordinate:third'],
          derivationEvidenceRef: 'evidence:derivation',
          footprintComparisonRef: 'evidence:footprints',
          concurrencyEvidenceRef: 'evidence:concurrency',
          nonInterferenceEvidenceRef: 'evidence:non-interference',
        })
    ).toThrow(WarpError);
    expect(
      () =>
        new ConflictWitness(
          // @ts-expect-error runtime guard for JavaScript callers
          undefined
        )
    ).toThrow(WarpError);
    expect(
      () =>
        new ConflictWitness({
          // @ts-expect-error runtime guard for JavaScript callers
          evaluation: {},
          conflictRef: 'conflict:test',
          claimRefs: ['claim:a', 'claim:b'],
          overlappingFootprintRefs: ['footprint:a'],
          contestedDomain: 'domain:test',
          derivationEvidenceRef: 'evidence:derivation',
          overlapEvidenceRef: 'evidence:overlap',
          resolutionProcedureRefs: [],
        })
    ).toThrow(WarpError);
    expect(
      () =>
        new ConflictWitness({
          evaluation: evaluation(),
          conflictRef: 'conflict:test',
          claimRefs: ['claim:a'],
          overlappingFootprintRefs: ['footprint:a'],
          contestedDomain: 'domain:test',
          derivationEvidenceRef: 'evidence:derivation',
          overlapEvidenceRef: 'evidence:overlap',
          resolutionProcedureRefs: [],
        })
    ).toThrow(WarpError);
    expect(
      () =>
        new ConflictWitness({
          evaluation: evaluation(),
          conflictRef: 'conflict:test',
          claimRefs: ['claim:a', 'claim:b'],
          overlappingFootprintRefs: [],
          contestedDomain: 'domain:test',
          derivationEvidenceRef: 'evidence:derivation',
          overlapEvidenceRef: 'evidence:overlap',
          resolutionProcedureRefs: [],
        })
    ).toThrow(WarpError);
    expect(
      () =>
        new ObstructionWitness(
          // @ts-expect-error runtime guard for JavaScript callers
          null
        )
    ).toThrow(WarpError);
    expect(
      () =>
        new ObstructionWitness({
          // @ts-expect-error runtime guard for JavaScript callers
          evaluation: {},
          reason: AdmissionObstructionReason.invalidDerivation('continuum.invalid'),
          suppliedEvidenceRefs: [],
          requiredEvidenceRefs: [],
          failedConditionRef: 'condition:test',
          retry: AdmissionRetryDisposition.never(),
        })
    ).toThrow(WarpError);
    expect(
      () =>
        new ObstructionWitness({
          evaluation: evaluation(),
          // @ts-expect-error runtime guard for JavaScript callers
          reason: 'invalid',
          suppliedEvidenceRefs: [],
          requiredEvidenceRefs: [],
          failedConditionRef: 'condition:test',
          retry: AdmissionRetryDisposition.never(),
        })
    ).toThrow(WarpError);
    expect(
      () =>
        new ObstructionWitness({
          evaluation: evaluation(),
          reason: AdmissionObstructionReason.invalidDerivation('continuum.invalid'),
          suppliedEvidenceRefs: [],
          requiredEvidenceRefs: [],
          failedConditionRef: 'condition:test',
          // @ts-expect-error runtime guard for JavaScript callers
          retry: 'never',
        })
    ).toThrow(WarpError);
    expect(
      () =>
        new DerivedAdmission(
          // @ts-expect-error runtime guard for JavaScript callers
          pluralityWitness()
        )
    ).toThrow(WarpError);
    expect(
      () =>
        new PluralAdmission(
          // @ts-expect-error runtime guard for JavaScript callers
          derivationWitness()
        )
    ).toThrow(WarpError);
    expect(
      () =>
        new ConflictAdmission(
          // @ts-expect-error runtime guard for JavaScript callers
          obstructionWitness()
        )
    ).toThrow(WarpError);
    expect(
      () =>
        new ObstructedAdmission(
          // @ts-expect-error runtime guard for JavaScript callers
          conflictWitness()
        )
    ).toThrow(WarpError);
    expect(() =>
      matchAdmission(
        // @ts-expect-error runtime guard for JavaScript callers
        {},
        {
          derived: (outcome) => outcome.kind,
          plural: (outcome) => outcome.kind,
          conflict: (outcome) => outcome.kind,
          obstruction: (outcome) => outcome.kind,
        }
      )
    ).toThrow(WarpError);
  });

  it('rejects malformed execution wrappers and value objects', () => {
    expect(
      () =>
        new CompletedAdmissionExecution(
          // @ts-expect-error runtime guard for JavaScript callers
          {}
        )
    ).toThrow(WarpError);
    expect(
      () =>
        new FailedAdmissionExecution(
          // @ts-expect-error runtime guard for JavaScript callers
          {}
        )
    ).toThrow(WarpError);
    expect(() => new AdmissionRuntimeFailure('', 'message')).toThrow(WarpError);
    expect(() => new AdmissionRuntimeFailure('E_TEST', '')).toThrow(WarpError);
    expect(() => new AdmissionRetryDisposition('later')).toThrow(WarpError);
    expect(() => new AdmissionObstructionReason('unknown', 'reason')).toThrow(WarpError);
    expect(() => new AdmissionObstructionReason('law-violation', '')).toThrow(WarpError);
    expect(() => new AdmissionObstructionReason('law-violation', 'unqualified')).toThrow(WarpError);
    expect(() => new AdmissionObstructionReason('law-violation', '.missing')).toThrow(WarpError);
    expect(() => new AdmissionObstructionReason('law-violation', 'missing.')).toThrow(WarpError);
  });

  it('rejects malformed residual postures and reference collections', () => {
    expect(() => new AdvancedAdmissionPosture('')).toThrow(WarpError);
    expect(() => new UnchangedAdmissionPosture('')).toThrow(WarpError);
    expect(() => new UnsettledConflictAdmissionPosture('')).toThrow(WarpError);
    expect(() => new PluralAdmissionPosture(['coordinate:only'])).toThrow(WarpError);
    expect(() => new PluralAdmissionPosture(['coordinate:a', ''])).toThrow(WarpError);
    expect(() =>
      freezeAdmissionRefs(
        // @ts-expect-error runtime guard for JavaScript callers
        null,
        'refs'
      )
    ).toThrow(WarpError);
    expect(() => freezeAdmissionRefs(['valid', ''], 'refs')).toThrow(WarpError);
    expect(() => freezeAdmissionRefs(['same', 'same'], 'refs', 2)).toThrow(WarpError);
    expect(freezeAdmissionRefs(['b', 'a', 'a'], 'refs')).toEqual(['a', 'b']);
  });
});
