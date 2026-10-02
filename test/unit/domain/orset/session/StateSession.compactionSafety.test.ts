import { expect, it } from 'vitest';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../../src/domain/crdt/VersionVector.ts';
import StateSession from '../../../../../src/domain/orset/session/StateSession.ts';
import TrieGeometry from '../../../../../src/domain/orset/trie/TrieGeometry.ts';
import executeGCInSession from '../../../../../src/domain/services/executeGCInSession.ts';
import GCMetrics from '../../../../../src/domain/services/GCMetrics.ts';
import codec from '../../../../../src/infrastructure/codecs/CborCodec.ts';
import { InMemoryTrieStore } from '../../../../helpers/trieHelpers.ts';

const GEOMETRY = new TrieGeometry({ fanout: 16, nibbleBits: 4, leafCapacity: 3, leafFloor: 2 });
const APPLIED = VersionVector.from({ A: 100, B: 100 });

it('retains removed node/edge evidence across trie branches, compaction, GC and repeated close/reopen before stale replay', async () => {
  const store = new InMemoryTrieStore();
  let session = await StateSession.open({
    store, codec, geometry: GEOMETRY, nodeAliveRootOid: null, edgeAliveRootOid: null,
  });
  for (let index = 0; index < 12; index++) {
    const name = `owner:${String(index)}`;
    const nodeDot = new Dot('A', index * 2 + 1);
    const edgeDot = new Dot('A', index * 2 + 2);
    await session.addNode(name, nodeDot);
    await session.addEdge(name, edgeDot);
    await session.removeNode(name, new Set([Dot.encode(nodeDot)]));
    await session.removeEdge(name, new Set([Dot.encode(edgeDot)]));
  }
  const before = await GCMetrics.fromSession(session);
  for (let round = 0; round < 2; round++) {
    await session.compact(APPLIED);
    expect((await executeGCInSession(session, APPLIED)).tombstonesRemoved).toBe(0);
    expect(await GCMetrics.fromSession(session)).toEqual(before);
    const roots = await session.close();
    session = await StateSession.open({
      store, codec, geometry: GEOMETRY,
      nodeAliveRootOid: roots.nodeAliveRootOid,
      edgeAliveRootOid: roots.edgeAliveRootOid,
    });
  }
  for (let index = 0; index < 12; index++) {
    const name = `owner:${String(index)}`;
    const nodeDot = new Dot('A', index * 2 + 1);
    const edgeDot = new Dot('A', index * 2 + 2);
    const concurrentNode = new Dot('B', index * 2 + 1);
    const concurrentEdge = new Dot('B', index * 2 + 2);
    await session.addNode(name, nodeDot);
    await session.addEdge(name, edgeDot);
    expect(await session.nodeContains(name)).toBe(false);
    expect(await session.edgeContains(name)).toBe(false);
    expect((await session.nodeElementState(name))?.tombstonedDots).toEqual(new Set([Dot.encode(nodeDot)]));
    expect((await session.edgeElementState(name))?.tombstonedDots).toEqual(new Set([Dot.encode(edgeDot)]));
    await session.addNode(name, concurrentNode);
    await session.addEdge(name, concurrentEdge);
    expect(await session.nodeDots(name)).toEqual(new Set([Dot.encode(concurrentNode)]));
    expect(await session.edgeDots(name)).toEqual(new Set([Dot.encode(concurrentEdge)]));
  }
  await session.compact(APPLIED);
  expect((await GCMetrics.fromSession(session)).totalLiveDots).toBe(24);
  await session.close();
});
