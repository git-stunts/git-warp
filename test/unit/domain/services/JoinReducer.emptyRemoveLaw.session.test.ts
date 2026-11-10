/**
 * The #193 remove law on the session (trie) reducer that Git storage uses.
 * See `JoinReducer.emptyRemoveLaw.test.ts` for the in-memory reducer and
 * `docs/topics/crdt-construction.md` for the law.
 */

import { describe, expect, it } from 'vitest';
import { Dot, encodeDot } from '../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import PatchError from '../../../../src/domain/errors/PatchError.ts';
import TrieGeometry from '../../../../src/domain/orset/trie/TrieGeometry.ts';
import StateSession from '../../../../src/domain/orset/session/StateSession.ts';
import { encodeEdgeKey } from '../../../../src/domain/services/JoinReducer.ts';
import {
  ReducerSessionFrame,
  applyLivenessInSession,
  reducePatchesInSession,
} from '../../../../src/domain/services/JoinReducerSession.ts';
import Patch from '../../../../src/domain/types/Patch.ts';
import EdgeAdd from '../../../../src/domain/types/ops/EdgeAdd.ts';
import EdgeRemove from '../../../../src/domain/types/ops/EdgeRemove.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import NodePropSet from '../../../../src/domain/types/ops/NodePropSet.ts';
import NodeRemove from '../../../../src/domain/types/ops/NodeRemove.ts';
import type { PatchOp } from '../../../../src/domain/types/ops/unions.ts';
import cborCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import { InMemoryTrieStore } from '../../../helpers/trieHelpers.ts';

type Entry = { readonly patch: { readonly writer: string; readonly lamport: number; readonly ops: readonly object[]; readonly context: VersionVector }; readonly sha: string };

async function openFrame(): Promise<ReducerSessionFrame> {
  const session = await StateSession.open({
    nodeAliveRootOid: null,
    edgeAliveRootOid: null,
    store: new InMemoryTrieStore(),
    codec: cborCodec,
    geometry: TrieGeometry.default16way(),
  });
  return new ReducerSessionFrame({ session, prop: new Map(), observedFrontier: VersionVector.empty(), edgeBirthEvent: new Map() });
}

function entry(writer: string, lamport: number, ops: readonly PatchOp[], sha: string) {
  return { patch: new Patch({ writer, lamport, context: {}, ops }), sha };
}

/** A raw reducer input record: the reducer's malformed-input boundary. */
function rawEntry(op: object): Entry {
  return { patch: { writer: 'w1', lamport: 1, ops: [op], context: VersionVector.empty() }, sha: 'a'.repeat(40) };
}

const OWNERLESS = [
  { type: 'NodeRemove', observedDots: [] },
  { type: 'EdgeRemove', observedDots: [] },
  { type: 'NodeRemove', observedDots: ['w1:1'] },
];

const D1 = new Dot('w1', 1);
const EDGE_KEY = encodeEdgeKey('a', 'b', 'rel');
const setup = entry('w1', 1, [
  new NodeAdd('a', D1),
  new NodePropSet('a', 'color', 'red'),
  new EdgeAdd({ from: 'a', to: 'b', label: 'rel', dot: new Dot('w1', 2) }),
], 'a'.repeat(40));
const emptyRemoves = entry('w2', 2, [
  new NodeRemove('a', []),
  new EdgeRemove({ from: 'a', to: 'b', label: 'rel', observedDots: [] }),
  new NodeRemove('ghost', []),
], 'b'.repeat(40));

describe('remove law on the session reducer (#193)', () => {
  it('rule 1: refuses an ownerless remove on the fast, receipt, diff and liveness paths', async () => {
    for (const op of OWNERLESS) {
      // @ts-expect-error deliberate malformed reducer input: an ownerless remove record
      await expect(reducePatchesInSession([rawEntry(op)], await openFrame())).rejects.toThrow(PatchError);
      // @ts-expect-error deliberate malformed reducer input: an ownerless remove record
      await expect(reducePatchesInSession([rawEntry(op)], await openFrame(), { receipts: true })).rejects.toThrow(PatchError);
      // @ts-expect-error deliberate malformed reducer input: an ownerless remove record
      await expect(reducePatchesInSession([rawEntry(op)], await openFrame(), { trackDiff: true })).rejects.toThrow(PatchError);
      const frame = await openFrame();
      // @ts-expect-error deliberate malformed reducer input: an ownerless remove record
      await expect(applyLivenessInSession(frame.session, rawEntry(op).patch)).rejects.toThrow(PatchError);
    }
  });

  it('rule 2: owned empty-dot removes are redundant no-ops that leave lifecycle state unchanged', async () => {
    const frame = await openFrame();
    const { receipts } = await reducePatchesInSession([setup, emptyRemoves], frame, { receipts: true });
    expect(receipts[1]?.ops).toEqual([
      { op: 'NodeTombstone', target: 'a', result: 'redundant' },
      { op: 'EdgeTombstone', target: EDGE_KEY, result: 'redundant' },
      { op: 'NodeTombstone', target: 'ghost', result: 'redundant' },
    ]);
    expect(await frame.session.nodeContains('a')).toBe(true);
    expect(await frame.session.edgeContains(EDGE_KEY)).toBe(true);
    expect(frame.nodeClearEvent.has('a')).toBe(false);
    expect(frame.edgeRemoveEvent.has(EDGE_KEY)).toBe(false);
    expect(frame.prop.get('a\0color')?.value).toBe('red');
  });

  it('rule 2: the diff path reports no removal for an empty-dot remove', async () => {
    const { diff } = await reducePatchesInSession([setup, emptyRemoves], await openFrame(), { trackDiff: true });
    expect(diff.nodesRemoved).toEqual([]);
    expect(diff.edgesRemoved).toEqual([]);
    expect(diff.nodesCleared).toEqual([]);
  });

  it('rule 3: an unobserved concurrent re-add survives in every order, also when the remove comes first', async () => {
    const add = entry('w1', 1, [new NodeAdd('a', D1)], 'a'.repeat(40));
    const remove = entry('w2', 2, [new NodeRemove('a', [encodeDot(D1)])], 'b'.repeat(40));
    const reAdd = entry('w3', 2, [new NodeAdd('a', new Dot('w3', 1))], 'c'.repeat(40));
    for (const order of [[add, remove, reAdd], [remove, add, reAdd], [reAdd, remove, add], [remove, reAdd, add]]) {
      const frame = await openFrame();
      await reducePatchesInSession(order, frame);
      expect([...await frame.session.nodeDots('a')]).toEqual(['w3:1']);
    }
  });
});
