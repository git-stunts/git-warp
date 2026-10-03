import { expect, it } from 'vitest';
import {
  deserializeCheckpointStateEnvelope, serializeCheckpointStateEnvelope,
  deserializeFullState,
  serializeFullState,
  type CheckpointStateEnvelopeBuffers,
} from '../../../../../src/domain/services/state/CheckpointSerializer.ts';
import { createEmptyState } from '../../../../../src/domain/services/JoinReducer.ts';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';
import LegacyEventId from '../../../../../src/domain/utils/LegacyEventId.ts';
import { LWWRegister } from '../../../../../src/domain/crdt/LWW.ts';
import codec from '../../../../../src/infrastructure/codecs/CborCodec.ts';
import { decodeWarpFullState } from '../../../../../src/infrastructure/adapters/WarpStateCborCodec.ts';
import CborFullStateLifecycleDecoder from '../../../../../src/infrastructure/adapters/CborFullStateLifecycleDecoder.ts';
import WarpError from '../../../../../src/domain/errors/WarpError.ts';

const EVENT = new EventId(7, 'A', 'aaaa', 0);
const OPTIONS = { codec, lifecycle: new CborFullStateLifecycleDecoder(codec) };

it('resumes admitted registers and floating removals from the actual checkpoint envelope', () => {
  const state = createEmptyState();
  state.nodeAlive.add('n', new Dot('A', 1));
  state.nodeAlive.remove(new Set(['B:1']));
  state.edgeAlive.add('edge', new Dot('A', 2));
  state.edgeBirthEvent.set('edge', EVENT);
  state.edgeBirthEvent.set('old-edge', new LegacyEventId(4));
  state.mutatePropRegisterLWW('n\0modern', new LWWRegister(EVENT, 'retained'));
  state.mutatePropRegisterLWW('n\0old', new LWWRegister(new LegacyEventId(7), 'old'));
  state.observedFrontier.set('A', 2);
  const buffers = serializeCheckpointStateEnvelope(state, { codec });
  const restored = deserializeCheckpointStateEnvelope(buffers, { codec });
  expect(restored.nodeAlive.elements()).toEqual(['n']);
  expect(restored.edgeAlive.elements()).toEqual(['edge']);
  expect(restored.edgeBirthEvent.get('edge')).toBeInstanceOf(EventId);
  expect(restored.edgeBirthEvent.get('old-edge')).toBeInstanceOf(LegacyEventId);
  expect(restored.getEncodedProp('n\0modern')).toBeInstanceOf(LWWRegister);
  expect(restored.getEncodedProp('n\0old')?.eventId).toBeInstanceOf(LegacyEventId);
  expect(restored.observedFrontier.get('A')).toBe(2);
  const encoded = serializeCheckpointStateEnvelope(restored, { codec });
  const fields: Array<keyof CheckpointStateEnvelopeBuffers> = ['nodeAlive', 'edgeAlive', 'prop', 'observedFrontier', 'edgeBirthEvent'];
  for (const field of fields) {
    expect(Array.from(encoded[field])).toEqual(Array.from(buffers[field]));
  }
  restored.nodeAlive.add('ghost', new Dot('B', 1));
  expect(restored.nodeAlive.contains('ghost')).toBe(false);
  restored.mutatePropLWW('n\0old', EVENT, 'new');
  expect(restored.getEncodedProp('n\0old')?.value).toBe('new');
});

it('keeps absent envelope blobs empty without manufacturing runtime identities', () => {
  const empty = new Uint8Array();
  const state = deserializeCheckpointStateEnvelope({ nodeAlive: empty, edgeAlive: empty,
    prop: empty, observedFrontier: empty, edgeBirthEvent: empty }, { codec });
  expect(state.nodeAlive.elements()).toEqual([]);
  expect(state.edgeAlive.elements()).toEqual([]);
  expect(state.propSize()).toBe(0);
  expect(state.observedFrontier.size).toBe(0);
  expect(state.edgeBirthEvent.size).toBe(0);
});

it.each([{}, [7], [['edge']], [[7, EVENT]], [['edge', null]], [['edge', 7]],
  [['edge', { ...EVENT, lamport: '7' }]], [['edge', { ...EVENT, writerId: 7 }]],
  [['edge', { ...EVENT, patchSha: 7 }]], [['edge', { ...EVENT, opIndex: '0' }]],
  [['edge', { ...EVENT, lamport: -1 }]],
])('refuses invalid current edge-birth envelope bytes: %#', wire => {
  const buffers = serializeCheckpointStateEnvelope(createEmptyState(), { codec });
  buffers.edgeBirthEvent = codec.encode(wire);
  expect(() => deserializeCheckpointStateEnvelope(buffers, { codec }))
    .toThrow(expect.objectContaining({ code: 'E_INVALID_CHECKPOINT_EDGE_BIRTH_EVENT' }));
});

it.each([7, -1])('reserves numeric edge births for valid historical checkpoints: %#', lamport => {
  const emptySet = { entries: [], tombstones: [] };
  for (const read of [decodeWarpFullState, (bytes: Uint8Array) => deserializeFullState(bytes, OPTIONS)]) {
    const bytes = codec.encode({ version: 'full-v7', nodeAlive: emptySet, edgeAlive: emptySet,
      prop: [], observedFrontier: {}, edgeBirthEvent: [['edge', lamport]],
      nodeBirthEvent: [], nodeClearEvent: [], nodePendingRemoveEvents: [], edgeRemoveEvent: [] });
    expect(() => read(bytes, codec)).toThrow(WarpError);
    const legacy = codec.encode({ version: 'full-v5', edgeBirthLamport: [['edge', lamport]] });
    if (lamport < 0) { expect(() => read(legacy, codec)).toThrow(WarpError); }
    else { expect(read(legacy, codec).edgeBirthEvent.get('edge')).toEqual(new LegacyEventId(7)); }
  }
});

it('serializes retained removal identities in deterministic node and event order', () => {
  const state = createEmptyState();
  const earlier = new EventId(6, 'B', 'bbbb', 0);
  state.nodePendingRemoveEvents.set('z', [EVENT, earlier]);
  state.nodePendingRemoveEvents.set('a', [EVENT]);
  const bytes = serializeFullState(state, { codec });
  const wire = codec.decode<{ nodePendingRemoveEvents: Array<[string, Array<{ lamport: number }>]> }>(bytes);
  expect(wire.nodePendingRemoveEvents.map(([key]) => key)).toEqual(['a', 'z']);
  expect(wire.nodePendingRemoveEvents[1]?.[1].map(event => event.lamport)).toEqual([6, 7]);
  const restored = deserializeFullState(bytes, OPTIONS);
  expect(restored.nodeClearEvent.get('a')).toEqual(EVENT);
  expect(restored.nodeClearEvent.get('z')).toEqual(EVENT);
  expect(restored.nodePendingRemoveEvents.size).toBe(0);
});

it.each([7, { eventId: EVENT, value: undefined }])('refuses invalid property values at the legacy decoder: %#', register => {
  const bytes = codec.encode({ version: 'full-v5', prop: [['n\0key', register]] });
  expect(() => deserializeFullState(bytes, OPTIONS)).toThrow(WarpError);
});
