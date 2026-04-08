import { describe, it, expect } from 'vitest';
import ConflictResolvedCoordinate from '../../../../../src/domain/types/conflict/ConflictResolvedCoordinate.ts';

describe('ConflictResolvedCoordinate', () => {
  const VALID = {
    analysisVersion: 'conflict-analyzer/v2',
    coordinateKind: 'frontier',
    frontier: { w1: 'abc', w2: 'def' },
    frontierDigest: 'digest',
    lamportCeiling: null,
    scanBudgetApplied: { maxPatches: null },
    truncationPolicy: 'scan_budget_max_patches_reverse_causal',
  };

  it('creates a frozen coordinate', () => {
    const c = new ConflictResolvedCoordinate(VALID);
    expect(c.analysisVersion).toBe('conflict-analyzer/v2');
    expect(c.coordinateKind).toBe('frontier');
    expect(c.frontier).toEqual({ w1: 'abc', w2: 'def' });
    expect(Object.isFrozen(c.frontier)).toBe(true);
    expect(c.lamportCeiling).toBeNull();
    expect(c.scanBudgetApplied).toEqual({ maxPatches: null });
    expect(Object.isFrozen(c.scanBudgetApplied)).toBe(true);
    expect(c.strand).toBeUndefined();
    expect(Object.isFrozen(c)).toBe(true);
  });

  it('accepts strand coordinate with braid', () => {
    const c = new ConflictResolvedCoordinate({
      ...VALID,
      coordinateKind: 'strand',
      strand: {
        strandId: 'alpha',
        baseLamportCeiling: 5,
        overlayHeadPatchSha: 'abc',
        overlayPatchCount: 2,
        overlayWritable: true,
        braid: { readOverlayCount: 1, braidedStrandIds: ['beta'] },
      },
    });
    expect(c.strand.strandId).toBe('alpha');
    expect(Object.isFrozen(c.strand)).toBe(true);
    expect(Object.isFrozen(c.strand.braid)).toBe(true);
    expect(Object.isFrozen(c.strand.braid.braidedStrandIds)).toBe(true);
  });

  it('accepts strand without braid', () => {
    const c = new ConflictResolvedCoordinate({
      ...VALID,
      coordinateKind: 'strand',
      strand: { strandId: 'alpha', baseLamportCeiling: null, overlayHeadPatchSha: null, overlayPatchCount: 0, overlayWritable: false },
    });
    expect(c.strand.strandId).toBe('alpha');
    expect(c.strand.braid).toBeUndefined();
  });

  it('treats null strand as undefined', () => {
    const c = new ConflictResolvedCoordinate({ ...VALID, strand: null });
    expect(c.strand).toBeUndefined();
  });

  it('rejects invalid coordinateKind', () => {
    expect(() => new ConflictResolvedCoordinate({ ...VALID, coordinateKind: 'custom' })).toThrow('coordinateKind');
  });

  it('rejects null frontier', () => {
    expect(() => new ConflictResolvedCoordinate({ ...VALID, frontier: null })).toThrow('frontier');
  });

  it('rejects null scanBudgetApplied', () => {
    expect(() => new ConflictResolvedCoordinate({ ...VALID, scanBudgetApplied: null })).toThrow('scanBudgetApplied');
  });

  it('rejects empty analysisVersion', () => {
    expect(() => new ConflictResolvedCoordinate({ ...VALID, analysisVersion: '' })).toThrow('analysisVersion');
  });
});
