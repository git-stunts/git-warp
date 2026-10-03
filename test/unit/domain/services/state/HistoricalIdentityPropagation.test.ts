import { describe, expect, it } from 'vitest';
import ContentAttachmentProjection from '../../../../../src/domain/services/ContentAttachmentProjection.ts';
import { CONTENT_PROPERTY_KEY, CONTENT_MIME_PROPERTY_KEY, CONTENT_SIZE_PROPERTY_KEY, encodePropKey } from '../../../../../src/domain/services/KeyCodec.ts';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import WarpState from '../../../../../src/domain/services/state/WarpState.ts';
import { predatesLifecycle } from '../../../../../src/domain/services/state/ElementLifecycle.ts';
import { createSnapshotWarpState } from '../../../../../src/domain/services/ImmutableSnapshot.ts';
import { copyStateLifecycle, joinStateLifecycles } from '../../../../../src/domain/services/state/StateLifecycle.ts';
import { scopeMaterializedState } from '../../../../../src/domain/services/VisibleStateScope.ts';
import { decodeWarpFullState, encodeWarpFullState } from '../../../../../src/infrastructure/adapters/WarpStateCborCodec.ts';
import { deserializeFullState, serializeFullState } from '../../../../../src/domain/services/state/CheckpointSerializer.ts';
import CborFullStateLifecycleDecoder from '../../../../../src/infrastructure/adapters/CborFullStateLifecycleDecoder.ts';
import LegacyEventId from '../../../../../src/domain/utils/LegacyEventId.ts';
import { EventId, compareEventIds, isGreater } from '../../../../../src/domain/utils/EventId.ts';
import codec from '../../../../../src/infrastructure/codecs/CborCodec.ts';

const EDGE = 'n\0m\0link';
const OPTIONS = { codec, lifecycle: new CborFullStateLifecycleDecoder(codec) };

describe.each([
  { name: 'CBOR adapter', read: (bytes: Uint8Array) => decodeWarpFullState(bytes, codec) },
  { name: 'named boundary', read: (bytes: Uint8Array) => deserializeFullState(bytes, OPTIONS) },
])('$name historical identity propagation', ({ read }) => {
  it('preserves actual legacy identities through copy, join, snapshot, scope and current encoding', () => {
    const state = read(codec.encode({ version: 'full-v5',
      nodeAlive: { entries: [['n', ['A:1']], ['m', ['A:2']]], tombstones: [] },
      edgeAlive: { entries: [[EDGE, ['A:3']]], tombstones: [] }, observedFrontier: { A: 3 },
      prop: [['n\0key', { eventId: { lamport: 7 }, value: 'historical' }]], edgeBirthEvent: [[EDGE, 7]] }));
    const event = state.edgeBirthEvent.get(EDGE);
    expect(event).toBeInstanceOf(LegacyEventId);
    expect(state.clone().edgeBirthEvent.get(EDGE)).toBe(event);
    expect(copyStateLifecycle(state).edgeBirthEvent.get(EDGE)).toBe(event);
    expect(joinStateLifecycles(state, {}).edgeBirthEvent.get(EDGE)).toBe(event);
    expect(joinStateLifecycles({}, state).edgeBirthEvent.get(EDGE)).toBe(event);
    expect(createSnapshotWarpState(state).edgeBirthEvent.get(EDGE)).toBe(event);
    expect(scopeMaterializedState(state, { nodeIdPrefixes: { include: ['n', 'm'] } })
      .edgeBirthEvent.get(EDGE)).toBe(event);
    for (const encoded of [encodeWarpFullState(state, codec), serializeFullState(state, OPTIONS)]) {
      const restored = read(encoded);
      expect(restored.edgeBirthEvent.get(EDGE)).toBeInstanceOf(LegacyEventId);
      expect(restored.edgeBirthEvent.get(EDGE)?.lamport).toBe(7);
      expect(restored.getEncodedProp('n\0key')?.eventId).toBeInstanceOf(LegacyEventId);
      restored.mutatePropLWW('n\0key', new EventId(7, 'A', 'aaaa', 0), 'modern');
      expect(restored.getEncodedProp('n\0key')?.value).toBe('modern');
    }
  });
});

it('compares historical and modern identities without altering modern constructor admission', () => {
  const old = new LegacyEventId(7);
  const modern = new EventId(7, 'A', 'aaaa', 0);
  expect(compareEventIds(old, modern)).toBeLessThan(0);
  expect(isGreater(modern, old)).toBe(true);
  expect(() => new EventId(old.lamport, old.writerId, old.patchSha, old.opIndex)).toThrow();
});

it('accepts omitted historical lifecycle maps and absent registers without inventing identities', () => {
  expect(copyStateLifecycle({}).edgeBirthEvent.size).toBe(0);
  expect(predatesLifecycle(null, new LegacyEventId(1), undefined)).toBe(false);
  expect(predatesLifecycle(undefined, undefined, undefined)).toBe(false);
});

it('projects attachment metadata using actual historical register lineage', () => {
  const state = WarpState.empty();
  state.nodeAlive.add('n', new Dot('A', 1));
  const old = new LegacyEventId(7);
  state.mutatePropLWW(encodePropKey('n', CONTENT_PROPERTY_KEY), old, 'beef');
  state.mutatePropLWW(encodePropKey('n', CONTENT_MIME_PROPERTY_KEY), new LegacyEventId(7), 'text/plain');
  state.mutatePropLWW(encodePropKey('n', CONTENT_SIZE_PROPERTY_KEY), new LegacyEventId(6), 42);
  const attachment = ContentAttachmentProjection.forNode(state, 'n');
  expect(attachment?.payload.mime?.toString()).toBe('text/plain');
  expect(attachment?.payload.size).toBeNull();
});
