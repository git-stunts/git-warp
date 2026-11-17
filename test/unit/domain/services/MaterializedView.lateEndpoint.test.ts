/**
 * The incremental edge index agrees with a full rebuild when a patch adds an
 * edge before any patch adds one of its endpoints.
 *
 * `PatchBuilder.addEdge` does not require its endpoints to exist, so the alive
 * edge set can hold an edge whose endpoint has never been alive. The edge is
 * visible, and indexed, once both endpoints are alive.
 *
 * Oracle: specified visibility. An edge is visible when it is alive and both
 * of its endpoints are alive; `LogicalIndexBuildService` indexes exactly the
 * visible edges, and each case also states the expected neighbours literally.
 */
import { describe, it, expect } from 'vitest';
import { applyWithDiff, createEmptyState, reducePatches } from '../../../../src/domain/services/JoinReducer.ts';
import { Dot, encodeDot } from '../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import MaterializedViewService, { type BuildResult } from '../../../../src/domain/services/MaterializedViewService.ts';
import BitmapNeighborProvider from '../../../../src/domain/services/index/BitmapNeighborProvider.ts';
import MockIndexStorage from '../../../helpers/MockIndexStorage.ts';
import type { PatchLike } from '../../../../src/domain/services/JoinReducer.ts';

type Entry = { readonly patch: PatchLike; readonly sha: string };
type Neighbourhood = Record<string, { readonly out: string[]; readonly in: string[] }>;

function entry(writer: string, lamport: number, ops: PatchLike['ops']): Entry {
  return {
    // Writers are named A-C, so the lowercase name is a hex digit.
    sha: `${writer.toLowerCase()}${String(lamport)}`.padEnd(40, '0'),
    patch: { writer, lamport, ops, context: VersionVector.empty() },
  };
}

function service(): MaterializedViewService {
  return new MaterializedViewService({ indexStore: new MockIndexStorage() });
}

function fullBuild(entries: readonly Entry[]): BuildResult {
  return service().build(reducePatches([...entries]));
}

function incrementalBuild(entries: readonly Entry[]): BuildResult {
  const views = service();
  const state = createEmptyState();
  let result = views.build(createEmptyState());
  for (const { patch, sha } of entries) {
    const { diff } = applyWithDiff(state, patch, sha);
    result = views.applyDiff({ existingTree: result.tree, diff, state });
  }
  return result;
}

/** Each node's neighbours as sorted `label:neighbour` strings, in both directions. */
async function neighbourhood(result: BuildResult, nodeIds: readonly string[]): Promise<Neighbourhood> {
  const provider = new BitmapNeighborProvider({ logicalIndex: result.logicalIndex });
  const view: Neighbourhood = {};
  for (const nodeId of nodeIds) {
    const out = await provider.getNeighbors(nodeId, 'out');
    const incoming = await provider.getNeighbors(nodeId, 'in');
    view[nodeId] = {
      out: out.map((edge) => `${edge.label}:${edge.neighborId}`).sort(),
      in: incoming.map((edge) => `${edge.label}:${edge.neighborId}`).sort(),
    };
  }
  return view;
}

describe('incremental edge index when an endpoint is first added after the edge', () => {
  it('indexes an edge whose target node is first added by a later patch', async () => {
    const entries = [
      entry('A', 1, [
        { type: 'NodeAdd', node: 'a', dot: Dot.create('A', 1) },
        { type: 'EdgeAdd', from: 'a', to: 'n', label: 'x', dot: Dot.create('A', 2) },
      ]),
      entry('A', 2, [{ type: 'NodeAdd', node: 'n', dot: Dot.create('A', 3) }]),
    ];

    const full = await neighbourhood(fullBuild(entries), ['a', 'n']);
    const incremental = await neighbourhood(incrementalBuild(entries), ['a', 'n']);

    expect(full).toEqual({ a: { out: ['x:n'], in: [] }, n: { out: [], in: ['x:a'] } });
    expect(incremental).toEqual(full);
  });

  it('indexes an edge whose source node is first added by a later patch', async () => {
    const entries = [
      entry('A', 1, [{ type: 'NodeAdd', node: 'b', dot: Dot.create('A', 1) }]),
      entry('B', 2, [{ type: 'EdgeAdd', from: 'n', to: 'b', label: 'x', dot: Dot.create('B', 1) }]),
      entry('C', 3, [{ type: 'NodeAdd', node: 'n', dot: Dot.create('C', 1) }]),
    ];

    const full = await neighbourhood(fullBuild(entries), ['b', 'n']);
    const incremental = await neighbourhood(incrementalBuild(entries), ['b', 'n']);

    expect(full).toEqual({ b: { out: [], in: ['x:n'] }, n: { out: ['x:b'], in: [] } });
    expect(incremental).toEqual(full);
  });

  it('indexes an edge whose two endpoints are first added by one later patch', async () => {
    const entries = [
      entry('B', 1, [{ type: 'EdgeAdd', from: 'm', to: 'n', label: 'x', dot: Dot.create('B', 1) }]),
      entry('C', 2, [
        { type: 'NodeAdd', node: 'm', dot: Dot.create('C', 1) },
        { type: 'NodeAdd', node: 'n', dot: Dot.create('C', 2) },
      ]),
    ];

    const full = await neighbourhood(fullBuild(entries), ['m', 'n']);
    const incremental = await neighbourhood(incrementalBuild(entries), ['m', 'n']);

    expect(full).toEqual({ m: { out: ['x:n'], in: [] }, n: { out: [], in: ['x:m'] } });
    expect(incremental).toEqual(full);
  });

  it('indexes no edge that was removed before its target node was first added', async () => {
    const entries = [
      entry('A', 1, [
        { type: 'NodeAdd', node: 'a', dot: Dot.create('A', 1) },
        { type: 'EdgeAdd', from: 'a', to: 'n', label: 'x', dot: Dot.create('A', 2) },
      ]),
      entry('A', 2, [{ type: 'EdgeRemove', from: 'a', to: 'n', label: 'x', observedDots: [encodeDot(Dot.create('A', 2))] }]),
      entry('A', 3, [{ type: 'NodeAdd', node: 'n', dot: Dot.create('A', 3) }]),
    ];

    const full = await neighbourhood(fullBuild(entries), ['a', 'n']);
    const incremental = await neighbourhood(incrementalBuild(entries), ['a', 'n']);

    expect(full).toEqual({ a: { out: [], in: [] }, n: { out: [], in: [] } });
    expect(incremental).toEqual(full);
  });
});
