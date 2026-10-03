import { describe, expect, it } from 'vitest';
import { LWWRegister } from '../../../../src/domain/crdt/LWW.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';
import { decodeWarpFullState, encodeWarpFullState } from '../../../../src/infrastructure/adapters/WarpStateCborCodec.ts';
import { deserializeFullState } from '../../../../src/domain/services/state/CheckpointSerializer.ts';
import CborFullStateLifecycleDecoder from '../../../../src/infrastructure/adapters/CborFullStateLifecycleDecoder.ts';
import codec from '../../../../src/infrastructure/codecs/CborCodec.ts';

const READ = { codec, lifecycle: new CborFullStateLifecycleDecoder(codec) };
const EVENT = new EventId(3, 'A', 'aaaa', 0);
const INVALID = [
  { lamport: -1, writerId: 'A', patchSha: 'aaaa', opIndex: 0 },
  { lamport: 1, writerId: '', patchSha: 'aaaa', opIndex: 0 },
  { lamport: 1, writerId: 'A', patchSha: 'invalid', opIndex: 0 },
  { lamport: 1, writerId: 'A', patchSha: 'aaaa', opIndex: -1 },
];

const READERS = [
  { name: 'CBOR adapter', read: (bytes: Uint8Array) => decodeWarpFullState(bytes, codec) },
  { name: 'legacy checkpoint boundary', read: (bytes: Uint8Array) => deserializeFullState(bytes, READ) },
];

describe.each(READERS)('$name', ({ read }) => {
it.each(['full-v5', 'full-v7'])('hydrates real runtime identities from valid %s checkpoint bytes', version => {
  const bytes = checkpoint(version, EVENT);
  const state = read(bytes);
    const register = state.getEncodedProp('n\0key');
    expect(register).toBeInstanceOf(LWWRegister);
    expect(register?.eventId).toBeInstanceOf(EventId);
    expect(register?.value).toBe('retained');
});

it.each(INVALID)('refuses malformed explicit metadata through both production readers: %#', eventId => {
  for (const version of ['full-v5', 'full-v7']) {
    const bytes = checkpoint(version, eventId);
    expect(() => read(bytes)).toThrow(WarpError);
  }
});

it('preserves legacy absent-metadata ordering through upgrade and replay', () => {
  const legacy = read(checkpoint('full-v5', null));
  const register = legacy.getEncodedProp('n\0key');
  expect(register).toBeInstanceOf(LWWRegister);
  expect(register?.eventId).toEqual({ lamport: 0, writerId: '', patchSha: '0000', opIndex: 0 });
  const upgraded = encodeWarpFullState(legacy, codec);
  for (const restored of [read(upgraded)]) {
    expect(restored.getEncodedProp('n\0key')?.eventId).toEqual(register?.eventId);
    restored.mutatePropLWW('n\0key', EVENT, 'modern');
    expect(restored.getEncodedProp('n\0key')?.value).toBe('modern');
  }
});

it('rejects missing modern metadata rather than silently inventing legacy identity', () => {
  const bytes = checkpoint('full-v7', null);
  expect(() => read(bytes)).toThrow(WarpError);
});

});

function checkpoint(version: string, eventId: EventId | null): Uint8Array {
  const emptySet = { entries: [], tombstones: [] };
  return codec.encode({
    version, nodeAlive: emptySet, edgeAlive: emptySet,
    prop: [['n\0key', { eventId, value: 'retained' }]],
    observedFrontier: {}, edgeBirthEvent: [],
    nodeBirthEvent: [], nodeClearEvent: [], nodePendingRemoveEvents: [], edgeRemoveEvent: [],
  });
}
