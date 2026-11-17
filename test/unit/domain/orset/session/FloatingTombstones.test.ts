/**
 * #1153: the tombstones of a state that no OR-set entry holds, kept beside
 * a reducer session.
 *
 * Oracle: the in-memory `ORSet` semantics (a tombstone applies by dot,
 * whether or not the add has arrived) and the literal expectations below.
 */

import { describe, expect, it, vi } from 'vitest';
import { Dot, encodeDot } from '../../../../../src/domain/crdt/Dot.ts';
import ORSet from '../../../../../src/domain/crdt/ORSet.ts';
import CrdtError from '../../../../../src/domain/errors/CrdtError.ts';
import FloatingTombstones from '../../../../../src/domain/orset/session/FloatingTombstones.ts';
import StateSession from '../../../../../src/domain/orset/session/StateSession.ts';
import TrieGeometry from '../../../../../src/domain/orset/trie/TrieGeometry.ts';
import cborCodec from '../../../../../src/infrastructure/codecs/CborCodec.ts';
import { InMemoryTrieStore } from '../../../../helpers/trieHelpers.ts';

const ZED_1 = encodeDot(new Dot('zed', 1));
const ZED_2 = encodeDot(new Dot('zed', 2));
const ZED_3 = encodeDot(new Dot('zed', 3));
const EDGE = 'n1\0n2\0rel';

async function openSession(): Promise<StateSession> {
  return await StateSession.open({
    nodeAliveRootOid: null,
    edgeAliveRootOid: null,
    store: new InMemoryTrieStore(),
    codec: cborCodec,
    geometry: TrieGeometry.default16way(),
  });
}

/** An OR-set whose tombstones are `held` (an entry of `n1` holds it) and `floating`. */
function orsetWith(held: string, floating: string): ORSet {
  return new ORSet(new Map([['n1', new Set([held])]]), new Set([held, floating]));
}

describe('FloatingTombstones', () => {
  it('keeps the node and edge tombstones of a state that no entry holds', () => {
    const tombstones = FloatingTombstones.of({ nodeAlive: orsetWith(ZED_1, ZED_2), edgeAlive: orsetWith(ZED_2, ZED_3) });

    expect({ nodes: [...tombstones.nodeDots()], edges: [...tombstones.edgeDots()] })
      .toEqual({ nodes: [ZED_2], edges: [ZED_3] });
  });

  it('skips base tombstones that are not canonical dots, as the session trie does', () => {
    // Oracle: the Dot admission rule (non-empty writer, canonical positive
    // counter). A remove checks only for non-empty strings and ORSet.remove
    // stores them as given, so a sync-applied state can hold these.
    const malformed = ['zed:01', 'zed:0', 'zed:+1', 'zed:1.5', 'zed:', ':1', 'not-a-dot'];
    const nodeAlive = ORSet.empty();
    const edgeAlive = ORSet.empty();
    nodeAlive.remove(new Set([...malformed, ZED_2]));
    edgeAlive.remove(new Set(['peer:01']));

    const tombstones = FloatingTombstones.of({ nodeAlive, edgeAlive });

    expect({ nodes: [...tombstones.nodeDots()], edges: [...tombstones.edgeDots()] })
      .toEqual({ nodes: [ZED_2], edges: [] });
  });

  it('rethrows a decode failure that is not a CRDT format error', () => {
    const nodeAlive = ORSet.empty();
    nodeAlive.remove(new Set([ZED_1]));
    const decode = vi.spyOn(Dot, 'decode').mockImplementation(() => { throw new RangeError('unexpected'); });
    try {
      expect(() => FloatingTombstones.of({ nodeAlive, edgeAlive: ORSet.empty() })).toThrow(RangeError);
    } finally {
      decode.mockRestore();
    }
  });

  it('is empty for a state without tombstones', () => {
    const tombstones = FloatingTombstones.of({ nodeAlive: ORSet.empty(), edgeAlive: ORSet.empty() });

    expect({ nodes: [...tombstones.nodeDots()], edges: [...tombstones.edgeDots()] }).toEqual({ nodes: [], edges: [] });
  });

  it('copies its input, so a later change to the caller set does not reach it', () => {
    const nodeDots = new Set([ZED_1]);
    const tombstones = new FloatingTombstones({ nodeDots, edgeDots: [] });
    nodeDots.add(ZED_2);

    expect([...tombstones.nodeDots()]).toEqual([ZED_1]);
  });

  it('refuses a dot that is not canonical', () => {
    expect(() => new FloatingTombstones({ nodeDots: ['zed:01'], edgeDots: [] })).toThrow(CrdtError);
  });

  it('refuses a dot that is not a string', () => {
    // @ts-expect-error deliberate runtime-boundary fixture: a number is not an encoded dot
    expect(() => new FloatingTombstones({ nodeDots: [], edgeDots: [7] })).toThrow(/must be a string/u);
  });

  it('joins two sets into their union', () => {
    const left = new FloatingTombstones({ nodeDots: [ZED_1], edgeDots: [] });
    const right = new FloatingTombstones({ nodeDots: [ZED_2], edgeDots: [ZED_3] });

    const joined = left.join(right);

    expect({ nodes: [...joined.nodeDots()].sort(), edges: [...joined.edgeDots()] })
      .toEqual({ nodes: [ZED_1, ZED_2], edges: [ZED_3] });
  });

  it('adds a node dot that a floating tombstone names as a tombstoned dot', async () => {
    const session = await openSession();
    const tombstones = new FloatingTombstones({ nodeDots: [ZED_1], edgeDots: [] });

    await tombstones.addNode(session, 'n1', new Dot('zed', 1));

    const state = await session.nodeElementState('n1');
    expect({ alive: await session.nodeContains('n1'), tombstoned: [...(state?.tombstonedDots ?? [])] })
      .toEqual({ alive: false, tombstoned: [ZED_1] });
  });

  it('adds a node dot that no floating tombstone names as a live dot', async () => {
    const session = await openSession();
    const tombstones = new FloatingTombstones({ nodeDots: [ZED_1], edgeDots: [ZED_2] });

    await tombstones.addNode(session, 'n1', new Dot('zed', 2));

    expect(await session.nodeContains('n1')).toBe(true);
  });

  it('adds an edge dot that a floating tombstone names as a tombstoned dot', async () => {
    const session = await openSession();
    const tombstones = new FloatingTombstones({ nodeDots: [], edgeDots: [ZED_3] });

    await tombstones.addEdge(session, EDGE, new Dot('zed', 3));

    const state = await session.edgeElementState(EDGE);
    expect({ alive: await session.edgeContains(EDGE), tombstoned: [...(state?.tombstonedDots ?? [])] })
      .toEqual({ alive: false, tombstoned: [ZED_3] });
  });

  it('adds an edge dot that no floating tombstone names as a live dot', async () => {
    const session = await openSession();
    const tombstones = new FloatingTombstones({ nodeDots: [ZED_3], edgeDots: [ZED_1] });

    await tombstones.addEdge(session, EDGE, new Dot('zed', 3));

    expect(await session.edgeContains(EDGE)).toBe(true);
  });

  it('tombstones the live session dots it names, and only those', async () => {
    const session = await openSession();
    await session.addNode('n1', new Dot('zed', 1));
    await session.addNode('n2', new Dot('zed', 2));
    await session.addEdge(EDGE, new Dot('zed', 3));
    await session.addEdge('n2\0n1\0rel', new Dot('zed', 4));

    await new FloatingTombstones({ nodeDots: [ZED_1], edgeDots: [ZED_3] }).tombstoneHeldDots(session);

    expect({
      n1: await session.nodeContains('n1'),
      n2: await session.nodeContains('n2'),
      edge: await session.edgeContains(EDGE),
      otherEdge: await session.edgeContains('n2\0n1\0rel'),
    }).toEqual({ n1: false, n2: true, edge: false, otherEdge: true });
  });

  it('leaves the session unchanged when it holds no tombstone', async () => {
    const session = await openSession();
    await session.addNode('n1', new Dot('zed', 1));
    await session.addEdge(EDGE, new Dot('zed', 3));

    await FloatingTombstones.none().tombstoneHeldDots(session);

    expect({ node: await session.nodeContains('n1'), edge: await session.edgeContains(EDGE) })
      .toEqual({ node: true, edge: true });
  });
});
