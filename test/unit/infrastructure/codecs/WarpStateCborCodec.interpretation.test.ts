import { expect, it } from 'vitest';
import { decodeWarpFullState, encodeWarpFullState } from '../../../../src/infrastructure/adapters/WarpStateCborCodec.ts';
import codec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import WarpState from '../../../../src/domain/services/state/WarpState.ts';
import { deserializeFullState } from '../../../../src/domain/services/state/CheckpointSerializer.ts';

it('refuses the intermediate full-v6 interpretation instead of treating it as current state', () => {
  const bytes = codec.encode({ ...codec.decode<object>(encodeWarpFullState(WarpState.empty(), codec)), version: 'full-v6' });
  expect(() => decodeWarpFullState(bytes, codec)).toThrow(expect.objectContaining({ code: 'E_UNSUPPORTED_VERSION' }));
  expect(() => deserializeFullState(bytes, { codec })).toThrow(/Unsupported full state version/u);
});
