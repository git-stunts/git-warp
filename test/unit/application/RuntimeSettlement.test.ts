import { describe, expect, it } from 'vitest';

import { settleRuntimePlan } from '../../../src/application/RuntimeSettlement.ts';
import AdmissionEvaluation from '../../../src/domain/admission/AdmissionEvaluation.ts';
import ConflictAdmission from '../../../src/domain/admission/ConflictAdmission.ts';
import ConflictWitness from '../../../src/domain/admission/ConflictWitness.ts';
import PluralAdmission from '../../../src/domain/admission/PluralAdmission.ts';
import PluralityWitness from '../../../src/domain/admission/PluralityWitness.ts';
import type { AdmissionOutcome } from '../../../src/domain/api/AdmissionOutcome.ts';
import { projectAdmissionOutcome } from '../../../src/domain/api/AdmissionOutcomeRuntime.ts';
import { boundSettlementOutcomeHarness } from '../../helpers/SettlementHarness.ts';

const EVALUATION = new AdmissionEvaluation({
  sourceParticipantId: 'lane:strand:draft',
  destinationRuntimeId: 'lane:worldline:events',
  sourceBasisRef: 'frontier:source',
  destinationBasisRef: 'frontier:target',
  proposalDigest: 'proposal:draft',
  lawDigest: 'law:settlement',
  profileDigest: 'policy:settlement',
  evaluationCoordinateRef: 'frontier:target',
});

describe('Runtime settlement outcome preservation', () => {
  it.each([
    ['plural', pluralOutcome()],
    ['conflict', conflictOutcome()],
  ] as const)('does not promote a %s plan', async (_kind, outcome) => {
    const harness = boundSettlementOutcomeHarness(outcome);

    const receipt = await settleRuntimePlan(harness.plan, harness.owner);

    expect(receipt.outcome).toBe(outcome);
    expect(receipt.evidence).toEqual(harness.evidence);
    expect(harness.promote).not.toHaveBeenCalled();
  });
});

function pluralOutcome(): AdmissionOutcome {
  return projectAdmissionOutcome(
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
      }),
    ),
    Object.freeze({ id: 'evidence:projection' }),
  );
}

function conflictOutcome(): AdmissionOutcome {
  return projectAdmissionOutcome(
    new ConflictAdmission(
      new ConflictWitness({
        evaluation: EVALUATION,
        conflictRef: 'conflict:overlap',
        claimRefs: ['claim:local', 'claim:incoming'],
        overlappingFootprintRefs: ['footprint:shared'],
        contestedDomain: 'shared-domain',
        derivationEvidenceRef: 'evidence:derivation',
        overlapEvidenceRef: 'evidence:overlap',
        resolutionProcedureRefs: ['procedure:resolve'],
      }),
    ),
    Object.freeze({ id: 'evidence:projection' }),
  );
}
