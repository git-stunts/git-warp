import { describe, expect, it } from 'vitest';

import AdmissionEvaluation from '../../../src/domain/admission/AdmissionEvaluation.ts';
import ConflictAdmission from '../../../src/domain/admission/ConflictAdmission.ts';
import ConflictWitness from '../../../src/domain/admission/ConflictWitness.ts';
import PluralAdmission from '../../../src/domain/admission/PluralAdmission.ts';
import PluralityWitness from '../../../src/domain/admission/PluralityWitness.ts';
import {
  projectAdmissionOutcome,
  requireAdmissionOutcome,
} from '../../../src/domain/api/AdmissionOutcomeRuntime.ts';
import {
  testDerivedIntentAdmissionReceipt,
  testObstructedIntentAdmissionReceipt,
} from '../../helpers/intentAdmission.ts';

const EVALUATION = new AdmissionEvaluation({
  sourceParticipantId: 'participant:source',
  destinationRuntimeId: 'runtime:destination',
  sourceBasisRef: 'frontier:source:7',
  destinationBasisRef: 'frontier:destination:11',
  proposalDigest: 'proposal:8',
  lawDigest: 'law:reservation',
  profileDigest: 'profile:continuum',
  evaluationCoordinateRef: 'coordinate:destination:11',
});
const PROJECTION_BASIS = Object.freeze({ id: 'evidence:admission-projection' });

describe('AdmissionOutcomeRuntime', () => {
  it('projects all four domain variants into the closed public algebra', () => {
    const derived = projectAdmissionOutcome(
      testDerivedIntentAdmissionReceipt('derived').outcome,
      PROJECTION_BASIS
    );
    const plural = projectAdmissionOutcome(
      new PluralAdmission(
        new PluralityWitness({
          evaluation: EVALUATION,
          localCoordinateRef: 'coordinate:local',
          incomingCoordinateRef: 'coordinate:incoming',
          retainedCoordinateRefs: ['coordinate:local', 'coordinate:incoming'],
          derivationEvidenceRef: 'evidence:derivation',
          footprintComparisonRef: 'evidence:footprints',
          concurrencyEvidenceRef: 'evidence:concurrency',
          nonInterferenceEvidenceRef: 'evidence:non-interference',
        })
      ),
      PROJECTION_BASIS
    );
    const conflict = projectAdmissionOutcome(
      new ConflictAdmission(
        new ConflictWitness({
          evaluation: EVALUATION,
          conflictRef: 'conflict:reservation-overlap',
          claimRefs: ['claim:local', 'claim:incoming'],
          overlappingFootprintRefs: ['footprint:reservation-slot'],
          contestedDomain: 'reservation-slot',
          derivationEvidenceRef: 'evidence:derivation',
          overlapEvidenceRef: 'evidence:overlap',
          resolutionProcedureRefs: ['procedure:reschedule'],
        })
      ),
      PROJECTION_BASIS
    );
    const obstruction = projectAdmissionOutcome(
      testObstructedIntentAdmissionReceipt('obstructed').outcome,
      PROJECTION_BASIS
    );

    expect([derived.kind, plural.kind, conflict.kind, obstruction.kind]).toEqual([
      'derived',
      'plural',
      'conflict',
      'obstruction',
    ]);
    if (plural.kind !== 'plural' || conflict.kind !== 'conflict') {
      throw new Error('projection must preserve plural and conflict variants');
    }
    expect(plural.witness.localCoordinate.id).toMatch(/^evidence:/);
    expect(plural.witness.incomingCoordinate.id).toMatch(/^evidence:/);
    expect(plural.witness.retainedCoordinates.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        plural.witness.localCoordinate.id,
        plural.witness.incomingCoordinate.id,
      ])
    );
    expect(plural.residual.coordinates).toBe(plural.witness.retainedCoordinates);
    expect(conflict.witness.contestedDomain).toBe('reservation-slot');
    expect(conflict.witness.claims).toHaveLength(2);
    expect(conflict.witness.overlappingFootprints).toHaveLength(1);
    expect(conflict.witness.resolutionProcedures).toHaveLength(1);
    expect(conflict.residual.conflict).toBe(conflict.witness.conflict);
    expect(JSON.stringify(plural)).not.toContain('coordinate:local');
    expect(JSON.stringify(conflict)).not.toContain('claim:local');
  });

  it('issues deeply immutable storage-neutral outcomes', () => {
    const outcome = projectAdmissionOutcome(
      testDerivedIntentAdmissionReceipt('immutable').outcome,
      PROJECTION_BASIS
    );

    expect(Object.isFrozen(outcome)).toBe(true);
    expect(Object.isFrozen(outcome.witness)).toBe(true);
    expect(Object.isFrozen(outcome.witness.evaluation)).toBe(true);
    expect(Object.isFrozen(outcome.witness.evaluation.sourceBasis)).toBe(true);
    expect(outcome.witness.evaluation.sourceBasis.id).toMatch(/^evidence:/);
    expect(outcome.witness.evaluation.sourceBasis.id).not.toContain('frontier:');
    expect(outcome.witness.evaluation).not.toHaveProperty('sourceBasisRef');
    expect(outcome.witness).not.toHaveProperty('resultingFrontierRef');
  });

  it('rejects structurally similar values not issued by the runtime', () => {
    expect(() =>
      requireAdmissionOutcome({
        kind: 'derived',
        witness: {},
        residual: {},
      } as never)
    ).toThrow('outcome must be an AdmissionOutcome');
  });
});
