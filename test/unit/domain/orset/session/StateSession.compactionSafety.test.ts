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
  const removed = new Dot('A', 1);
  const concurrent = new Dot('B', 1);
  const observed = new Set([Dot.encode(removed)]);
  for (let index = 0; index < 12; index++) {
    const name = `owner:${String(index)}`;
    await session.addNode(name, removed);
    await session.addEdge(name, removed);
    await session.removeNode(name, observed);
    await session.removeEdge(name, observed);
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
    await session.addNode(name, removed);
    await session.addEdge(name, removed);
    expect(await session.nodeContains(name)).toBe(false);
    expect(await session.edgeContains(name)).toBe(false);
    expect((await session.nodeElementState(name))?.tombstonedDots).toEqual(observed);
    expect((await session.edgeElementState(name))?.tombstonedDots).toEqual(observed);
    await session.addNode(name, concurrent);
    await session.addEdge(name, concurrent);
    expect(await session.nodeDots(name)).toEqual(new Set([Dot.encode(concurrent)]));
    expect(await session.edgeDots(name)).toEqual(new Set([Dot.encode(concurrent)]));
  }
  await session.compact(APPLIED);
  expect((await GCMetrics.fromSession(session)).totalLiveDots).toBe(24);
  await session.close();
});
