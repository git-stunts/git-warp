import { describe, expect, it } from 'vitest';
import { graph } from '../../../charts.ts';
import {
  decodeObserverValue,
  requireObserverReading,
} from '../../../src/domain/api/ObserverRuntime.ts';

describe('graph chart observers', () => {
  it('builds one bounded neighborhood reading plan', () => {
    const observer = graph.neighborhood({
      around: 'user:alice',
      direction: 'out',
      labels: ['member-of'],
      limit: 25,
      cursor: 'next-page',
    });

    expect(observer.id).toBe('charts.graph.neighborhood');
    expect(observer.cardinality).toBe('exactly-one');
    expect(requireObserverReading(observer).descriptor).toEqual({
      kind: 'neighborhood',
      subject: 'user:alice',
      direction: 'out',
      labels: ['member-of'],
      limit: 25,
      cursor: 'next-page',
    });
  });

  it('decodes the canonical graph-shaped Reading value', () => {
    const observer = graph.neighborhood({ around: 'user:alice' });
    const value = decodeObserverValue(observer, {
      subject: 'user:alice',
      direction: 'both',
      edges: [
        { direction: 'out', neighborId: 'team:warp', label: 'member-of' },
      ],
      completeness: 'truncated',
      cursor: 'next-page',
    });

    expect(value).toEqual({
      subject: 'user:alice',
      direction: 'both',
      edges: [
        { direction: 'out', neighborId: 'team:warp', label: 'member-of' },
      ],
      completeness: 'truncated',
      cursor: 'next-page',
    });
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.edges)).toBe(true);
    expect(Object.isFrozen(value.edges[0])).toBe(true);
  });

  it('rejects malformed chart values at the Observer boundary', () => {
    const observer = graph.neighborhood({ around: 'user:alice' });

    expect(() => decodeObserverValue(observer, {
      subject: 'user:alice',
      direction: 'sideways',
      edges: [],
      completeness: 'complete',
      cursor: null,
    })).toThrow('invalid chart direction');
    expect(() => decodeObserverValue(observer, {
      subject: 'user:alice',
      direction: 'both',
      edges: [{ direction: 'sideways', neighborId: 'team:warp', label: 'member-of' }],
      completeness: 'complete',
      cursor: null,
    })).toThrow('invalid chart edge');
  });
});
