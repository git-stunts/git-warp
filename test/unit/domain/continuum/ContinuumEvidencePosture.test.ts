import { describe, expect, it } from 'vitest';

import ContinuumArtifactDescriptor from '../../../../src/domain/continuum/ContinuumArtifactDescriptor.ts';
import ContinuumEvidenceClaim from '../../../../src/domain/continuum/ContinuumEvidenceClaim.ts';
import ContinuumEvidencePosture from '../../../../src/domain/continuum/ContinuumEvidencePosture.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';

const RECEIPT_SCHEMA_PATH = 'schemas/continuum-receipt-family.graphql';
const CONTINUUM_FIXTURE_KIND = 'continuum.family.fixture';
const AUTHORITY_GENERATED_FIXTURE = 'generated-fixture';

/** Builds the generated receipt-family descriptor used by posture tests. */
function makeGeneratedReceiptDescriptor(): ContinuumArtifactDescriptor {
  return new ContinuumArtifactDescriptor({
    familyId: 'receipt-family',
    sourceSchemaPath: RECEIPT_SCHEMA_PATH,
    generatedBy: 'wesley witness-continuum --scope receipt-family',
    artifactKind: CONTINUUM_FIXTURE_KIND,
    authority: AUTHORITY_GENERATED_FIXTURE,
    targets: ['typescript', 'warp-ttd'],
    version: '0.1.0',
    witnessScope: 'receipt-family',
  });
}

describe('ContinuumEvidencePosture', () => {
  it('classifies translated git-warp evidence explicitly', () => {
    const descriptor = makeGeneratedReceiptDescriptor();
    const claim = new ContinuumEvidenceClaim({
      descriptor,
      posture: 'translated-git-warp-evidence',
    });

    expect(claim.descriptor).toBe(descriptor);
    expect(claim.posture).toBeInstanceOf(ContinuumEvidencePosture);
    expect(claim.posture.isTranslatedGitWarpEvidence()).toBe(true);
    expect(claim.isTranslatedGitWarpEvidence()).toBe(true);
    expect(claim.isNativeContinuumEvidence()).toBe(false);
    expect(claim.requireTranslatedGitWarpEvidence()).toBe(claim);
  });

  it('does not infer native Continuum evidence from generated artifact authority', () => {
    const descriptor = makeGeneratedReceiptDescriptor();
    const claim = new ContinuumEvidenceClaim({
      descriptor,
      posture: 'translated-git-warp-evidence',
    });

    expect(descriptor.hasGeneratedAuthority()).toBe(true);
    expect(claim.isNativeContinuumEvidence()).toBe(false);
    expect(claim.posture.toString()).toBe('translated-git-warp-evidence');
  });

  it('requires explicit proof before native Continuum evidence can be claimed', () => {
    const descriptor = makeGeneratedReceiptDescriptor();

    expect(() => new ContinuumEvidenceClaim({
      descriptor,
      posture: 'native-continuum-evidence',
    })).toThrow(WarpError);

    const claim = new ContinuumEvidenceClaim({
      descriptor,
      posture: 'native-continuum-evidence',
      nativeWitnessProof: 'continuum-native-receipt-proof:fixture',
    });

    expect(claim.isNativeContinuumEvidence()).toBe(true);
    expect(claim.nativeWitnessProof).toBe('continuum-native-receipt-proof:fixture');
  });

  it('rejects unproven Continuum shape when translated evidence is required', () => {
    const descriptor = makeGeneratedReceiptDescriptor();
    const claim = new ContinuumEvidenceClaim({
      descriptor,
      posture: 'unproven-continuum-shape',
    });

    expect(claim.posture.isUnprovenContinuumShape()).toBe(true);
    expect(() => claim.requireTranslatedGitWarpEvidence()).toThrow(WarpError);
  });

  it('rejects missing or invalid posture values', () => {
    const descriptor = makeGeneratedReceiptDescriptor();

    expect(() => new ContinuumEvidencePosture('native-continuum-evidence')).not.toThrow();
    expect(() => new ContinuumEvidencePosture('not-a-posture')).toThrow(WarpError);

    expect(() => new ContinuumEvidenceClaim({
      descriptor,
      // @ts-expect-error runtime guard for JavaScript callers
      posture: undefined,
    })).toThrow(WarpError);
  });
});

