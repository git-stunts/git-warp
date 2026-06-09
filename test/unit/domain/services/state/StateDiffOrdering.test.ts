import { describe, expect, it } from 'vitest';
import {
  compareEdgeChanges,
  comparePropChanges,
  compareText,
} from '../../../../../src/domain/services/state/StateDiffOrdering.ts';

describe('StateDiffOrdering', () => {
  it('orders strings by deterministic codepoint comparison', () => {
    expect(compareText('a', 'b')).toBe(-1);
    expect(compareText('b', 'a')).toBe(1);
    expect(compareText('a', 'a')).toBe(0);
  });

  it('orders edge changes by from, to, and label', () => {
    const edges = [
      { from: 'b', to: 'a', label: 'rel' },
      { from: 'a', to: 'c', label: 'rel' },
      { from: 'a', to: 'b', label: 'z' },
      { from: 'a', to: 'b', label: 'a' },
    ];

    expect(edges.sort(compareEdgeChanges)).toEqual([
      { from: 'a', to: 'b', label: 'a' },
      { from: 'a', to: 'b', label: 'z' },
      { from: 'a', to: 'c', label: 'rel' },
      { from: 'b', to: 'a', label: 'rel' },
    ]);
  });

  it('orders property changes by encoded key', () => {
    const props = [{ key: 'node:b\0title' }, { key: 'node:a\0title' }];

    expect(props.sort(comparePropChanges)).toEqual([
      { key: 'node:a\0title' },
      { key: 'node:b\0title' },
    ]);
  });
});
