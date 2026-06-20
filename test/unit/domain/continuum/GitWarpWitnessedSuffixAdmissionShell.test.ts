import { describe, expect, it } from 'vitest';

import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import ContinuumEvidencePosture from '../../../../src/domain/continuum/ContinuumEvidencePosture.ts';
import GitWarpSuffixTransformHologram
  from '../../../../src/domain/continuum/GitWarpSuffixTransformHologram.ts';
import GitWarpWitnessedSuffixAdmissionOutcome
  from '../../../../src/domain/continuum/GitWarpWitnessedSuffixAdmissionOutcome.ts';
import GitWarpWitnessedSuffixAdmissionShell
  from '../../../../src/domain/continuum/GitWarpWitnessedSuffixAdmissionShell.ts';
import GitWarpWitnessedSuffixPatchFact
  from '../../../../src/domain/continuum/GitWarpWitnessedSuffixPatchFact.ts';
import GitWarpWitnessedSuffixSourceFacts
  from '../../../../src/domain/continuum/GitWarpWitnessedSuffixSourceFacts.ts';
import createCurrentContinuumGeneratedFamilyInventory
  from '../../../../src/domain/continuum/createCurrentContinuumGeneratedFamilyInventory.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';
import ProvenancePayload from '../../../../src/domain/services/provenance/ProvenancePayload.ts';
import Patch from '../../../../src/domain/types/Patch.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';

function makePatch(fields: {
  readonly writer: string;
  readonly lamport: number;
  readonly nodeId: string;
}): Patch {
  return new Patch({
    schema: 3,
    writer: fields.writer,
    lamport: fields.lamport,
    context: VersionVector.empty(),
    ops: [new NodeAdd(fields.nodeId, new Dot(fields.writer, fields.lamport))],
    writes: [fields.nodeId],
  });
}

function makePatchFact(fields: {
  readonly writerId?: string;
  readonly patchSha?: string;
  readonly lamport?: number;
  readonly operationCount?: number;
} = {}): GitWarpWitnessedSuffixPatchFact {
  return new GitWarpWitnessedSuffixPatchFact({
    writerId: fields.writerId ?? 'writer-remote',
    patchSha: fields.patchSha ?? 'a'.repeat(40),
    lamport: fields.lamport ?? 7,
    operationCount: fields.operationCount ?? 1,
  });
}

function makeSourceFacts(fields: {
  readonly patches?: readonly GitWarpWitnessedSuffixPatchFact[];
  readonly sourceFrontierRef?: string;
  readonly basisFrontierRef?: string;
  readonly targetFrontierRef?: string;
} = {}): GitWarpWitnessedSuffixSourceFacts {
  const inventory = createCurrentContinuumGeneratedFamilyInventory();
  return new GitWarpWitnessedSuffixSourceFacts({
    family: inventory.requireEntry('runtime-boundary-family'),
    evidencePosture: ContinuumEvidencePosture.translatedGitWarpEvidence(),
    graphName: 'demo',
    sourceFrontierRef: fields.sourceFrontierRef ?? 'frontier:remote:writer-remote:7',
    basisFrontierRef: fields.basisFrontierRef ?? 'frontier:local:writer-local:3',
    targetFrontierRef: fields.targetFrontierRef ?? 'frontier:target:merged',
    patches: fields.patches ?? [makePatchFact()],
    witnessRef: 'receipt:'.concat('a'.repeat(40)),
    bundleDigest: 'sha256:suffix-bundle',
  });
}

function makeHologram(fields: {
  readonly patch?: Patch;
  readonly sha?: string;
  readonly sourceFrontierRef?: string;
  readonly basisFrontierRef?: string;
  readonly targetFrontierRef?: string;
  readonly payload?: ProvenancePayload;
} = {}): GitWarpSuffixTransformHologram {
  const patch = fields.patch ?? makePatch({
    writer: 'writer-remote',
    lamport: 7,
    nodeId: 'node:remote',
  });
  return new GitWarpSuffixTransformHologram({
    sourceFrontierRef: fields.sourceFrontierRef ?? 'frontier:remote:writer-remote:7',
    basisFrontierRef: fields.basisFrontierRef ?? 'frontier:local:writer-local:3',
    targetFrontierRef: fields.targetFrontierRef ?? 'frontier:target:merged',
    transportLawId: 'transport-law:common-basis-suffix',
    proofRef: 'proof:suffix-transform',
    payload: fields.payload ?? new ProvenancePayload([{ patch, sha: fields.sha ?? 'a'.repeat(40) }]),
  });
}

function makeShell(fields: {
  readonly outcome?: GitWarpWitnessedSuffixAdmissionOutcome;
  readonly sourceFacts?: GitWarpWitnessedSuffixSourceFacts;
  readonly hologram?: GitWarpSuffixTransformHologram;
} = {}): GitWarpWitnessedSuffixAdmissionShell {
  return new GitWarpWitnessedSuffixAdmissionShell({
    laneId: 'lane:writer-remote',
    transportedSiteRef: 'site:remote',
    admissionLawId: 'admission-law:witnessed-suffix',
    outcome: fields.outcome ?? GitWarpWitnessedSuffixAdmissionOutcome.admitted(),
    sourceFacts: fields.sourceFacts ?? makeSourceFacts(),
    hologram: fields.hologram ?? makeHologram(),
  });
}

describe('GitWarpWitnessedSuffixAdmissionShell', () => {
  it('freezes an observer-readable witnessed suffix admission shell', () => {
    const shell = makeShell();

    expect(shell.graphName).toBe('demo');
    expect(shell.laneId).toBe('lane:writer-remote');
    expect(shell.transportedSiteRef).toBe('site:remote');
    expect(shell.sourceFrontierRef).toBe('frontier:remote:writer-remote:7');
    expect(shell.basisFrontierRef).toBe('frontier:local:writer-local:3');
    expect(shell.targetFrontierRef).toBe('frontier:target:merged');
    expect(shell.admissionLawId).toBe('admission-law:witnessed-suffix');
    expect(shell.transportLawId).toBe('transport-law:common-basis-suffix');
    expect(shell.patchRefs).toEqual(['a'.repeat(40)]);
    expect(shell.patchCount).toBe(1);
    expect(shell.witnessRef).toBe('receipt:'.concat('a'.repeat(40)));
    expect(shell.bundleDigest).toBe('sha256:suffix-bundle');
    expect(shell.proofRef).toBe('proof:suffix-transform');
    expect(shell.isAdmitted()).toBe(true);
    expect(shell.requiresGeneratedProfileBeforeProjection()).toBe(true);
    expect(Object.isFrozen(shell)).toBe(true);
    expect(Object.isFrozen(shell.patchRefs)).toBe(true);
  });

  it('materializes the suffix hologram from a comparable local basis', () => {
    const basisPatch = makePatch({
      writer: 'writer-local',
      lamport: 3,
      nodeId: 'node:local',
    });
    const basis = new ProvenancePayload([{ patch: basisPatch, sha: 'b'.repeat(40) }]).replay();
    const shell = makeShell();

    const materialized = shell.materializeFrom(basis);

    expect(materialized.nodeAlive.contains('node:local')).toBe(true);
    expect(materialized.nodeAlive.contains('node:remote')).toBe(true);
  });

  it('keeps plural, conflict, and obstruction outcomes explicit', () => {
    expect(GitWarpWitnessedSuffixAdmissionOutcome.plural().requiresResolution()).toBe(true);
    expect(GitWarpWitnessedSuffixAdmissionOutcome.conflict().requiresResolution()).toBe(true);
    expect(GitWarpWitnessedSuffixAdmissionOutcome.obstruction().requiresResolution()).toBe(true);
    expect(GitWarpWitnessedSuffixAdmissionOutcome.staged().isStaged()).toBe(true);
    expect(GitWarpWitnessedSuffixAdmissionOutcome.admitted().toString()).toBe('admitted');
    expect(
      GitWarpWitnessedSuffixAdmissionOutcome.admitted()
        .equals(new GitWarpWitnessedSuffixAdmissionOutcome('admitted')),
    ).toBe(true);
  });

  it('rejects unsupported admission outcomes', () => {
    expect(() => new GitWarpWitnessedSuffixAdmissionOutcome('ignored')).toThrow(WarpError);
  });

  it('rejects shells whose source facts and hologram name different frontiers', () => {
    expect(() => makeShell({
      hologram: makeHologram({ sourceFrontierRef: 'frontier:other' }),
    })).toThrow(WarpError);

    expect(() => makeShell({
      hologram: makeHologram({ basisFrontierRef: 'frontier:other' }),
    })).toThrow(WarpError);

    expect(() => makeShell({
      hologram: makeHologram({ targetFrontierRef: 'frontier:other' }),
    })).toThrow(WarpError);
  });

  it('rejects shells whose source facts and hologram name different patch counts', () => {
    const sourceFacts = makeSourceFacts({
      patches: [
        makePatchFact({ patchSha: 'a'.repeat(40), lamport: 7 }),
        makePatchFact({ patchSha: 'b'.repeat(40), lamport: 8 }),
      ],
    });

    expect(() => makeShell({ sourceFacts })).toThrow(WarpError);
  });

  it('rejects non-runtime-backed shell members', () => {
    const sourceFacts = makeSourceFacts();
    const hologram = makeHologram();

    expect(() => new GitWarpWitnessedSuffixAdmissionShell(
      // @ts-expect-error runtime guard for JavaScript callers
      undefined,
    )).toThrow(WarpError);

    expect(() => new GitWarpWitnessedSuffixAdmissionShell({
      laneId: '',
      transportedSiteRef: 'site:remote',
      admissionLawId: 'admission-law:witnessed-suffix',
      outcome: GitWarpWitnessedSuffixAdmissionOutcome.admitted(),
      sourceFacts,
      hologram,
    })).toThrow(WarpError);

    expect(() => new GitWarpWitnessedSuffixAdmissionShell({
      laneId: 'lane:writer-remote',
      transportedSiteRef: 'site:remote',
      admissionLawId: 'admission-law:witnessed-suffix',
      // @ts-expect-error runtime guard for JavaScript callers
      outcome: 'admitted',
      sourceFacts,
      hologram,
    })).toThrow(WarpError);

    expect(() => new GitWarpWitnessedSuffixAdmissionShell({
      laneId: 'lane:writer-remote',
      transportedSiteRef: 'site:remote',
      admissionLawId: 'admission-law:witnessed-suffix',
      outcome: GitWarpWitnessedSuffixAdmissionOutcome.admitted(),
      // @ts-expect-error runtime guard for JavaScript callers
      sourceFacts: hologram,
      hologram,
    })).toThrow(WarpError);
  });
});
