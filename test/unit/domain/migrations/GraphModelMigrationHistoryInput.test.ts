import { describe, expect, it } from 'vitest';

import GraphModelMigrationHistoryInput
  from '../../../../src/domain/migrations/GraphModelMigrationHistoryInput.ts';
import GraphModelMigrationHistoryPatchInput
  from '../../../../src/domain/migrations/GraphModelMigrationHistoryPatchInput.ts';
import GraphModelMigrationHistorySegment
  from '../../../../src/domain/migrations/GraphModelMigrationHistorySegment.ts';
import GraphModelMigrationPatchFrontierEvidence
  from '../../../../src/domain/migrations/GraphModelMigrationPatchFrontierEvidence.ts';
import GraphModelMigrationPatchOperationFact
  from '../../../../src/domain/migrations/GraphModelMigrationPatchOperationFact.ts';

describe('GraphModelMigrationHistoryInput', () => {
  it('rejects duplicate patch ids across writer history', () => {
    expect(() => new GraphModelMigrationHistoryInput({
      segments: [
        historySegment('writer:a', [historyPatch('writer:a', 'patch:same', 0)]),
        historySegment('writer:b', [historyPatch('writer:b', 'patch:same', 0)]),
      ],
    })).toThrow(/duplicates patch id/);
  });

  it('requires contiguous operation indexes per patch', () => {
    expect(() => historyPatch('writer:a', 'patch:a:0', 0, {
      operations: [
        operationFact(0, 'node:set', 'node:a'),
        operationFact(2, 'node:set', 'node:b'),
      ],
    })).toThrow(/operation indexes must be contiguous/);
  });

  it('orders writer history deterministically', () => {
    const input = new GraphModelMigrationHistoryInput({
      segments: [
        historySegment('writer:b', [historyPatch('writer:b', 'patch:b:0', 0)]),
        historySegment('writer:a', [
          historyPatch('writer:a', 'patch:a:1', 1),
          historyPatch('writer:a', 'patch:a:0', 0),
        ]),
      ],
    });

    expect(input.patches.map((patch) => patch.patchId)).toEqual([
      'patch:a:0',
      'patch:a:1',
      'patch:b:0',
    ]);
  });

  it('requires frontier evidence for equivalence-ready history input', () => {
    expect(() => new GraphModelMigrationHistoryInput({
      segments: [
        historySegment('writer:a', [
          historyPatch('writer:a', 'patch:a:0', 0, { frontierEvidence: null }),
        ]),
      ],
    })).toThrow(/missing frontier evidence/);
  });

  it('freezes history input and patch operation boundaries', () => {
    const input = new GraphModelMigrationHistoryInput({
      segments: [
        historySegment('writer:a', [historyPatch('writer:a', 'patch:a:0', 0)]),
      ],
    });

    expect(Object.isFrozen(input)).toBe(true);
    expect(Object.isFrozen(input.segments)).toBe(true);
    expect(Object.isFrozen(input.patches)).toBe(true);
    expect(Object.isFrozen(input.patches[0]?.operations)).toBe(true);
  });
});

type HistoryPatchOverrides = {
  readonly frontierEvidence?: GraphModelMigrationPatchFrontierEvidence | null;
  readonly operations?: readonly GraphModelMigrationPatchOperationFact[];
};

function historySegment(
  writerId: string,
  patches: readonly GraphModelMigrationHistoryPatchInput[],
): GraphModelMigrationHistorySegment {
  return new GraphModelMigrationHistorySegment({ writerId, patches });
}

function historyPatch(
  writerId: string,
  patchId: string,
  writerSequence: number,
  overrides: HistoryPatchOverrides = {},
): GraphModelMigrationHistoryPatchInput {
  return new GraphModelMigrationHistoryPatchInput({
    writerId,
    patchId,
    writerSequence,
    frontierEvidence: 'frontierEvidence' in overrides
      ? overrides.frontierEvidence
      : frontierEvidence(patchId),
    operations: overrides.operations ?? [operationFact(0, 'node:set', `${patchId}:node`)],
  });
}

function frontierEvidence(patchId: string): GraphModelMigrationPatchFrontierEvidence {
  return new GraphModelMigrationPatchFrontierEvidence({
    frontierKey: `${patchId}:frontier`,
    parentPatchIds: [],
  });
}

function operationFact(
  operationIndex: number,
  operationKind: string,
  operationKey: string,
): GraphModelMigrationPatchOperationFact {
  return new GraphModelMigrationPatchOperationFact({
    operationIndex,
    operationKind,
    operationKey,
  });
}
