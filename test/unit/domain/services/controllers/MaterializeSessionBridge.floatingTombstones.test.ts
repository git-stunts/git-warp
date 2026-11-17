/**
 * #1153: a reducer session that starts from a full state, seeded from it or
 * resumed from retained trie roots beside it, keeps the state's tombstones
 * that no entry holds. Such a state comes from sync, which applies a remove
 * whose add has not arrived with the in-memory reducer.
 *
 * Oracle: the in-memory reducer (`reducePatches`) over the same patches. It
 * is a reference implementation of the same OR-set merge and keeps a
 * tombstone whose add has not arrived. Each case also states the expected
 * answer as a literal.
 */

import { describe, expect, it } from 'vitest';
import PatchEntry from '../../../../../src/domain/artifacts/PatchEntry.ts';
import { Dot, encodeDot } from '../../../../../src/domain/crdt/Dot.ts';
import MaterializationCoordinate from '../../../../../src/domain/materialization/MaterializationCoordinate.ts';
import StateSession from '../../../../../src/domain/orset/session/StateSession.ts';
import TrieGeometry from '../../../../../src/domain/orset/trie/TrieGeometry.ts';
import {
  materializationSessionOpen,
  reduceSessionBackedState,
  type MaterializeSessionOpen,
} from '../../../../../src/domain/services/controllers/MaterializeSessionBridge.ts';
import { encodeEdgeKey, reducePatches } from '../../../../../src/domain/services/JoinReducer.ts';
import type WarpState from '../../../../../src/domain/services/state/WarpState.ts';
import Patch from '../../../../../src/domain/types/Patch.ts';
import EdgeAdd from '../../../../../src/domain/types/ops/EdgeAdd.ts';
import EdgeRemove from '../../../../../src/domain/types/ops/EdgeRemove.ts';
import NodeAdd from '../../../../../src/domain/types/ops/NodeAdd.ts';
import NodeRemove from '../../../../../src/domain/types/ops/NodeRemove.ts';
import type { TickReceipt } from '../../../../../src/domain/types/TickReceipt.ts';
import type MaterializationWorkspacePort from '../../../../../src/ports/MaterializationWorkspacePort.ts';
import cborCodec from '../../../../../src/infrastructure/codecs/CborCodec.ts';
import InMemoryMaterializationStore from '../../../../helpers/InMemoryMaterializationStore.ts';
import { InMemoryTrieStore } from '../../../../helpers/trieHelpers.ts';

const GEOMETRY = TrieGeometry.default16way();
const ZED_1 = encodeDot(new Dot('zed', 1));
const ZED_3 = encodeDot(new Dot('zed', 3));
const EDGE = encodeEdgeKey('n1', 'n2', 'rel');

const zedAdds = new Patch({
  writer: 'zed', lamport: 1, context: {},
  ops: [
    new NodeAdd('n1', new Dot('zed', 1)),
    new NodeAdd('n2', new Dot('zed', 2)),
    new EdgeAdd({ from: 'n1', to: 'n2', label: 'rel', dot: new Dot('zed', 3) }),
  ],
});
const abeRemovesN1 = new Patch({
  writer: 'abe', lamport: 2, context: { zed: 3 },
  ops: [new NodeRemove('n1', [ZED_1])],
});
const abeRemovesEdge = new Patch({
  writer: 'abe', lamport: 2, context: { zed: 3 },
  ops: [new EdgeRemove({ from: 'n1', to: 'n2', label: 'rel', observedDots: [ZED_3] })],
});

function entries(patches: readonly Patch[]): PatchEntry[] {
  return patches.map((patch) => new PatchEntry({ patch, sha: String(patch.lamport).repeat(40) }));
}

/** The in-memory reducer over patches that arrived in one batch: the base a sync leaves. */
function inMemory(patches: readonly Patch[]): WarpState {
  return reducePatches(entries(patches));
}

type Membership = {
  readonly n1: boolean;
  readonly edge: boolean;
  readonly nodeTombstones: readonly string[];
  readonly edgeTombstones: readonly string[];
};

function membershipOf(state: WarpState): Membership {
  return {
    n1: state.nodeAlive.contains('n1'),
    edge: state.edgeAlive.contains(EDGE),
    nodeTombstones: [...state.nodeAlive.tombstonesIter()].sort(),
    edgeTombstones: [...state.edgeAlive.tombstonesIter()].sort(),
  };
}

function opener(store: InMemoryTrieStore) {
  return async (
    roots: MaterializeSessionOpen,
    options: { readonly workspace: MaterializationWorkspacePort },
  ): Promise<StateSession> => await StateSession.open({
    ...roots, store, codec: cborCodec, geometry: GEOMETRY, workspace: options.workspace,
  });
}

type SessionRun = {
  readonly store: InMemoryTrieStore;
  readonly base?: WarpState;
  readonly roots?: MaterializeSessionOpen;
  readonly patches: readonly Patch[];
  readonly receipts?: boolean;
  readonly wantDiff?: boolean;
};

async function reduceInSession(run: SessionRun) {
  return await reduceSessionBackedState({
    openStateSession: opener(run.store),
    materializations: new InMemoryMaterializationStore(),
    coordinate: new MaterializationCoordinate({ frontier: new Map([['zed', 'f'.repeat(40)]]), ceiling: null }),
    patches: entries(run.patches),
    ...(run.base === undefined ? {} : { baseState: run.base }),
    ...(run.roots === undefined ? {} : { roots: run.roots }),
    receipts: run.receipts ?? false,
    wantDiff: run.wantDiff ?? false,
  });
}

function sessionRoots(reduced: Awaited<ReturnType<typeof reduceInSession>>): MaterializeSessionOpen {
  const roots = materializationSessionOpen(reduced.roots);
  if (roots === null) { throw new Error('the session left no reopenable roots'); }
  return roots;
}

/** What point reads such as `hasNode` see: the retained trie, reopened. */
async function pointReads(store: InMemoryTrieStore, roots: MaterializeSessionOpen): Promise<{ n1: boolean; edge: boolean }> {
  const session = await StateSession.open({ ...roots, store, codec: cborCodec, geometry: GEOMETRY });
  return { n1: await session.nodeContains('n1'), edge: await session.edgeContains(EDGE) };
}

function outcomes(receipts: readonly TickReceipt[]): string[] {
  return receipts.flatMap((receipt) => receipt.ops.map((op) => `${op.op}:${op.target}:${op.result}`));
}

describe('a reducer session that starts from a state with a tombstone no entry holds (#1153)', () => {
  it('keeps a node tombstone whose add has not arrived', async () => {
    const reduced = await reduceInSession({ store: new InMemoryTrieStore(), base: inMemory([abeRemovesN1]), patches: [] });

    expect(membershipOf(reduced.state)).toEqual({ n1: false, edge: false, nodeTombstones: [ZED_1], edgeTombstones: [] });
  });

  it('keeps n1 removed when its add arrives after the remove was seeded', async () => {
    const store = new InMemoryTrieStore();
    const reduced = await reduceInSession({ store, base: inMemory([abeRemovesN1]), patches: [zedAdds] });

    expect(membershipOf(reduced.state)).toEqual(membershipOf(inMemory([abeRemovesN1, zedAdds])));
    expect({ state: membershipOf(reduced.state).n1, point: (await pointReads(store, sessionRoots(reduced))).n1 })
      .toEqual({ state: false, point: false });
  });

  it('keeps n1 removed when the base holds the add and the remove arrives after it', async () => {
    const store = new InMemoryTrieStore();
    const reduced = await reduceInSession({ store, base: inMemory([zedAdds]), patches: [abeRemovesN1] });

    expect(membershipOf(reduced.state)).toEqual(membershipOf(inMemory([zedAdds, abeRemovesN1])));
    expect({ state: membershipOf(reduced.state).n1, point: (await pointReads(store, sessionRoots(reduced))).n1 })
      .toEqual({ state: false, point: false });
  });

  it('keeps the edge removed when its add arrives after the remove was seeded', async () => {
    const store = new InMemoryTrieStore();
    const reduced = await reduceInSession({ store, base: inMemory([abeRemovesEdge]), patches: [zedAdds] });

    expect(membershipOf(reduced.state)).toEqual(membershipOf(inMemory([abeRemovesEdge, zedAdds])));
    expect({ state: membershipOf(reduced.state).edge, point: (await pointReads(store, sessionRoots(reduced))).edge })
      .toEqual({ state: false, point: false });
  });

  it('keeps the edge removed when the base holds the add and the remove arrives after it', async () => {
    const store = new InMemoryTrieStore();
    const reduced = await reduceInSession({ store, base: inMemory([zedAdds]), patches: [abeRemovesEdge] });

    expect(membershipOf(reduced.state)).toEqual(membershipOf(inMemory([zedAdds, abeRemovesEdge])));
    expect({ state: membershipOf(reduced.state).edge, point: (await pointReads(store, sessionRoots(reduced))).edge })
      .toEqual({ state: false, point: false });
  });

  it('keeps the tombstone through a resume from the retained roots of a seeded session', async () => {
    const store = new InMemoryTrieStore();
    const seeded = await reduceInSession({ store, base: inMemory([abeRemovesN1]), patches: [] });

    const resumed = await reduceInSession({ store, base: seeded.state, roots: sessionRoots(seeded), patches: [zedAdds] });

    expect(membershipOf(resumed.state)).toEqual(membershipOf(inMemory([abeRemovesN1, zedAdds])));
    expect((await pointReads(store, sessionRoots(resumed))).n1).toBe(false);
  });

  it('reports the receipts the in-memory reducer reports for the same base and patches', async () => {
    const base = inMemory([abeRemovesN1]);
    const reduced = await reduceInSession({ store: new InMemoryTrieStore(), base, patches: [zedAdds], receipts: true });
    const memory = reducePatches(entries([zedAdds]), base, { receipts: true });

    expect({ state: membershipOf(reduced.state), receipts: outcomes(reduced.receipts ?? []) })
      .toEqual({ state: membershipOf(memory.state), receipts: outcomes(memory.receipts) });
  });

  it('reports the diff the in-memory reducer reports for the same base and patches', async () => {
    const base = inMemory([abeRemovesN1]);
    const reduced = await reduceInSession({ store: new InMemoryTrieStore(), base, patches: [zedAdds], wantDiff: true });
    const memory = reducePatches(entries([zedAdds]), base, { trackDiff: true });

    expect({ nodesAdded: reduced.diff?.nodesAdded, edgesAdded: reduced.diff?.edgesAdded })
      .toEqual({ nodesAdded: memory.diff.nodesAdded, edgesAdded: memory.diff.edgesAdded });
    expect(reduced.diff?.nodesAdded).toEqual(['n2']);
  });
});
