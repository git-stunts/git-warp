import { describe, it, expect } from 'vitest';
import ConflictAnalysisRequest from '../../../../../src/domain/services/strand/ConflictAnalysisRequest.ts';

describe('ConflictAnalysisRequest', () => {
  it('defaults to an unfiltered frontier request', () => {
    const request = ConflictAnalysisRequest.from(undefined);

    expect(request.lamportCeiling).toBeNull();
    expect(request.strandId).toBeNull();
    expect(request.entityId).toBeNull();
    expect(request.target).toBeNull();
    expect(request['kinds']).toBeNull();
    expect(request.writerId).toBeNull();
    expect(request.evidence).toBe('standard');
    expect(request.maxPatches).toBeNull();
    expect(request.usesStrandCoordinate()).toBe(false);
    expect(request.toSnapshotFilterRecord()).toEqual({
      entityId: null,
      target: null,
      kind: null,
      writerId: null,
    });
    expect(Object.isFrozen(request)).toBe(true);
  });

  it('normalizes a fully populated node request', () => {
    const request = ConflictAnalysisRequest.from({
      at: { lamportCeiling: 7 },
      strandId: 'alpha',
      entityId: 'node:1',
      target: { targetKind: 'node', entityId: 'node:1' },
      kind: ['redundancy', 'supersession', 'redundancy'],
      writerId: 'writer-1',
      evidence: 'full',
      scanBudget: { maxPatches: 3 },
    });

    expect(request.lamportCeiling).toBe(7);
    expect(request.strandId).toBe('alpha');
    expect(request.entityId).toBe('node:1');
    expect(request.target).toEqual({ targetKind: 'node', entityId: 'node:1' });
    expect(request['kinds']).toEqual(['redundancy', 'supersession']);
    expect(request.writerId).toBe('writer-1');
    expect(request.evidence).toBe('full');
    expect(request.maxPatches).toBe(3);
    expect(request.usesStrandCoordinate()).toBe(true);
    expect(request.toSnapshotFilterRecord()).toEqual({
      entityId: 'node:1',
      target: { targetKind: 'node', entityId: 'node:1' },
      kind: ['redundancy', 'supersession'],
      writerId: 'writer-1',
    });
    expect(Object.isFrozen(request.target)).toBe(true);
    expect(Object.isFrozen(request['kinds'])).toBe(true);
  });

  it('normalizes every supported target selector shape', () => {
    /**
     * @typedef {{
     *   input: import('../../../../../src/domain/services/strand/ConflictAnalysisRequest.ts').ConflictTargetSelector,
     *   expected: Record<string, unknown>
     * }} TargetCase
     */

    /** @type {TargetCase[]} */
    const cases = [
      {
        input: { targetKind: 'node', entityId: 'node:1' },
        expected: { targetKind: 'node', entityId: 'node:1' },
      },
      {
        input: { targetKind: 'edge', from: 'a', to: 'b', label: 'knows' },
        expected: { targetKind: 'edge', from: 'a', to: 'b', label: 'knows' },
      },
      {
        input: { targetKind: 'node_property', entityId: 'node:1', propertyKey: 'color' },
        expected: { targetKind: 'node_property', entityId: 'node:1', propertyKey: 'color' },
      },
      {
        input: { targetKind: 'edge_property', from: 'a', to: 'b', label: 'knows', propertyKey: 'weight' },
        expected: { targetKind: 'edge_property', from: 'a', to: 'b', label: 'knows', propertyKey: 'weight' },
      },
    ];

    for (const testCase of cases) {
      const request = ConflictAnalysisRequest.from({ target: testCase.input });
      const filterRecord = request.toSnapshotFilterRecord();
      expect(request.target).toEqual(testCase.expected);
      expect(filterRecord['target']).toEqual(testCase.expected);
    }
  });

  it('accepts null target and null lamport ceiling explicitly', () => {
    const request = ConflictAnalysisRequest.from({
      at: { lamportCeiling: null },
      target: null,
      evidence: 'summary',
    });

    expect(request.lamportCeiling).toBeNull();
    expect(request.target).toBeNull();
    expect(request.evidence).toBe('summary');
  });

  it('deduplicates and sorts kind filters deterministically', () => {
    const request = ConflictAnalysisRequest.from({
      kind: ['supersession', 'eventual_override', 'supersession', 'redundancy'],
    });

    expect(request['kinds']).toEqual(['eventual_override', 'redundancy', 'supersession']);
    expect(request.toSnapshotFilterRecord()['kind']).toEqual([
      'eventual_override',
      'redundancy',
      'supersession',
    ]);
  });
});
