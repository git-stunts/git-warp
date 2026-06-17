import { describe, expect, it } from 'vitest';

import ContinuumArtifactDescriptor from '../../../../src/domain/continuum/ContinuumArtifactDescriptor.ts';
import ContinuumEvidenceAccess from '../../../../src/domain/continuum/ContinuumEvidenceAccess.ts';
import ContinuumEvidenceClaim from '../../../../src/domain/continuum/ContinuumEvidenceClaim.ts';
import ContinuumEvidenceCompleteness from '../../../../src/domain/continuum/ContinuumEvidenceCompleteness.ts';
import ContinuumEvidenceOrigin from '../../../../src/domain/continuum/ContinuumEvidenceOrigin.ts';
import ContinuumEvidencePosture from '../../../../src/domain/continuum/ContinuumEvidencePosture.ts';
import ContinuumEvidenceProofStrength from '../../../../src/domain/continuum/ContinuumEvidenceProofStrength.ts';
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
  it('classifies translated git-warp evidence as a complete available witnessed translation', () => {
    const descriptor = makeGeneratedReceiptDescriptor();
    const posture = ContinuumEvidencePosture.translatedGitWarpEvidence();
    const claim = new ContinuumEvidenceClaim({
      descriptor,
      posture,
    });

    expect(claim.descriptor).toBe(descriptor);
    expect(claim.posture).toBeInstanceOf(ContinuumEvidencePosture);
    expect(claim.posture.origin).toBeInstanceOf(ContinuumEvidenceOrigin);
    expect(claim.posture.proofStrength).toBeInstanceOf(ContinuumEvidenceProofStrength);
    expect(claim.posture.access).toBeInstanceOf(ContinuumEvidenceAccess);
    expect(claim.posture.completeness).toBeInstanceOf(ContinuumEvidenceCompleteness);
    expect(claim.posture.toString()).toBe('translated:witnessed:available:complete');
    expect(claim.posture.isTranslatedGitWarpEvidence()).toBe(true);
    expect(claim.isTranslatedGitWarpEvidence()).toBe(true);
    expect(claim.isNativeContinuumEvidence()).toBe(false);
    expect(claim.requireTranslatedGitWarpEvidence()).toBe(claim);
    expect(claim.posture.canAuthorizeReplayShortcut()).toBe(true);
  });

  it('does not infer native Continuum evidence from generated artifact authority', () => {
    const descriptor = makeGeneratedReceiptDescriptor();
    const claim = new ContinuumEvidenceClaim({
      descriptor,
      posture: ContinuumEvidencePosture.translatedGitWarpEvidence(),
    });

    expect(descriptor.hasGeneratedAuthority()).toBe(true);
    expect(claim.isNativeContinuumEvidence()).toBe(false);
    expect(claim.posture.toString()).toBe('translated:witnessed:available:complete');
  });

  it('requires explicit proof before available native Continuum evidence can be claimed', () => {
    const descriptor = makeGeneratedReceiptDescriptor();
    const nativePosture = ContinuumEvidencePosture.nativeContinuumEvidence();

    expect(() => new ContinuumEvidenceClaim({
      descriptor,
      posture: nativePosture,
    })).toThrow(WarpError);

    const claim = new ContinuumEvidenceClaim({
      descriptor,
      posture: nativePosture,
      nativeWitnessProof: 'continuum-native-receipt-proof:fixture',
    });

    expect(claim.isNativeContinuumEvidence()).toBe(true);
    expect(claim.nativeWitnessProof).toBe('continuum-native-receipt-proof:fixture');
  });

  it('allows redacted native witnesshood without direct proof material', () => {
    const descriptor = makeGeneratedReceiptDescriptor();
    const posture = new ContinuumEvidencePosture({
      origin: ContinuumEvidenceOrigin.native(),
      proofStrength: ContinuumEvidenceProofStrength.witnessed(),
      access: ContinuumEvidenceAccess.redacted(),
      completeness: ContinuumEvidenceCompleteness.partial(),
    });
    const claim = new ContinuumEvidenceClaim({ descriptor, posture });

    expect(claim.isNativeContinuumEvidence()).toBe(true);
    expect(claim.nativeWitnessProof).toBeUndefined();
    expect(claim.posture.canAuthorizeReplayShortcut()).toBe(false);
  });

  it('rejects native witness proof when posture is not native evidence', () => {
    const descriptor = makeGeneratedReceiptDescriptor();

    expect(() => new ContinuumEvidenceClaim({
      descriptor,
      posture: ContinuumEvidencePosture.translatedGitWarpEvidence(),
      nativeWitnessProof: 'continuum-native-receipt-proof:fixture',
    })).toThrow(WarpError);
  });

  it('rejects blank native witness proof for native evidence posture', () => {
    const descriptor = makeGeneratedReceiptDescriptor();

    expect(() => new ContinuumEvidenceClaim({
      descriptor,
      posture: ContinuumEvidencePosture.nativeContinuumEvidence(),
      nativeWitnessProof: '   ',
    })).toThrow(WarpError);
  });

  it('rejects unsupported descriptor evidence when translated evidence is required', () => {
    const descriptor = makeGeneratedReceiptDescriptor();
    const claim = new ContinuumEvidenceClaim({
      descriptor,
      posture: ContinuumEvidencePosture.unsupportedDescriptor(),
    });

    expect(claim.posture.isUnsupportedDescriptor()).toBe(true);
    expect(() => claim.requireTranslatedGitWarpEvidence()).toThrow(WarpError);
  });

  it('rejects missing or invalid posture coordinates', () => {
    const descriptor = makeGeneratedReceiptDescriptor();

    expect(() => new ContinuumEvidencePosture({
      origin: 'invalid',
      proofStrength: 'witnessed',
      access: 'available',
      completeness: 'complete',
    })).toThrow(WarpError);

    expect(() => new ContinuumEvidenceClaim({
      descriptor,
      // @ts-expect-error runtime guard for JavaScript callers
      posture: undefined,
    })).toThrow(WarpError);
  });

  it('rejects missing evidence claim fields with a domain error', () => {
    expect(() => new ContinuumEvidenceClaim(
      // @ts-expect-error runtime guard for JavaScript callers
      undefined,
    )).toThrow(WarpError);
  });
});
