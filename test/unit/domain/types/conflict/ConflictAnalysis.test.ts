import { describe, it, expect } from 'vitest';
import ConflictAnalysis from '../../../../../src/domain/types/conflict/ConflictAnalysis.ts';
import ConflictResolvedCoordinate from '../../../../../src/domain/types/conflict/ConflictResolvedCoordinate.ts';
import ConflictDiagnostic from '../../../../../src/domain/types/conflict/ConflictDiagnostic.ts';

describe('ConflictAnalysis', () => {
  const coord = new ConflictResolvedCoordinate({
    analysisVersion: 'v2',
    coordinateKind: 'frontier',
    frontier: { w1: 'abc' },
    frontierDigest: 'fd',
    lamportCeiling: null,
    scanBudgetApplied: { maxPatches: null },
    truncationPolicy: 'policy',
  });

  it('creates a frozen analysis with no conflicts', () => {
    const a = new ConflictAnalysis({
      analysisVersion: 'v2',
      resolvedCoordinate: coord,
      analysisSnapshotHash: 'hash123',
      conflicts: [],
    });
    expect(a.analysisVersion).toBe('v2');
    expect(a.resolvedCoordinate).toBe(coord);
    expect(a.analysisSnapshotHash).toBe('hash123');
    expect(a.diagnostics).toBeUndefined();
    expect(a.conflicts).toEqual([]);
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.conflicts)).toBe(true);
  });

  it('freezes diagnostics array when non-empty', () => {
    const diag = new ConflictDiagnostic({ code: 'x', severity: 'warning', message: 'y' });
    const a = new ConflictAnalysis({
      analysisVersion: 'v2',
      resolvedCoordinate: coord,
      analysisSnapshotHash: 'h',
      diagnostics: [diag],
      conflicts: [],
    });
    expect(a.diagnostics).toEqual([diag]);
    expect(Object.isFrozen(a.diagnostics)).toBe(true);
  });

  it('treats empty diagnostics array as undefined', () => {
    const a = new ConflictAnalysis({
      analysisVersion: 'v2',
      resolvedCoordinate: coord,
      analysisSnapshotHash: 'h',
      diagnostics: [],
      conflicts: [],
    });
    expect(a.diagnostics).toBeUndefined();
  });

  it('treats null diagnostics as undefined', () => {
    const a = new ConflictAnalysis({
      analysisVersion: 'v2',
      resolvedCoordinate: coord,
      analysisSnapshotHash: 'h',
      diagnostics: /** @type {any} */ (null),
      conflicts: [],
    });
    expect(a.diagnostics).toBeUndefined();
  });

  it('rejects empty analysisVersion', () => {
    expect(() => new ConflictAnalysis({
      analysisVersion: '',
      resolvedCoordinate: coord,
      analysisSnapshotHash: 'h',
      conflicts: [],
    })).toThrow('analysisVersion');
  });

  it('rejects empty analysisSnapshotHash', () => {
    expect(() => new ConflictAnalysis({
      analysisVersion: 'v2',
      resolvedCoordinate: coord,
      analysisSnapshotHash: '',
      conflicts: [],
    })).toThrow('analysisSnapshotHash');
  });
});
