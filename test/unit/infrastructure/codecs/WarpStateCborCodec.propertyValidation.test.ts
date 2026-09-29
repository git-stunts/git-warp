import { expect, it } from 'vitest';
import codec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import { decodeWarpFullState } from '../../../../src/infrastructure/codecs/WarpStateCborCodec.ts';

it('rejects a full-state register with a missing property value', () => {
  const bytes = codec.encode({ version: 'full-v5', prop: [['n\0key', { eventId: null }]] });
  expect(() => decodeWarpFullState(bytes, codec)).toThrow(
    expect.objectContaining({ code: 'E_FULL_STATE_INVALID' }),
  );
});
