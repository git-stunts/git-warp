import { describe, expect, it } from 'vitest';
import { graph, GraphNeighborhoodChart, GraphNeighborhoodEdge } from '../../../charts.ts';
import {
  decodeObserverValue,
  requireObserverReading,
} from '../../../src/domain/api/ObserverRuntime.ts';
import {
  registerReadingDomainObject,
  snapshotReadingValue,
} from '../../../src/domain/api/ReadingValueRuntime.ts';

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
      edges: [{ direction: 'out', neighborId: 'team:warp', label: 'member-of' }],
      completeness: 'truncated',
      cursor: 'next-page',
    });

    expect(value).toEqual({
      subject: 'user:alice',
      direction: 'both',
      edges: [{ direction: 'out', neighborId: 'team:warp', label: 'member-of' }],
      completeness: 'truncated',
      cursor: 'next-page',
    });
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.edges)).toBe(true);
    expect(Object.isFrozen(value.edges[0])).toBe(true);
    expect(value).toBeInstanceOf(GraphNeighborhoodChart);
    expect(value.edges[0]).toBeInstanceOf(GraphNeighborhoodEdge);
    expect(snapshotReadingValue(value)).toBe(value);
  });

  it('rejects malformed chart values at the Observer boundary', () => {
    const observer = graph.neighborhood({ around: 'user:alice' });

    expect(() =>
      decodeObserverValue(observer, {
        subject: 'user:alice',
        direction: 'sideways',
        edges: [],
        completeness: 'complete',
        cursor: null,
      })
    ).toThrow('invalid chart direction');
    expect(() =>
      decodeObserverValue(observer, {
        subject: 'user:alice',
        direction: 'both',
        edges: [{ direction: 'sideways', neighborId: 'team:warp', label: 'member-of' }],
        completeness: 'complete',
        cursor: null,
      })
    ).toThrow('invalid chart edge');
  });

  it('validates runtime-backed chart edges at construction', () => {
    expect(() => new GraphNeighborhoodEdge(null)).toThrow('options are required');
    expect(
      () =>
        new GraphNeighborhoodEdge({
          direction: 'sideways',
          neighborId: 'team:warp',
          label: 'member-of',
        } as never)
    ).toThrow('direction is invalid');
    expect(
      () =>
        new GraphNeighborhoodEdge({
          direction: 'out',
          neighborId: 42,
          label: 'member-of',
        } as never)
    ).toThrow('neighborId is invalid');
    expect(
      () =>
        new GraphNeighborhoodEdge({
          direction: 'out',
          neighborId: 'team:warp',
          label: 42,
        } as never)
    ).toThrow('label is invalid');
  });

  it('validates runtime-backed neighborhood charts at construction', () => {
    const edge = new GraphNeighborhoodEdge({
      direction: 'out',
      neighborId: 'team:warp',
      label: 'member-of',
    });
    expect(() => new GraphNeighborhoodChart(null)).toThrow('options are required');
    expect(
      () =>
        new GraphNeighborhoodChart({
          subject: 42,
          direction: 'both',
          edges: [edge],
          completeness: 'complete',
          cursor: null,
        } as never)
    ).toThrow('subject is invalid');
    expect(
      () =>
        new GraphNeighborhoodChart({
          subject: 'user:alice',
          direction: 'sideways',
          edges: [edge],
          completeness: 'complete',
          cursor: null,
        } as never)
    ).toThrow('direction is invalid');
    expect(
      () =>
        new GraphNeighborhoodChart({
          subject: 'user:alice',
          direction: 'both',
          edges: [
            Object.freeze({
              direction: 'out',
              neighborId: 'team:warp',
              label: 'member-of',
            }),
          ],
          completeness: 'complete',
          cursor: null,
        } as never)
    ).toThrow('edges are invalid');
    expect(
      () =>
        new GraphNeighborhoodChart({
          subject: 'user:alice',
          direction: 'both',
          edges: [edge],
          completeness: 'partial',
          cursor: null,
        } as never)
    ).toThrow('completeness is invalid');
    expect(
      () =>
        new GraphNeighborhoodChart({
          subject: 'user:alice',
          direction: 'both',
          edges: [edge],
          completeness: 'complete',
          cursor: 42,
        } as never)
    ).toThrow('cursor is invalid');
  });

  it('registers only frozen snapshot-compatible domain objects', () => {
    expect(() => registerReadingDomainObject({ value: 'mutable' })).toThrow('must be frozen');
    expect(() =>
      registerReadingDomainObject(Object.freeze({ value: () => undefined }) as never)
    ).toThrow('snapshot-compatible');
  });
});
