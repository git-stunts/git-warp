import { describe, expect, it } from 'vitest';

import ContinuumEvidencePosture from '../../../../src/domain/continuum/ContinuumEvidencePosture.ts';
import GitWarpReadingEnvelopePayloadFact
  from '../../../../src/domain/continuum/GitWarpReadingEnvelopePayloadFact.ts';
import GitWarpReadingEnvelopeSourceFacts
  from '../../../../src/domain/continuum/GitWarpReadingEnvelopeSourceFacts.ts';
import createCurrentContinuumGeneratedFamilyInventory
  from '../../../../src/domain/continuum/createCurrentContinuumGeneratedFamilyInventory.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';

function makePayload(): GitWarpReadingEnvelopePayloadFact {
  return new GitWarpReadingEnvelopePayloadFact({
    payloadKind: 'materialized-state',
    payloadDigest: 'sha256:reading-payload',
    stateHash: 'state:abc123',
  });
}

function makeSourceFacts(fields: {
  readonly familyId?: string;
  readonly posture?: string | ContinuumEvidencePosture;
  readonly payload?: GitWarpReadingEnvelopePayloadFact;
} = {}): GitWarpReadingEnvelopeSourceFacts {
  const inventory = createCurrentContinuumGeneratedFamilyInventory();
  return new GitWarpReadingEnvelopeSourceFacts({
    family: inventory.requireEntry(fields.familyId ?? 'runtime-boundary-family'),
    evidencePosture: fields.posture ?? 'translated-git-warp-evidence',
    observerPlanId: 'observer-plan:live-materialize',
    observationRequestId: 'observation-request:001',
    sourceRef: 'graph:demo/writer:writer-a',
    basisRef: 'frontier:writer-a:7',
    payload: fields.payload ?? makePayload(),
    witnessRef: 'receipt:e'.concat('e'.repeat(39)),
    budgetStatus: 'budget-unreported',
  });
}

describe('GitWarpReadingEnvelopeSourceFacts', () => {
  it('records translated runtime-boundary reading-envelope source facts', () => {
    const facts = makeSourceFacts();

    expect(facts.family.familyId.toString()).toBe('runtime-boundary-family');
    expect(facts.family.status.toString()).toBe('authored-only');
    expect(facts.evidencePosture.isTranslatedGitWarpEvidence()).toBe(true);
    expect(facts.payload).toBeInstanceOf(GitWarpReadingEnvelopePayloadFact);
    expect(facts.payload.payloadKind).toBe('materialized-state');
    expect(facts.payload.hasStateHash()).toBe(true);
    expect(facts.requiresGeneratedProfileBeforeProjection()).toBe(true);
  });

  it('rejects source facts for a non-runtime-boundary family', () => {
    expect(() => makeSourceFacts({ familyId: 'receipt-family' })).toThrow(WarpError);
  });

  it('rejects native or unproven evidence posture for translated git-warp readings', () => {
    expect(() => makeSourceFacts({
      posture: new ContinuumEvidencePosture('native-continuum-evidence'),
    })).toThrow(WarpError);

    expect(() => makeSourceFacts({ posture: 'unproven-continuum-shape' })).toThrow(WarpError);
  });

  it('rejects blank payload and source-fact fields', () => {
    expect(() => new GitWarpReadingEnvelopePayloadFact({
      payloadKind: '',
      payloadDigest: 'sha256:reading-payload',
    })).toThrow(WarpError);

    expect(() => new GitWarpReadingEnvelopeSourceFacts({
      family: createCurrentContinuumGeneratedFamilyInventory().requireEntry('runtime-boundary-family'),
      evidencePosture: 'translated-git-warp-evidence',
      observerPlanId: '',
      observationRequestId: 'observation-request:001',
      sourceRef: 'graph:demo/writer:writer-a',
      basisRef: 'frontier:writer-a:7',
      payload: makePayload(),
      witnessRef: 'receipt:e'.concat('e'.repeat(39)),
      budgetStatus: 'budget-unreported',
    })).toThrow(WarpError);
  });
});
