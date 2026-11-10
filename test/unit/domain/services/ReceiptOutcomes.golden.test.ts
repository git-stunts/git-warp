/**
 * Golden receipt outcomes (#1119). Receipt order stays writer-id order for
 * full replays; a separate card owns causal receipt order. This test pins
 * the outcomes, and requires the in-memory and session reducers to report
 * the same outcomes for the same order.
 *
 * In writer order a remove can run before the add it observed. Its receipt
 * is then `redundant` (nothing live was removed at that point), the later
 * add reports `applied`, and the element still ends up removed.
 */

import { describe, expect, it } from 'vitest';
import { Dot, encodeDot } from '../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import TrieGeometry from '../../../../src/domain/orset/trie/TrieGeometry.ts';
import StateSession from '../../../../src/domain/orset/session/StateSession.ts';
import { encodeEdgeKey, reducePatches } from '../../../../src/domain/services/JoinReducer.ts';
import { ReducerSessionFrame, reducePatchesInSession } from '../../../../src/domain/services/JoinReducerSession.ts';
import Patch from '../../../../src/domain/types/Patch.ts';
import EdgeAdd from '../../../../src/domain/types/ops/EdgeAdd.ts';
import EdgeRemove from '../../../../src/domain/types/ops/EdgeRemove.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import NodePropSet from '../../../../src/domain/types/ops/NodePropSet.ts';
import NodeRemove from '../../../../src/domain/types/ops/NodeRemove.ts';
import type { TickReceipt } from '../../../../src/domain/types/TickReceipt.ts';
import cborCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import { InMemoryTrieStore } from '../../../helpers/trieHelpers.ts';

const EDGE = encodeEdgeKey('n1', 'n2', 'rel');
const zed = { patch: new Patch({ writer: 'zed', lamport: 1, context: {}, ops: [
  new NodeAdd('n1', new Dot('zed', 1)),
  new NodeAdd('n2', new Dot('zed', 2)),
  new EdgeAdd({ from: 'n1', to: 'n2', label: 'rel', dot: new Dot('zed', 3) }),
] }), sha: '1'.repeat(40) };
const abe = { patch: new Patch({ writer: 'abe', lamport: 2, context: { zed: 3 }, ops: [
  new NodeRemove('n1', [encodeDot(new Dot('zed', 1))]),
  new NodePropSet('n2', 'k', 'abe'),
] }), sha: '2'.repeat(40) };
const mid = { patch: new Patch({ writer: 'mid', lamport: 3, context: { zed: 3 }, ops: [
  new EdgeRemove({ from: 'n1', to: 'n2', label: 'rel', observedDots: [encodeDot(new Dot('zed', 3))] }),
  new NodeRemove('n2', []),
] }), sha: '3'.repeat(40) };

function outcomes(receipts: readonly TickReceipt[]): string[] {
  return receipts.flatMap((r) => r.ops.map((op) => `${r.writer}:${op.op}:${op.target}:${op.result}`));
}

async function sessionOutcomes(order: readonly (typeof zed)[]): Promise<{ outcomes: string[]; nodes: string[] }> {
  const session = await StateSession.open({
    nodeAliveRootOid: null, edgeAliveRootOid: null, store: new InMemoryTrieStore(), codec: cborCodec,
    geometry: TrieGeometry.default16way(),
  });
  const frame = new ReducerSessionFrame({ session, prop: new Map(), observedFrontier: VersionVector.empty(), edgeBirthEvent: new Map() });
  const { receipts } = await reducePatchesInSession(order, frame, { receipts: true });
  const nodes: string[] = [];
  for await (const node of session.scanNodes()) { nodes.push(node); }
  return { outcomes: outcomes(receipts), nodes: nodes.sort() };
}

describe('golden receipt outcomes (#1119)', () => {
  it('writer-id order: the early removes report redundant on both reducers, and the state is still right', async () => {
    const order = [abe, mid, zed];
    const golden = [
      'abe:NodeTombstone:n1:redundant',
      'abe:NodePropSet:n2\0k:applied',
      `mid:EdgeTombstone:${EDGE}:redundant`,
      'mid:NodeTombstone:n2:redundant',
      'zed:NodeAdd:n1:applied',
      'zed:NodeAdd:n2:applied',
      `zed:EdgeAdd:${EDGE}:applied`,
    ];
    const memory = reducePatches(order, undefined, { receipts: true });
    const session = await sessionOutcomes(order);
    expect(outcomes(memory.receipts)).toEqual(golden);
    expect(session.outcomes).toEqual(golden);
    expect([...memory.state.nodeAlive.elements()].sort()).toEqual(['n2']);
    expect(session.nodes).toEqual(['n2']);
    expect(memory.state.edgeAlive.elements()).toEqual([]);
  });

  it('causal order: the observed removes report applied on both reducers', async () => {
    const order = [zed, abe, mid];
    const golden = [
      'zed:NodeAdd:n1:applied',
      'zed:NodeAdd:n2:applied',
      `zed:EdgeAdd:${EDGE}:applied`,
      'abe:NodeTombstone:n1:applied',
      'abe:NodePropSet:n2\0k:applied',
      `mid:EdgeTombstone:${EDGE}:applied`,
      'mid:NodeTombstone:n2:redundant',
    ];
    expect(outcomes(reducePatches(order, undefined, { receipts: true }).receipts)).toEqual(golden);
    expect((await sessionOutcomes(order)).outcomes).toEqual(golden);
  });
});
