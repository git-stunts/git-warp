import { describe, expect, it } from 'vitest';
import ContinuumEvidencePosture from '../../../../src/domain/continuum/ContinuumEvidencePosture.ts';
import ContinuumEvidenceStatus from '../../../../src/domain/continuum/ContinuumEvidenceStatus.ts';

const PATCH_BASIS_REF = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CONTINUUM_WITNESS_REF = 'continuum:witness:receipt-family:1';

describe('ContinuumEvidenceStatus', () => {
  it('marks git-warp evidence as participant runtime evidence', () => {
    const status = ContinuumEvidenceStatus.gitWarpParticipant({
      basisRef: PATCH_BASIS_REF,
      summary: 'git-warp patch receipt projected into receipt-family shape',
    });

    expect(status.posture.toString()).toBe('participant-runtime');
    expect(status.sourceRuntime).toBe('git-warp');
    expect(status.basisRef).toBe(PATCH_BASIS_REF);
    expect(status.continuumWitnessRef).toBeUndefined();
    expect(status.isParticipantRuntime()).toBe(true);
    expect(status.isContinuumWitnessed()).toBe(false);
    expect(Object.isFrozen(status)).toBe(true);
  });

  it('accepts Continuum-witnessed evidence only with an explicit witness reference', () => {
    const status = new ContinuumEvidenceStatus({
      posture: 'continuum-witnessed',
      sourceRuntime: 'git-warp',
      basisRef: PATCH_BASIS_REF,
      continuumWitnessRef: CONTINUUM_WITNESS_REF,
      summary: 'receipt-family value carries an explicit Continuum witness reference',
    });

    expect(status.posture.toString()).toBe('continuum-witnessed');
    expect(status.continuumWitnessRef).toBe(CONTINUUM_WITNESS_REF);
    expect(status.isContinuumWitnessed()).toBe(true);
    expect(status.isParticipantRuntime()).toBe(false);
  });

  it('rejects Continuum-witnessed evidence without a witness reference', () => {
    expect(() => new ContinuumEvidenceStatus({
      posture: 'continuum-witnessed',
      sourceRuntime: 'git-warp',
      basisRef: PATCH_BASIS_REF,
      summary: 'missing witness',
    })).toThrow('continuumWitnessRef');
  });

  it('rejects participant runtime evidence that carries a Continuum witness reference', () => {
    expect(() => new ContinuumEvidenceStatus({
      posture: 'participant-runtime',
      sourceRuntime: 'git-warp',
      basisRef: PATCH_BASIS_REF,
      continuumWitnessRef: CONTINUUM_WITNESS_REF,
      summary: 'participant runtime evidence cannot claim a separate witness reference',
    })).toThrow('participant runtime evidence must not carry continuumWitnessRef');
  });
});

describe('ContinuumEvidencePosture', () => {
  it('rejects unknown posture values', () => {
    expect(() => new ContinuumEvidencePosture('fixture-only')).toThrow('Continuum evidence posture');
  });
});
