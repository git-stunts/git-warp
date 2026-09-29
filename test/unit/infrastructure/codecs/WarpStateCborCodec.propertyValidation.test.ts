import CborFullStateLifecycleDecoder from '../../../../src/infrastructure/adapters/CborFullStateLifecycleDecoder.ts';
import { expect, it, vi } from 'vitest';
import codec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import { decodeWarpFullState, decodeCanonicalWarpFullState } from '../../../../src/infrastructure/adapters/WarpStateCborCodec.ts';

it('rejects a full-state register with a missing property value', () => {
  const bytes = codec.encode({ version: 'full-v5', prop: [['n\0key', { eventId: null }]] });
  expect(() => decodeWarpFullState(bytes, codec)).toThrow(
    expect.objectContaining({ code: 'E_FULL_STATE_INVALID' }),
  );
});

it.each([42, { prop: [[42, { value: 1 }]] }])('rejects an invalid envelope or property key: %#', (payload) => {
  expect(() => decodeWarpFullState(codec.encode(payload), codec)).toThrow(
    expect.objectContaining({ code: 'E_FULL_STATE_INVALID' }),
  );
});

it.each([null, undefined])('retains empty-envelope compatibility: %#', (payload) => {
  expect(decodeWarpFullState(codec.encode(payload), codec).propSize()).toBe(0);
});

it('retains legacy property registers without event metadata', () => {
  const bytes = codec.encode({ prop: [['n\0key', { value: 3 }]] });
  expect(decodeWarpFullState(bytes, codec).getEncodedProp('n\0key')?.value).toBe(3);
});

it('rejects malformed edge-birth entry keys', () => {
  const bytes = codec.encode({ edgeBirthEvent: [[42, {}]] });
  expect(() => decodeWarpFullState(bytes, codec)).toThrow(
    expect.objectContaining({ code: 'E_FULL_STATE_INVALID' }),
  );
});

it('rejects an unsupported canonical version', () => {
  expect(() => decodeCanonicalWarpFullState(codec.encode({ version: 'full-v4' }), codec)).toThrow(
    expect.objectContaining({ code: 'E_FULL_STATE_INVALID' }),
  );
});

it('does not hide unexpected lifecycle decoder failures', () => {
  const failure = new Error('decoder unavailable');
  const decoder = vi.spyOn(CborFullStateLifecycleDecoder.prototype, 'decode').mockImplementation(() => { throw failure; });
  try {
    expect(() => decodeCanonicalWarpFullState(codec.encode({ version: 'full-v6' }), codec)).toThrow(failure);
  } finally {
    decoder.mockRestore();
  }
});
