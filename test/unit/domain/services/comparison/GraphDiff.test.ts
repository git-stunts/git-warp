import { assert, describe, expect, it } from 'vitest';

import GraphDiff from '../../../../../src/domain/services/comparison/GraphDiff.ts';
import type { CoordinateComparison } from '../../../../../src/domain/types/CoordinateComparison.ts';

function comparisonFixture(): CoordinateComparison {
  return {
    comparisonVersion: 'coordinate-compare/v1',
    comparisonDigest: 'comparison-digest',
    scope: {
      nodeIdPrefixes: {
        include: ['task:'],
        exclude: ['task:archive:'],
      },
    },
    left: {
      requested: { kind: 'strand', strandId: 'strand-a' },
      resolved: {
        coordinateKind: 'strand',
        patchFrontier: { alice: 'a'.repeat(40) },
        patchFrontierDigest: 'left-frontier',
        lamportFrontier: { alice: 1 },
        lamportFrontierDigest: 'left-lamport',
        lamportCeiling: 1,
        stateHash: 'left-state',
        patchUniverseDigest: 'left-universe',
        summary: {
          nodeCount: 1,
          edgeCount: 0,
          nodePropertyCount: 1,
          edgePropertyCount: 0,
          patchCount: 1,
        },
        strand: {
          strandId: 'strand-a',
          baseLamportCeiling: 0,
          overlayHeadPatchSha: 'b'.repeat(40),
          overlayPatchCount: 1,
          overlayWritable: true,
          braid: {
            readOverlayCount: 1,
            braidedStrandIds: ['strand-b'],
          },
        },
      },
    },
    right: {
      requested: { kind: 'live', ceiling: 2 },
      resolved: {
        coordinateKind: 'frontier',
        patchFrontier: { alice: 'c'.repeat(40) },
        patchFrontierDigest: 'right-frontier',
        lamportFrontier: { alice: 2 },
        lamportFrontierDigest: 'right-lamport',
        lamportCeiling: 2,
        stateHash: 'right-state',
        patchUniverseDigest: 'right-universe',
        summary: {
          nodeCount: 1,
          edgeCount: 1,
          nodePropertyCount: 1,
          edgePropertyCount: 1,
          patchCount: 2,
        },
      },
    },
    visiblePatchDivergence: {
      sharedCount: 1,
      leftOnlyCount: 0,
      rightOnlyCount: 1,
      leftOnlyPatchShas: [],
      rightOnlyPatchShas: ['c'.repeat(40)],
      target: {
        targetId: 'task:1',
        leftCount: 1,
        rightCount: 2,
        sharedCount: 1,
        leftOnlyCount: 0,
        rightOnlyCount: 1,
        leftOnlyPatchShas: [],
        rightOnlyPatchShas: ['c'.repeat(40)],
      },
    },
    visibleState: {
      comparisonVersion: 'visible-state-compare/v1',
      changed: true,
      summary: {
        left: {
          nodeCount: 1,
          edgeCount: 0,
          nodePropertyCount: 1,
          edgePropertyCount: 0,
        },
        right: {
          nodeCount: 1,
          edgeCount: 1,
          nodePropertyCount: 1,
          edgePropertyCount: 1,
        },
        nodes: { added: 0, removed: 0 },
        edges: { added: 1, removed: 0 },
        nodeProperties: { added: 0, removed: 0, changed: 1 },
        edgeProperties: { added: 1, removed: 0, changed: 0 },
      },
      nodes: {
        added: ['task:2'],
        removed: [],
      },
      edges: {
        added: [{ from: 'task:1', to: 'task:2', label: 'blocks' }],
        removed: [],
      },
      nodeProperties: {
        added: [],
        removed: [],
        changed: [{ node: 'task:1', key: 'status', leftValue: 'open', rightValue: 'done' }],
      },
      edgeProperties: {
        added: [{ from: 'task:1', to: 'task:2', label: 'blocks', key: 'weight', value: 1 }],
        removed: [],
        changed: [],
      },
    },
  };
}

function rowAt<T>(values: readonly T[], index: number): T {
  const value = values[index];
  assert.isDefined(value);
  return value;
}

describe('GraphDiff', () => {
  it('freezes nested public diff evidence', () => {
    const graphDiff = new GraphDiff({ comparison: comparisonFixture() });

    expect(Object.isFrozen(graphDiff)).toBe(true);
    expect(Object.isFrozen(graphDiff.left)).toBe(true);
    expect(Object.isFrozen(graphDiff.left.resolved)).toBe(true);
    expect(Object.isFrozen(graphDiff.left.resolved.patchFrontier)).toBe(true);
    expect(Object.isFrozen(graphDiff.left.resolved.strand?.braid.braidedStrandIds)).toBe(true);
    expect(Object.isFrozen(graphDiff.scope?.nodeIdPrefixes?.include)).toBe(true);
    expect(Object.isFrozen(graphDiff.summary.nodeProperties)).toBe(true);
    expect(Object.isFrozen(graphDiff.nodes.added)).toBe(true);
    expect(Object.isFrozen(graphDiff.edges.added)).toBe(true);
    expect(Object.isFrozen(rowAt(graphDiff.edges.added, 0))).toBe(true);
    expect(Object.isFrozen(graphDiff.nodeProperties.changed)).toBe(true);
    expect(Object.isFrozen(rowAt(graphDiff.nodeProperties.changed, 0))).toBe(true);
    expect(Object.isFrozen(graphDiff.edgeProperties.added)).toBe(true);
    expect(Object.isFrozen(rowAt(graphDiff.edgeProperties.added, 0))).toBe(true);
    expect(Object.isFrozen(graphDiff.visiblePatchDivergence.rightOnlyPatchShas)).toBe(true);
    expect(Object.isFrozen(graphDiff.visiblePatchDivergence.target)).toBe(true);
    expect(Object.isFrozen(graphDiff.visiblePatchDivergence.target?.rightOnlyPatchShas)).toBe(true);

    expect(() => {
      graphDiff.nodes.added.push('task:mutated');
    }).toThrow(TypeError);
    expect(() => {
      rowAt(graphDiff.nodeProperties.changed, 0).key = 'mutated';
    }).toThrow(TypeError);
    expect(() => {
      graphDiff.visiblePatchDivergence.rightOnlyPatchShas.push('d'.repeat(40));
    }).toThrow(TypeError);
  });
});
