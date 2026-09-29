import { expect, it } from 'vitest';
import { NodeLifecycleShard } from '../../../../../src/domain/artifacts/NodeLifecycleShard.ts';
import { NodeLifecycleReceipt } from '../../../../../src/domain/artifacts/NodeLifecycleReceipt.ts';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import NodeLifecycleIndexBuilder from '../../../../../src/domain/services/index/NodeLifecycleIndexBuilder.ts';
import WarpState from '../../../../../src/domain/services/state/WarpState.ts';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';

it('captures lifecycle records and floating tombstones when the builder is created', () => {
  const state = WarpState.empty();
  const birth = new EventId(2, 'A', 'a'.repeat(40), 0);
  state.nodeBirthEvent.set('n', birth);
  const builder = NodeLifecycleIndexBuilder.fromState(state);
  state.nodeBirthEvent.set('n', new EventId(4, 'A', 'a'.repeat(40), 0));
  state.nodeClearEvent.set('n', new EventId(3, 'A', 'a'.repeat(40), 0));
  state.nodeAlive.remove(new Set([Dot.encode(new Dot('B', 1))]));
  const shards = [...builder.yieldShards()];
  const records = shards.flatMap((shard) => shard instanceof NodeLifecycleShard ? shard.records : []);
  expect(records[0]?.birth).toEqual(birth);
  expect(records[0]?.clear).toBeNull();
  const receipt = shards.find((shard) => shard instanceof NodeLifecycleReceipt);
  expect(receipt).toBeInstanceOf(NodeLifecycleReceipt);
  if (!(receipt instanceof NodeLifecycleReceipt)) throw new Error('missing receipt');
  expect(receipt.floatingTombstones).toEqual([]);
});
