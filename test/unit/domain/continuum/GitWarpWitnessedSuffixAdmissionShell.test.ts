import { describe, expect, it } from 'vitest';

import AdmissionEvaluation from '../../../../src/domain/admission/AdmissionEvaluation.ts';
import AdmissionObstructionReason from '../../../../src/domain/admission/AdmissionObstructionReason.ts';
import AdmissionRetryDisposition from '../../../../src/domain/admission/AdmissionRetryDisposition.ts';
import type { AdmissionOutcome } from '../../../../src/domain/admission/AdmissionOutcome.ts';
import ConflictAdmission from '../../../../src/domain/admission/ConflictAdmission.ts';
import ConflictWitness from '../../../../src/domain/admission/ConflictWitness.ts';
import DerivationWitness from '../../../../src/domain/admission/DerivationWitness.ts';
import DerivedAdmission from '../../../../src/domain/admission/DerivedAdmission.ts';
import ObstructedAdmission from '../../../../src/domain/admission/ObstructedAdmission.ts';
import ObstructionWitness from '../../../../src/domain/admission/ObstructionWitness.ts';
import PluralAdmission from '../../../../src/domain/admission/PluralAdmission.ts';
import PluralityWitness from '../../../../src/domain/admission/PluralityWitness.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import ContinuumEvidencePosture from '../../../../src/domain/continuum/ContinuumEvidencePosture.ts';
import GitWarpSuffixTransformHologram
  from '../../../../src/domain/continuum/GitWarpSuffixTransformHologram.ts';
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
  readonly outcome?: AdmissionOutcome;
  readonly sourceFacts?: GitWarpWitnessedSuffixSourceFacts;
  readonly hologram?: GitWarpSuffixTransformHologram;
  readonly destinationRuntimeId?: string;
} = {}): GitWarpWitnessedSuffixAdmissionShell {
  const sourceFacts = fields.sourceFacts ?? makeSourceFacts();
  return new GitWarpWitnessedSuffixAdmissionShell({
    laneId: 'lane:writer-remote',
    transportedSiteRef: 'site:remote',
    destinationRuntimeId: fields.destinationRuntimeId ?? 'runtime:local',
    admissionLawId: 'admission-law:witnessed-suffix',
    outcome: fields.outcome ?? makeOutcome('derived', sourceFacts),
    sourceFacts,
    hologram: fields.hologram ?? makeHologram(),
  });
}

function makeEvaluation(sourceFacts: GitWarpWitnessedSuffixSourceFacts): AdmissionEvaluation {
  return new AdmissionEvaluation({
    sourceParticipantId: 'site:remote',
    destinationRuntimeId: 'runtime:local',
    sourceBasisRef: sourceFacts.sourceFrontierRef,
    destinationBasisRef: sourceFacts.basisFrontierRef,
    proposalDigest: sourceFacts.bundleDigest,
    lawDigest: 'admission-law:witnessed-suffix',
    profileDigest: 'runtime-boundary-family@0.1.0',
    evaluationCoordinateRef: sourceFacts.basisFrontierRef,
  });
}

function makeOutcome(
  kind: AdmissionOutcome['kind'],
  sourceFacts: GitWarpWitnessedSuffixSourceFacts = makeSourceFacts(),
): AdmissionOutcome {
  const evaluation = makeEvaluation(sourceFacts);
  if (kind === 'derived') {
    return new DerivedAdmission(new DerivationWitness({
      evaluation,
      admittedSuffixRef: 'suffix:remote:7',
      resultingFrontierRef: sourceFacts.targetFrontierRef,
      authorityEvidenceRef: sourceFacts.witnessRef,
      directExtensionEvidenceRef: 'proof:direct-extension',
    }));
  }
  if (kind === 'plural') {
    return new PluralAdmission(new PluralityWitness({
      evaluation,
      localCoordinateRef: sourceFacts.basisFrontierRef,
      incomingCoordinateRef: sourceFacts.sourceFrontierRef,
      retainedCoordinateRefs: [sourceFacts.basisFrontierRef, sourceFacts.sourceFrontierRef],
      derivationEvidenceRef: sourceFacts.witnessRef,
      footprintComparisonRef: 'proof:footprint-comparison',
      concurrencyEvidenceRef: 'proof:concurrency',
      nonInterferenceEvidenceRef: 'proof:non-interference',
    }));
  }
  if (kind === 'conflict') {
    return new ConflictAdmission(new ConflictWitness({
      evaluation,
      conflictRef: 'conflict:suffix-overlap',
      claimRefs: ['claim:local', 'claim:remote'],
      overlappingFootprintRefs: ['footprint:shared-resource'],
      contestedDomain: 'domain:shared-resource',
      derivationEvidenceRef: sourceFacts.witnessRef,
      overlapEvidenceRef: 'proof:overlap',
      resolutionProcedureRefs: ['procedure:arbitrate'],
    }));
  }
  return new ObstructedAdmission(new ObstructionWitness({
    evaluation,
    reason: AdmissionObstructionReason.unsupportedEvidence(
      'continuum.unsupported-evidence'
    ),
    suppliedEvidenceRefs: [sourceFacts.witnessRef],
    requiredEvidenceRefs: ['evidence:native-witness'],
    failedConditionRef: 'condition:supported-evidence',
    retry: AdmissionRetryDisposition.withEvidence(),
  }));
}

describe('GitWarpWitnessedSuffixAdmissionShell', () => {
  it('freezes an observer-readable witnessed suffix admission shell', () => {
    const shell = makeShell();

    expect(shell.graphName).toBe('demo');
    expect(shell.laneId).toBe('lane:writer-remote');
    expect(shell.transportedSiteRef).toBe('site:remote');
    expect(shell.destinationRuntimeId).toBe('runtime:local');
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

  it('admits lawful plurality without treating it as unresolved conflict', () => {
    const plural = makeShell({ outcome: makeOutcome('plural') });
    const conflict = makeShell({ outcome: makeOutcome('conflict') });
    const obstruction = makeShell({ outcome: makeOutcome('obstruction') });

    expect(plural.isAdmitted()).toBe(true);
    expect(plural.requiresConflictResolution()).toBe(false);
    expect(conflict.isAdmitted()).toBe(false);
    expect(conflict.requiresConflictResolution()).toBe(true);
    expect(obstruction.isAdmitted()).toBe(false);
    expect(obstruction.isObstructed()).toBe(true);
    expect(() => plural.materializeFrom()).toThrowError(
      expect.objectContaining({ code: 'E_SUFFIX_ADMISSION_NOT_DERIVED' })
    );
    expect(() => conflict.materializeFrom()).toThrowError(
      expect.objectContaining({ code: 'E_SUFFIX_ADMISSION_NOT_DERIVED' })
    );
    expect(() => obstruction.materializeFrom()).toThrowError(
      expect.objectContaining({ code: 'E_SUFFIX_ADMISSION_NOT_DERIVED' })
    );
  });

  it('rejects unsupported admission outcomes', () => {
    expect(() => makeShell({
      // @ts-expect-error runtime guard for JavaScript callers
      outcome: { kind: 'ignored' },
    })).toThrow(WarpError);
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

  it('rejects outcomes evaluated against different suffix coordinates', () => {
    const sourceFacts = makeSourceFacts();
    const otherSource = makeSourceFacts({ sourceFrontierRef: 'frontier:other' });

    expect(() => makeShell({
      sourceFacts,
      outcome: makeOutcome('derived', otherSource),
    })).toThrow(WarpError);
  });

  it('rejects outcomes evaluated for a different destination runtime', () => {
    expect(() => makeShell({ destinationRuntimeId: 'runtime:other' })).toThrow(WarpError);
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
      destinationRuntimeId: 'runtime:local',
      admissionLawId: 'admission-law:witnessed-suffix',
      outcome: makeOutcome('derived', sourceFacts),
      sourceFacts,
      hologram,
    })).toThrow(WarpError);

    expect(() => new GitWarpWitnessedSuffixAdmissionShell({
      laneId: 'lane:writer-remote',
      transportedSiteRef: 'site:remote',
      destinationRuntimeId: 'runtime:local',
      admissionLawId: 'admission-law:witnessed-suffix',
      // @ts-expect-error runtime guard for JavaScript callers
      outcome: 'derived',
      sourceFacts,
      hologram,
    })).toThrow(WarpError);

    expect(() => new GitWarpWitnessedSuffixAdmissionShell({
      laneId: 'lane:writer-remote',
      transportedSiteRef: 'site:remote',
      destinationRuntimeId: 'runtime:local',
      admissionLawId: 'admission-law:witnessed-suffix',
      outcome: makeOutcome('derived', sourceFacts),
      // @ts-expect-error runtime guard for JavaScript callers
      sourceFacts: hologram,
      hologram,
    })).toThrow(WarpError);
  });
});
