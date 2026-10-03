import { describe, expect, it, vi } from 'vitest';
import { decodeWarpFullState } from '../../../../src/infrastructure/adapters/WarpStateCborCodec.ts';
import { deserializeFullState } from '../../../../src/domain/services/state/CheckpointSerializer.ts';
import { readCheckpointEventId } from '../../../../src/domain/services/state/CheckpointEventIdBoundary.ts';
import CborFullStateLifecycleDecoder from '../../../../src/infrastructure/adapters/CborFullStateLifecycleDecoder.ts';
import LegacyEventId from '../../../../src/domain/utils/LegacyEventId.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';
import codec from '../../../../src/infrastructure/codecs/CborCodec.ts';

const OPTIONS = { codec, lifecycle: new CborFullStateLifecycleDecoder(codec) };
type Metadata = Date | RegExp | Uint8Array | Set<number> | { lamport?: number } | number | string | readonly number[] | null;
type IdentitySlot = 'property' | 'edge-birth';

describe.each([
  { name: 'CBOR adapter', read: (bytes: Uint8Array) => decodeWarpFullState(bytes, codec) },
  { name: 'named checkpoint boundary', read: (bytes: Uint8Array) => deserializeFullState(bytes, OPTIONS) },
])('$name raw identity admission', ({ read }) => {
  describe.each<IdentitySlot>(['property', 'edge-birth'])('%s slot', slot => {
    it.each([new Date(0), /metadata/u, new Uint8Array([7]), new Set([7])])(
      'refuses native non-record metadata before field stripping: %#', eventId => {
        for (const version of ['full-v5', 'full-v7']) {
          expect(() => read(checkpoint(version, eventId, slot))).toThrow(WarpError);
        }
      });
  });

  it.each([7, 'metadata', []])('refuses non-record property metadata: %#', eventId => {
    expect(() => read(checkpoint('full-v5', eventId, 'property'))).toThrow(WarpError);
  });

  it.each<IdentitySlot>(['property', 'edge-birth'])('preserves plain and null-prototype historical %s records', slot => {
    const nullPrototype = { lamport: 7 };
    Object.setPrototypeOf(nullPrototype, null);
    for (const eventId of [{}, nullPrototype]) {
      const state = read(checkpoint('full-v5', eventId, slot));
      const restored = slot === 'property' ? state.getEncodedProp('n\0key')?.eventId : state.edgeBirthEvent.get('n\0m\0link');
      expect(restored).toBeInstanceOf(LegacyEventId);
      expect(restored?.lamport).toBe(eventId === nullPrototype ? 7 : 0);
    }
  });
});

it('admits a genuine null-prototype identity at the named boundary', () => {
  const wire = { lamport: 7 };
  Object.setPrototypeOf(wire, null);
  expect(readCheckpointEventId(wire, 'full-v5')).toBeInstanceOf(LegacyEventId);
});

it('retains the CBOR adapter refusal for a null edge-birth payload', () => {
  expect(() => decodeWarpFullState(checkpoint('full-v5', null, 'edge-birth'), codec)).toThrow(WarpError);
});

it('admits a codec-produced null-prototype record before adapter field parsing', () => {
  const eventId = { lamport: 7 };
  Object.setPrototypeOf(eventId, null);
  const payload = { version: 'full-v5', prop: [['n\0key', { eventId, value: 'kept' }]] };
  const bytes = codec.encode(payload);
  const decode = vi.spyOn(codec, 'decode').mockReturnValue(payload);
  try {
    const restored = decodeWarpFullState(bytes, codec).getEncodedProp('n\0key');
    expect(restored?.eventId).toBeInstanceOf(LegacyEventId);
    expect(restored?.eventId.lamport).toBe(7);
    expect(restored?.value).toBe('kept');
  } finally {
    decode.mockRestore();
  }
});

function checkpoint(version: string, eventId: Metadata, slot: IdentitySlot): Uint8Array {
  const empty = { entries: [], tombstones: [] };
  return codec.encode({ version, nodeAlive: empty, edgeAlive: empty,
    prop: slot === 'property' ? [['n\0key', { eventId, value: 'kept' }]] : [],
    edgeBirthEvent: slot === 'edge-birth' ? [['n\0m\0link', eventId]] : [],
    observedFrontier: {}, nodeBirthEvent: [], nodeClearEvent: [], nodePendingRemoveEvents: [], edgeRemoveEvent: [] });
}
