import { describe, it, expect } from 'vitest';
import PatchError from '../../../../src/domain/errors/PatchError.ts';
import {
  EdgeDiffEntry,
  PropDiffEntry,
  createEmptyDiff,
  mergeDiffs,
} from '../../../../src/domain/types/PatchDiff.ts';

describe('PatchDiff', () => {
  describe('createEmptyDiff', () => {
    it('returns a diff with all empty arrays', () => {
      const d = createEmptyDiff();
      expect(Object.isFrozen(d)).toBe(true);
      expect(d.nodesAdded).toEqual([]);
      expect(d.nodesRemoved).toEqual([]);
      expect(d.edgesAdded).toEqual([]);
      expect(d.edgesRemoved).toEqual([]);
      expect(d.propsChanged).toEqual([]);
    });

    it('validates and freezes edge and property entries', () => {
      const edge = new EdgeDiffEntry({ from: 'a', to: 'b', label: 'rel' });
      const prop = new PropDiffEntry({
        nodeId: 'a',
        key: 'name',
        value: 'Ada',
        prevValue: undefined,
      });

      expect(Object.isFrozen(edge)).toBe(true);
      expect(Object.isFrozen(prop)).toBe(true);
      expect(edge).toEqual({ from: 'a', to: 'b', label: 'rel' });
      expect(prop).toEqual({
        nodeId: 'a',
        key: 'name',
        value: 'Ada',
        prevValue: undefined,
      });
    });

    it('rejects invalid diff fields', () => {
      expect(() => new EdgeDiffEntry({ from: '', to: 'b', label: 'rel' })).toThrow(PatchError);
      expect(() => new PropDiffEntry({
        nodeId: 'a',
        key: '',
        value: 'Ada',
        prevValue: undefined,
      })).toThrow(PatchError);
    });
  });

  describe('mergeDiffs', () => {
    it('concatenates non-contradictory entries', () => {
      const a = { ...createEmptyDiff(), nodesAdded: ['n1'] };
      const b = { ...createEmptyDiff(), nodesAdded: ['n2'] };
      const merged = mergeDiffs(a, b);
      expect(merged.nodesAdded).toEqual(['n1', 'n2']);
    });

    // -------------------------------------------------------------------
    // M3 regression: add + remove of the same node must cancel out
    // -------------------------------------------------------------------
    it('cancels out a node added in diff A and removed in diff B', () => {
      const a = { ...createEmptyDiff(), nodesAdded: ['n1', 'n2'] };
      const b = { ...createEmptyDiff(), nodesRemoved: ['n1'] };
      const merged = mergeDiffs(a, b);

      expect(merged.nodesAdded).toEqual(['n2']);
      expect(merged.nodesRemoved).toEqual([]);
    });

    it('cancels out a node removed in diff A and added in diff B', () => {
      const a = { ...createEmptyDiff(), nodesRemoved: ['n1'] };
      const b = { ...createEmptyDiff(), nodesAdded: ['n1', 'n3'] };
      const merged = mergeDiffs(a, b);

      expect(merged.nodesRemoved).toEqual([]);
      expect(merged.nodesAdded).toEqual(['n3']);
    });

    it('cancels out contradictory edge entries', () => {
      const edge = { from: 'a', to: 'b', label: 'knows' };
      const a = { ...createEmptyDiff(), edgesAdded: [edge] };
      const b = { ...createEmptyDiff(), edgesRemoved: [{ ...edge }] };
      const merged = mergeDiffs(a, b);

      expect(merged.edgesAdded).toEqual([]);
      expect(merged.edgesRemoved).toEqual([]);
    });

    it('keeps non-contradictory edges intact', () => {
      const e1 = { from: 'a', to: 'b', label: 'knows' };
      const e2 = { from: 'a', to: 'c', label: 'knows' };
      const a = { ...createEmptyDiff(), edgesAdded: [e1, e2] };
      const b = { ...createEmptyDiff(), edgesRemoved: [{ ...e1 }] };
      const merged = mergeDiffs(a, b);

      expect(merged.edgesAdded).toEqual([e2]);
      expect(merged.edgesRemoved).toEqual([]);
    });

    it('deduplicates propsChanged by keeping only the last entry per (nodeId, key)', () => {
      const a = {
        ...createEmptyDiff(),
        propsChanged: [
          { nodeId: 'n1', key: 'color', value: 'red', prevValue: undefined },
        ],
      };
      const b = {
        ...createEmptyDiff(),
        propsChanged: [
          { nodeId: 'n1', key: 'color', value: 'blue', prevValue: 'red' },
          { nodeId: 'n2', key: 'size', value: 10, prevValue: undefined },
        ],
      };
      const merged = mergeDiffs(a, b);

      expect(merged.propsChanged).toHaveLength(2);
      // The second entry for (n1, color) should win
      const n1Color = merged.propsChanged.find(
        (p) => p.nodeId === 'n1' && p.key === 'color',
      );
      if (!n1Color) { throw new Error('expected n1Color'); }
      expect(n1Color.value).toBe('blue');
      expect(n1Color.prevValue).toBe('red');
      // n2/size should be present
      const n2Size = merged.propsChanged.find(
        (p) => p.nodeId === 'n2' && p.key === 'size',
      );
      if (!n2Size) { throw new Error('expected n2Size'); }
      expect(n2Size.value).toBe(10);
    });

    it('handles both node and edge cancellations in one merge', () => {
      const a = {
        nodesAdded: ['n1'],
        nodesRemoved: ['n3'],
        edgesAdded: [{ from: 'n1', to: 'n2', label: 'x' }],
        edgesRemoved: [],
        propsChanged: [],
      };
      const b = {
        nodesAdded: ['n3'],
        nodesRemoved: ['n1'],
        edgesAdded: [],
        edgesRemoved: [{ from: 'n1', to: 'n2', label: 'x' }],
        propsChanged: [],
      };
      const merged = mergeDiffs(a, b);

      expect(merged.nodesAdded).toEqual([]);
      expect(merged.nodesRemoved).toEqual([]);
      expect(merged.edgesAdded).toEqual([]);
      expect(merged.edgesRemoved).toEqual([]);
    });

    it('merging with empty diff is identity', () => {
      const a = {
        nodesAdded: ['n1'],
        nodesRemoved: ['n2'],
        edgesAdded: [{ from: 'a', to: 'b', label: 'l' }],
        edgesRemoved: [{ from: 'c', to: 'd', label: 'm' }],
        propsChanged: [{ nodeId: 'n1', key: 'k', value: 'v', prevValue: undefined }],
      };
      const merged = mergeDiffs(a, createEmptyDiff());
      expect(merged.nodesAdded).toEqual(a.nodesAdded);
      expect(merged.nodesRemoved).toEqual(a.nodesRemoved);
      expect(merged.edgesAdded).toEqual(a.edgesAdded);
      expect(merged.edgesRemoved).toEqual(a.edgesRemoved);
      expect(merged.propsChanged).toEqual(a.propsChanged);
    });
  });
});
