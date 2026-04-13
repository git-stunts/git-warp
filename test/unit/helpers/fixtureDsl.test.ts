import { describe, it, expect } from 'vitest';
import {
  makeFixture,
  toAdjacencyMaps,
  runCrossProvider,
  fixtureToState,
} from '../../helpers/fixtureDsl.js';
import MaterializedViewService from '../../../src/domain/services/MaterializedViewService.ts';

describe('fixtureDsl helpers', () => {
  it('makeFixture throws when props reference unknown nodes', () => {
    expect(() => makeFixture({
      nodes: ['A'],
      edges: [],
      props: [{ nodeId: 'missing', key: 'k', value: 1 }],
    })).toThrow(/Prop target 'missing'.*not in fixture\.nodes/);
  });

  it('makeFixture throws when tombstoned nodes are unknown', () => {
    expect(() => makeFixture({
      nodes: ['A'],
      edges: [],
      tombstones: { nodes: new Set(['missing']) },
    })).toThrow(/Tombstoned node 'missing'.*not in fixture\.nodes/);
  });

  it('makeFixture throws when tombstoned edges are unknown', () => {
    expect(() => makeFixture({
      nodes: ['A', 'B'],
      edges: [{ from: 'A', to: 'B', label: 'x' }],
      tombstones: { edges: new Set(['A\0B\0missing']) },
    })).toThrow(/Tombstoned edge .*not in fixture\.edges/);
  });

  it('toAdjacencyMaps sorts adjacency lists deterministically', () => {
    const fixture = makeFixture({
      nodes: ['A', 'B', 'C'],
      edges: [
        { from: 'A', to: 'C', label: 'z' },
        { from: 'A', to: 'B', label: 'b' },
        { from: 'A', to: 'B', label: 'a' },
      ],
    });

    const { outgoing, incoming } = toAdjacencyMaps(fixture);

    expect(outgoing.get('A')).toEqual([
      { neighborId: 'B', label: 'a' },
      { neighborId: 'B', label: 'b' },
      { neighborId: 'C', label: 'z' },
    ]);
    expect(incoming.get('B')).toEqual([
      { neighborId: 'A', label: 'a' },
      { neighborId: 'A', label: 'b' },
    ]);
  });

  it('runCrossProvider fails when providers diverge on throw-vs-return behavior', async () => {
    const fixture = makeFixture({
      nodes: ['A'],
      edges: [],
    });

    /** @type {Array<{name: string, provider: import('../../../src/ports/NeighborProviderPort.ts').default}>} */
    const providers = [
      {
        name: 'returns',
        provider: {
          async getNeighbors() { return []; },
          async hasNode() { return true; },
          /** @returns {'async-local'} */
          get latencyClass() { return 'async-local'; },
        },
      },
      {
        name: 'throws',
        provider: {
          async getNeighbors() { throw new Error('boom'); },
          async hasNode() { return true; },
          /** @returns {'async-local'} */
          get latencyClass() { return 'async-local'; },
        },
      },
    ];

    await expect(runCrossProvider({
      fixture,
      providers,
      run: (engine) => engine.bfs({ start: 'A' }),
      assert: () => {},
    })).rejects.toThrow(/Provider mismatch/);
  });

  it('fixtureToState honors explicit lamport ticks for prop events', async () => {
    const fixture = makeFixture({
      nodes: ['A'],
      edges: [],
      props: [
        { nodeId: 'A', key: 'status', value: 'newer', lamport: 10 },
        { nodeId: 'A', key: 'status', value: 'older', lamport: 2 },
      ],
    });

    const state = fixtureToState(fixture);
    const service = new MaterializedViewService();
    const { propertyReader } = service.build(state);
    const props = await propertyReader.getNodeProps('A');
    expect(props).toEqual({ status: 'newer' });
  });
});
