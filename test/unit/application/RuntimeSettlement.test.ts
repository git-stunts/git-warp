import { describe, expect, it, vi } from 'vitest';

import { settleRuntimePlan } from '../../../src/application/RuntimeSettlement.ts';
import AdmissionEvaluation from '../../../src/domain/admission/AdmissionEvaluation.ts';
import ConflictAdmission from '../../../src/domain/admission/ConflictAdmission.ts';
import ConflictWitness from '../../../src/domain/admission/ConflictWitness.ts';
import PluralAdmission from '../../../src/domain/admission/PluralAdmission.ts';
import PluralityWitness from '../../../src/domain/admission/PluralityWitness.ts';
import type { AdmissionOutcome } from '../../../src/domain/api/AdmissionOutcome.ts';
import { projectAdmissionOutcome } from '../../../src/domain/api/AdmissionOutcomeRuntime.ts';
import type { SettlementSourceRuntime } from '../../../src/domain/api/LaneSettlementRuntime.ts';
import { bindSettlementPlan } from '../../../src/domain/api/SettlementPlanRuntime.ts';
import SettlementPlan from '../../../src/domain/settlement/SettlementPlan.ts';

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
    const owner = Object.freeze({});
    const plan = settlementPlan();
    const snapshot = Object.freeze({
      baseTargetFrontierRef: plan.targetFrontier.id,
      frontierRef: plan.sourceFrontier.id,
      proposalDigest: plan.proposalDigest,
      status: 'ready' as const,
      targetFrontierRef: plan.targetFrontier.id,
    });
    const promote = vi.fn(async () => Object.freeze({
      accepted: true,
      evidence: undefined,
      reason: undefined,
    }));
    const digest = vi.fn(async (parts: readonly string[]) =>
      parts[0] === 'law' ? plan.lawDigest : plan.policyDigest
    );
    const sourceRuntime: SettlementSourceRuntime = Object.freeze({
      kind: 'source',
      capture: async () => snapshot,
      digest,
      runExclusive: async (operation) =>
        await operation(Object.freeze({
          capture: async () => snapshot,
          digest,
          promote,
        })),
    });
    const evidence = Object.freeze({
      basis: plan.targetFrontier,
      support: Object.freeze([
        plan.sourceFrontier,
        Object.freeze({ id: plan.proposalDigest }),
      ]),
    });
    bindSettlementPlan(plan, {
      evidence,
      outcome,
      owner,
      source: Object.freeze({ kind: 'strand', name: 'draft' }),
      sourceRuntime,
      sourceSnapshot: snapshot,
      target: Object.freeze({ kind: 'worldline', name: 'events' }),
    });

    const receipt = await settleRuntimePlan(plan, owner);

    expect(receipt.outcome).toBe(outcome);
    expect(receipt.evidence).toEqual(evidence);
    expect(promote).not.toHaveBeenCalled();
  });
});

function settlementPlan(): SettlementPlan {
  return new SettlementPlan({
    planDigest: 'plan:settlement',
    sourceLaneId: 'lane:strand:draft',
    targetLaneId: 'lane:worldline:events',
    sourceFrontier: Object.freeze({ id: 'frontier:source' }),
    targetFrontier: Object.freeze({ id: 'frontier:target' }),
    proposalDigest: 'proposal:draft',
    lawDigest: 'law:settlement',
    policyDigest: 'policy:settlement',
  });
}

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
