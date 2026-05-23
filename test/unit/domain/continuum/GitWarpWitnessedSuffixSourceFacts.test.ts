import { describe, expect, it } from 'vitest';

import ContinuumEvidencePosture from '../../../../src/domain/continuum/ContinuumEvidencePosture.ts';
import GitWarpWitnessedSuffixPatchFact
  from '../../../../src/domain/continuum/GitWarpWitnessedSuffixPatchFact.ts';
import GitWarpWitnessedSuffixSourceFacts
  from '../../../../src/domain/continuum/GitWarpWitnessedSuffixSourceFacts.ts';
import createCurrentContinuumGeneratedFamilyInventory
  from '../../../../src/domain/continuum/createCurrentContinuumGeneratedFamilyInventory.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';

function makePatchFact(fields: {
  readonly writerId?: string;
  readonly patchSha?: string;
  readonly lamport?: number;
  readonly operationCount?: number;
} = {}): GitWarpWitnessedSuffixPatchFact {
  return new GitWarpWitnessedSuffixPatchFact({
    writerId: fields.writerId ?? 'writer-a',
    patchSha: fields.patchSha ?? 'a'.repeat(40),
    lamport: fields.lamport ?? 7,
    operationCount: fields.operationCount ?? 2,
  });
}

function makeSourceFacts(fields: {
  readonly familyId?: string;
  readonly posture?: string | ContinuumEvidencePosture;
  readonly patches?: readonly GitWarpWitnessedSuffixPatchFact[];
} = {}): GitWarpWitnessedSuffixSourceFacts {
  const inventory = createCurrentContinuumGeneratedFamilyInventory();
  return new GitWarpWitnessedSuffixSourceFacts({
    family: inventory.requireEntry(fields.familyId ?? 'runtime-boundary-family'),
    evidencePosture: fields.posture ?? 'translated-git-warp-evidence',
    graphName: 'demo',
    sourceFrontierRef: 'frontier:remote:writer-a:7',
    basisFrontierRef: 'frontier:local:writer-a:4',
    targetFrontierRef: 'frontier:target:writer-a:7',
    patches: fields.patches ?? [makePatchFact()],
    witnessRef: 'receipt:a'.concat('a'.repeat(39)),
    bundleDigest: 'sha256:suffix-bundle',
  });
}

describe('GitWarpWitnessedSuffixSourceFacts', () => {
  it('records translated runtime-boundary witnessed-suffix source facts', () => {
    const facts = makeSourceFacts();

    expect(facts.family.familyId.toString()).toBe('runtime-boundary-family');
    expect(facts.family.status.toString()).toBe('authored-only');
    expect(facts.evidencePosture.isTranslatedGitWarpEvidence()).toBe(true);
    expect(facts.patches).toEqual([makePatchFact()]);
    expect(facts.patchCount).toBe(1);
    expect(facts.requiresGeneratedProfileBeforeProjection()).toBe(true);
  });

  it('rejects source facts for a non-runtime-boundary family', () => {
    expect(() => makeSourceFacts({ familyId: 'settlement-family' })).toThrow(WarpError);
  });

  it('rejects native or unproven evidence posture for translated git-warp suffixes', () => {
    expect(() => makeSourceFacts({
      posture: new ContinuumEvidencePosture('native-continuum-evidence'),
    })).toThrow(WarpError);

    expect(() => makeSourceFacts({ posture: 'unproven-continuum-shape' })).toThrow(WarpError);
  });

  it('rejects empty suffix patch lists and invalid patch facts', () => {
    expect(() => makeSourceFacts({ patches: [] })).toThrow(WarpError);

    expect(() => new GitWarpWitnessedSuffixPatchFact({
      writerId: 'writer-a',
      patchSha: '',
      lamport: 7,
      operationCount: 2,
    })).toThrow(WarpError);
  });

  it('rejects suffix patch facts outside canonical order', () => {
    expect(() => makeSourceFacts({
      patches: [
        makePatchFact({ patchSha: 'b'.repeat(40), lamport: 8 }),
        makePatchFact({ patchSha: 'a'.repeat(40), lamport: 7 }),
      ],
    })).toThrow(WarpError);
  });
});
