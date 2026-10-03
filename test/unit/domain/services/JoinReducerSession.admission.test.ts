import { expect, it } from 'vitest';
import { LWWRegister } from '../../../../src/domain/crdt/LWW.ts';
import ReceiptBuilder from '../../../../src/domain/services/ReceiptBuilder.ts';
import OpSuperseded from '../../../../src/domain/types/ops/OpSuperseded.ts';
import WarpState from '../../../../src/domain/services/state/WarpState.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import TrieGeometry from '../../../../src/domain/orset/trie/TrieGeometry.ts';
import StateSession from '../../../../src/domain/orset/session/StateSession.ts';
import Patch from '../../../../src/domain/types/Patch.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import NodeRemove from '../../../../src/domain/types/ops/NodeRemove.ts';
import EdgeAdd from '../../../../src/domain/types/ops/EdgeAdd.ts';
import EdgeRemove from '../../../../src/domain/types/ops/EdgeRemove.ts';
import PropSet from '../../../../src/domain/types/ops/PropSet.ts';
import NodePropSet from '../../../../src/domain/types/ops/NodePropSet.ts';
import EdgePropSet from '../../../../src/domain/types/ops/EdgePropSet.ts';
import Op from '../../../../src/domain/types/ops/Op.ts';
import OpApplied from '../../../../src/domain/types/ops/OpApplied.ts';
import BlobValue from '../../../../src/domain/types/ops/BlobValue.ts';
import LegacyEventId from '../../../../src/domain/utils/LegacyEventId.ts';
import { normalizeRawOp } from '../../../../src/domain/services/OpNormalizer.ts';
import { encodeLegacyEdgePropNode, encodeEdgePropKey } from '../../../../src/domain/services/KeyCodec.ts';
import { ReducerSessionFrame, applyFastInSession, applyWithDiffInSession,
  applyWithReceiptInSession, applyLivenessInSession, joinFrames } from '../../../../src/domain/services/JoinReducerSession.ts';
import codec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import { InMemoryTrieStore } from '../../../helpers/trieHelpers.ts';

const SHA = 'aaaa';
const EDGE = 'n\0m\0link';
function patch(lamport: number, ops: Patch['ops'], context: Patch['context'] = {}) {
  return new Patch({ writer: 'A', lamport, ops, context });
}
async function frame() {
  const session = await StateSession.open({ nodeAliveRootOid: null, edgeAliveRootOid: null,
    store: new InMemoryTrieStore(), codec, geometry: TrieGeometry.default16way() });
  return new ReducerSessionFrame({ session, prop: new Map(), observedFrontier: VersionVector.empty(),
    edgeBirthEvent: new Map([[EDGE, new LegacyEventId(1)]]) });
}

it('canonicalizes raw node and edge properties before receipts and diffs', async () => {
  const value = await frame();
  const raw = new PropSet('n', 'key', 'node');
  const edge = new PropSet(encodeLegacyEdgePropNode('n', 'm', 'link'), 'key', 'edge');
  expect(normalizeRawOp(raw)).toBeInstanceOf(NodePropSet);
  expect(normalizeRawOp(edge)).toBeInstanceOf(EdgePropSet);
  const receipt = await applyWithReceiptInSession(value, patch(2, [raw, edge, new BlobValue('n', 'beef')]), SHA);
  expect(receipt.ops.map((op) => [op.op, op.result])).toEqual([
    ['NodePropSet', 'applied'], ['EdgePropSet', 'applied'], ['BlobValue', 'applied']]);
  const same = await applyWithReceiptInSession(value, patch(2, [raw, edge]), SHA);
  expect(same.ops.map((op) => op.result)).toEqual(['redundant', 'redundant']);
  const older = await applyWithReceiptInSession(value, patch(1, [raw, edge]), SHA);
  expect(older.ops.map((op) => op.result)).toEqual(['superseded', 'superseded']);
  expect(older.ops.every((op) => typeof op.reason === 'string')).toBe(true);
  const newer = await applyWithDiffInSession(value, patch(3, [new PropSet('n', 'key', 'new'),
    new EdgePropSet({ from: 'n', to: 'm', label: 'link', key: 'key', value: 'new edge' }),
    new BlobValue('n', 'feed')]), SHA);
  expect(newer.propsChanged.map((change) => change.prevValue)).toEqual(['node', 'edge']);
  await applyFastInSession(value, patch(4, [raw, edge]), SHA);
  expect(value.getEncodedProp('n\0key')?.value).toBe('node');
  expect(value.getEncodedProp(encodeEdgePropKey('n', 'm', 'link', 'key'))?.value).toBe('edge');
  const stale = await applyWithDiffInSession(value, patch(1, [raw, edge]), SHA);
  expect(stale.propsChanged).toEqual([]);
  await value.session.close();
});

it('reports effective membership removals and leaves duplicates out of diffs', async () => {
  const value = await frame();
  const nodeDot = new Dot('A', 1);
  const edgeDot = new Dot('A', 2);
  const adds = [new NodeAdd('n', nodeDot), new EdgeAdd({ from: 'n', to: 'm', label: 'link', dot: edgeDot })];
  const first = await applyWithReceiptInSession(value, patch(2, adds), SHA);
  expect(first.ops.map((op) => op.result)).toEqual(['applied', 'applied']);
  const duplicate = await applyWithReceiptInSession(value, patch(2, adds), SHA);
  expect(duplicate.ops.map((op) => op.result)).toEqual(['redundant', 'redundant']);
  const redundantDiff = await applyWithDiffInSession(value, patch(3, adds), SHA);
  expect(redundantDiff.nodesAdded).toEqual([]);
  expect(redundantDiff.edgesAdded).toEqual([]);
  const absent = [new NodeRemove('n', ['B:1']), new EdgeRemove({ from: 'n', to: 'm', label: 'link', observedDots: ['B:2'] })];
  expect((await applyWithReceiptInSession(value, patch(4, absent), SHA)).ops.map((op) => op.result))
    .toEqual(['redundant', 'redundant']);
  const removes = [new NodeRemove('n', ['B:1', Dot.encode(nodeDot)]),
    new EdgeRemove({ from: 'n', to: 'm', label: 'link', observedDots: ['B:2', Dot.encode(edgeDot)] })];
  expect((await applyWithReceiptInSession(value, patch(5, removes), SHA)).ops.map((op) => op.result))
    .toEqual(['applied', 'applied']);
  const removedAgain = await applyWithDiffInSession(value, patch(6, removes), SHA);
  expect(removedAgain.nodesRemoved).toEqual([]);
  expect(removedAgain.edgesRemoved).toEqual([]);
  const addition = await applyWithDiffInSession(value, patch(7, [new EdgeAdd({ from: 'n', to: 'm', label: 'link', dot: new Dot('A', 3) })]), SHA);
  expect(addition.edgesAdded).toEqual([{ from: 'n', to: 'm', label: 'link' }]);
  const removal = await applyWithDiffInSession(value, patch(8, [new EdgeRemove({ from: 'n', to: 'm', label: 'link', observedDots: ['A:3'] })]), SHA);
  expect(removal.edgesRemoved).toEqual([{ from: 'n', to: 'm', label: 'link' }]);
  await value.session.close();
});

it('preserves admitted property values and refuses invalid nested values', async () => {
  const value = await frame();
  const payload = [null, true, 42, new Uint8Array([1]), { nested: ['text', false] }];
  await applyFastInSession(value, patch(2, [new PropSet('n', 'payload', payload)]), SHA);
  expect(value.getEncodedProp('n\0payload')?.value).toEqual(payload);
  await expect(applyFastInSession(value, patch(3, [new PropSet('n', 'invalid', { nested: undefined })]), SHA))
    .rejects.toThrow('not a valid PropValue');
  await value.session.close();
});

it('preserves forward-compatible skips, sparse operations and observed-frontier contexts', async () => {
  const value = await frame();
  const raw = { writer: 'A', lamport: 2, ops: [{ type: 'FutureOp' }], context: new Map([['B', 3]]) };
  await Reflect.apply(applyFastInSession, undefined, [value, raw, SHA]);
  await Reflect.apply(applyLivenessInSession, undefined, [value.session, raw]);
  await applyFastInSession(value, patch(1, new Array<Patch['ops'][number]>(1), new VersionVector(new Map([['C', 4]]))), SHA);
  await Reflect.apply(applyFastInSession, undefined, [value, { writer: 'A', lamport: 1, ops: [] }, SHA]);
  expect([...value.observedFrontier]).toEqual([['B', 3], ['A', 2], ['C', 4]]);
  await value.session.close();
});

it('joins removed edge evidence and preserves historical edge birth identity', async () => {
  const left = await frame();
  const right = await frame();
  const event = new LegacyEventId(7);
  right.edgeBirthEvent.set(EDGE, event);
  await right.session.addEdge(EDGE, new Dot('A', 1));
  await right.session.removeEdge(EDGE, new Set(['A:1']));
  const merged = await joinFrames(left, right);
  expect(merged.edgeBirthEvent.get(EDGE)).toBe(event);
  expect(await merged.session.edgeContains(EDGE)).toBe(false);
  await merged.session.addEdge(EDGE, new Dot('A', 1));
  expect(await merged.session.edgeContains(EDGE)).toBe(false);
  await left.session.close();
  await right.session.close();
});

it('reports the actual historical winning identity when a modern write loses', async () => {
  const value = await frame();
  const old = new LegacyEventId(7);
  value.prop.set('n\0key', new LWWRegister(old, 'historical'));
  const receipt = await applyWithReceiptInSession(value, patch(1, [new PropSet('n', 'key', 'older')]), SHA);
  expect(receipt.ops[0]?.result).toBe('superseded');
  expect(value.getEncodedProp('n\0key')?.eventId).toBe(old);
  const state = WarpState.empty();
  state.mutatePropLWW('n\0key', old, 'historical');
  const outcome = ReceiptBuilder.propSetOutcome(state, { node: 'n', key: 'key' }, new EventId(1, 'A', SHA, 0));
  expect(outcome).toBeInstanceOf(OpSuperseded);
  if (!(outcome instanceof OpSuperseded)) throw new Error('Expected historical supersession');
  expect(outcome.winner).toBe(old);
  await value.session.close();
});

class UnsupportedReplayOperation extends Op {
  readonly receiptName = 'FutureOp';
  constructor() { super('FutureOp', 0); Object.freeze(this); }
  validate(): void {}
  mutate(): void {}
  outcome(): OpApplied { return new OpApplied('future'); }
  snapshot(): { readonly nodeWasAlive?: boolean } { return {}; }
  accumulate(): void {}
}

it('refuses an unsupported runtime operation before session mutation', async () => {
  const value = await frame();
  const input = { writer: 'A', lamport: 1, ops: [new UnsupportedReplayOperation()], context: {} };
  for (const apply of [applyFastInSession, applyWithDiffInSession, applyWithReceiptInSession]) {
    await expect(Reflect.apply(apply, undefined, [value, input, SHA])).rejects.toThrow('Unsupported canonical op');
  }
  expect(value.propSize()).toBe(0);
  await value.session.close();
});
