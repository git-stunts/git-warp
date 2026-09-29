import { expect, it } from 'vitest';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { LWWRegister } from '../../../../src/domain/crdt/LWW.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import StateSession from '../../../../src/domain/orset/session/StateSession.ts';
import TrieGeometry from '../../../../src/domain/orset/trie/TrieGeometry.ts';
import { ReducerSessionFrame, applyWithDiffInSession } from '../../../../src/domain/services/JoinReducerSession.ts';
import { encodePropKey } from '../../../../src/domain/services/KeyCodec.ts';
import PropSet from '../../../../src/domain/types/ops/PropSet.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import codec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import { InMemoryTrieStore } from '../../../helpers/trieHelpers.ts';

it('does not emit a hidden winning node register when an older write loses', async () => {
  const sha = 'a'.repeat(40);
  const session = await StateSession.open({
    nodeAliveRootOid: null, edgeAliveRootOid: null,
    store: new InMemoryTrieStore(), codec, geometry: TrieGeometry.default16way(),
  });
  await session.addNode('n', new Dot('A', 1));
  const frame = new ReducerSessionFrame({
    session, observedFrontier: VersionVector.empty(), edgeBirthEvent: new Map(),
    prop: new Map([[encodePropKey('n', 'color'), new LWWRegister(new EventId(2, 'A', sha, 0), 'hidden')]]),
    nodeBirthEvent: new Map([['n', new EventId(4, 'A', sha, 0)]]),
    nodeClearEvent: new Map([['n', new EventId(3, 'A', sha, 0)]]),
  });
  const diff = await applyWithDiffInSession(frame, {
    writer: 'A', lamport: 1, context: {}, ops: [new PropSet('n', 'color', 'loser')],
  }, sha);
  expect(diff.propsChanged).toEqual([]);
});
