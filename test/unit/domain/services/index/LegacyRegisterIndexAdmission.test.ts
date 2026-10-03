import { describe, expect, it } from 'vitest';
import { NodeLifecycleShard } from '../../../../../src/domain/artifacts/NodeLifecycleShard.ts';
import NodeLifecycleIndexBuilder from '../../../../../src/domain/services/index/NodeLifecycleIndexBuilder.ts';
import { decodeNodeLifecycleReceipt, decodeNodeLifecycleShard, nodeLifecycleShardPath } from '../../../../../src/domain/services/index/NodeLifecycleShardReader.ts';
import { deserializeFullState } from '../../../../../src/domain/services/state/CheckpointSerializer.ts';
import CheckpointTailFactReducer from '../../../../../src/domain/services/optic/CheckpointTailFactReducer.ts';
import LegacyEventId from '../../../../../src/domain/utils/LegacyEventId.ts';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';
import WarpState from '../../../../../src/domain/services/state/WarpState.ts';
import type CodecValue from '../../../../../src/domain/types/codec/CodecValue.ts';
import Patch from '../../../../../src/domain/types/Patch.ts';
import PropSet from '../../../../../src/domain/types/ops/PropSet.ts';
import CborFullStateLifecycleDecoder from '../../../../../src/infrastructure/adapters/CborFullStateLifecycleDecoder.ts';
import { decodeWarpFullState } from '../../../../../src/infrastructure/adapters/WarpStateCborCodec.ts';
import { nodeLifecycleShardPayload } from '../../../../../src/infrastructure/adapters/NodeLifecycleShardPayload.ts';
import codec from '../../../../../src/infrastructure/codecs/CborCodec.ts';

const OPTIONS = { codec, lifecycle: new CborFullStateLifecycleDecoder(codec) };
const LEGACY_WIRE = [0, '', '0000', 0];

describe.each([
  { name: 'CBOR adapter', read: (bytes: Uint8Array) => decodeWarpFullState(bytes, codec) },
  { name: 'legacy checkpoint boundary', read: (bytes: Uint8Array) => deserializeFullState(bytes, OPTIONS) },
])('$name legacy materialization', ({ read }) => {
  it('preserves missing metadata through real index capture, shard encoding, bounded read and replay', () => {
    const state = read(codec.encode({ version: 'full-v5',
      nodeAlive: { entries: [['n', ['A:1']]], tombstones: [] },
      edgeAlive: { entries: [], tombstones: [] }, prop: [['n\0key', { value: 'retained' }]],
      observedFrontier: { A: 1 }, edgeBirthEvent: [] }));
    const builder = NodeLifecycleIndexBuilder.fromState(state);
    const shards = [...builder.yieldShards()];
    const shard = shards.find(value => value instanceof NodeLifecycleShard);
    expect(shard).toBeInstanceOf(NodeLifecycleShard);
    if (!(shard instanceof NodeLifecycleShard)) { throw new Error('missing lifecycle shard'); }
    const bytes = codec.encode(nodeLifecycleShardPayload(shard));
    const record = decodeNodeLifecycleShard(codec.decode<CodecValue>(bytes), nodeLifecycleShardPath('n')).get('n');
    const event = record?.registerEvent('key');
    expect(event).toBeInstanceOf(LegacyEventId);
    expect(event).toEqual({ lamport: 0, writerId: '', patchSha: '0000', opIndex: 0 });
    if (!(event instanceof LegacyEventId)) { throw new Error('missing legacy register identity'); }
    const value = new CheckpointTailFactReducer({ graphName: 'events' }).reduceProperty({
      nodeId: 'n', propertyKey: 'key', baseValue: 'retained', tailEntries: [],
      checkpointLifecycle: { kind: 'witnessed', lifecycle: {}, baseRegisterEvent: event,
        baseAlive: true, floatingTombstones: new Set() },
    });
    expect(value).toBe('retained');
    state.mutatePropLWW('n\0key', new EventId(1, 'A', 'aaaa', 0), 'modern');
    expect(state.getEncodedProp('n\0key')?.value).toBe('modern');
    expect(new CheckpointTailFactReducer({ graphName: 'events' }).reduceProperty({
      nodeId: 'n', propertyKey: 'key', baseValue: 'retained',
      tailEntries: [{ sha: 'aaaa', patch: new Patch({ schema: 3, writer: 'A', lamport: 1,
        context: {}, ops: [new PropSet('n', 'key', 'modern')] }) }],
      checkpointLifecycle: { kind: 'witnessed', lifecycle: {}, baseRegisterEvent: event,
        baseAlive: true, floatingTombstones: new Set() },
    })).toBe(state.getEncodedProp('n\0key')?.value);
  });
});

it.each<CodecValue>([7, [0, '', '0000'], [-1, '', '0000', 0], ['0', '', '0000', 0],
  [0, 'A', 'aaaa', 0], [1, 'A', '', 0]])('refuses malformed register identity %j', event => {
  const bytes = codec.encode({ schemaVersion: 2, entries: [['n', [null, null, [], [['key', event]]]]] });
  expect(() => decodeNodeLifecycleShard(codec.decode<CodecValue>(bytes), nodeLifecycleShardPath('n')))
    .toThrow(expect.objectContaining({ code: 'E_INDEX_SHARD_MALFORMED' }));
});

it('admits validated modern snapshot records without accepting historical node births', () => {
  const state = WarpState.empty();
  state.nodeBirthEvent.set('n', { lamport: 1, writerId: 'A', patchSha: 'aaaa', opIndex: 0 });
  const shards = [...NodeLifecycleIndexBuilder.fromState(state).yieldShards()];
  const shard = shards.find(value => value instanceof NodeLifecycleShard);
  expect(shard).toBeInstanceOf(NodeLifecycleShard);
  if (!(shard instanceof NodeLifecycleShard)) { throw new Error('missing lifecycle shard'); }
  expect(shard.records[0]?.birth).toBeInstanceOf(EventId);
  state.nodeBirthEvent.set('n', new LegacyEventId(0));
  expect(() => NodeLifecycleIndexBuilder.fromState(state))
    .toThrow(expect.objectContaining({ code: 'E_PATCH_MALFORMED' }));
});

it('refuses unsupported receipt versions and invalid transport prototypes', () => {
  const receipt = { schemaVersion: 3, nodeCount: 0, shardCount: 0, floatingTombstones: [] };
  expect(() => decodeNodeLifecycleReceipt(receipt, []))
    .toThrow(expect.objectContaining({ code: 'E_INDEX_SHARD_MALFORMED' }));
  const envelope = { schemaVersion: 2, entries: [] };
  Object.setPrototypeOf(envelope, { inherited: true });
  expect(() => decodeNodeLifecycleShard(envelope, nodeLifecycleShardPath('n')))
    .toThrow(expect.objectContaining({ code: 'E_INDEX_SHARD_MALFORMED' }));
  Object.setPrototypeOf(envelope, null);
  expect(decodeNodeLifecycleShard(envelope, nodeLifecycleShardPath('n')).size).toBe(0);
  for (const payload of [null, 7, [], { schemaVersion: 2, nodeCount: 0, shardCount: 0,
    floatingTombstones: [], extra: true }]) {
    expect(() => decodeNodeLifecycleReceipt(payload, []))
      .toThrow(expect.objectContaining({ code: 'E_INDEX_SHARD_MALFORMED' }));
  }
});

it.each(['birth', 'clear'])('keeps %s lifecycle identities strict even when register metadata is historical', field => {
  const fields = field === 'birth' ? [LEGACY_WIRE, null, [], [['key', LEGACY_WIRE]]]
    : [null, LEGACY_WIRE, [], [['key', LEGACY_WIRE]]];
  const bytes = codec.encode({ schemaVersion: 2, entries: [['n', fields]] });
  expect(() => decodeNodeLifecycleShard(codec.decode<CodecValue>(bytes), nodeLifecycleShardPath('n')))
    .toThrow(expect.objectContaining({ code: 'E_INDEX_SHARD_MALFORMED' }));
});
