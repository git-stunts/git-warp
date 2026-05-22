import { describe, expect, it } from 'vitest';
import ContinuumEvidencePosture from '../../../../src/domain/continuum/ContinuumEvidencePosture.ts';
import ContinuumEvidenceStatus from '../../../../src/domain/continuum/ContinuumEvidenceStatus.ts';

const PATCH_BASIS_REF = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const NATIVE_WITNESS_REF = 'continuum:witness:receipt-family:1';

describe('ContinuumEvidenceStatus', () => {
  it('marks git-warp evidence as translated substrate evidence', () => {
    const status = ContinuumEvidenceStatus.translatedGitWarp({
      basisRef: PATCH_BASIS_REF,
      summary: 'git-warp patch receipt projected into receipt-family shape',
    });

    expect(status.posture.toString()).toBe('translated-substrate');
    expect(status.sourceRuntime).toBe('git-warp');
    expect(status.basisRef).toBe(PATCH_BASIS_REF);
    expect(status.nativeWitnessRef).toBeUndefined();
    expect(status.isTranslatedSubstrate()).toBe(true);
    expect(status.isContinuumNative()).toBe(false);
    expect(Object.isFrozen(status)).toBe(true);
  });

  it('accepts native Continuum evidence only with an explicit native witness reference', () => {
    const status = new ContinuumEvidenceStatus({
      posture: 'continuum-native',
      sourceRuntime: 'git-warp',
      basisRef: PATCH_BASIS_REF,
      nativeWitnessRef: NATIVE_WITNESS_REF,
      summary: 'receipt-family value was produced through native Continuum witnesshood',
    });

    expect(status.posture.toString()).toBe('continuum-native');
    expect(status.nativeWitnessRef).toBe(NATIVE_WITNESS_REF);
    expect(status.isContinuumNative()).toBe(true);
    expect(status.isTranslatedSubstrate()).toBe(false);
  });

  it('rejects native Continuum evidence without a native witness reference', () => {
    expect(() => new ContinuumEvidenceStatus({
      posture: 'continuum-native',
      sourceRuntime: 'git-warp',
      basisRef: PATCH_BASIS_REF,
      summary: 'missing witness',
    })).toThrow('nativeWitnessRef');
  });

  it('rejects translated substrate evidence that carries a native witness reference', () => {
    expect(() => new ContinuumEvidenceStatus({
      posture: 'translated-substrate',
      sourceRuntime: 'git-warp',
      basisRef: PATCH_BASIS_REF,
      nativeWitnessRef: NATIVE_WITNESS_REF,
      summary: 'translated evidence cannot claim native witnesshood',
    })).toThrow('translated substrate evidence must not carry nativeWitnessRef');
  });
});

describe('ContinuumEvidencePosture', () => {
  it('rejects unknown posture values', () => {
    expect(() => new ContinuumEvidencePosture('fixture-only')).toThrow('Continuum evidence posture');
  });
});
