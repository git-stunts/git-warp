import { describe, expect, it } from 'vitest';
import codec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import { decodeWarpFullState, decodeCanonicalWarpFullState } from '../../../../src/infrastructure/codecs/WarpStateCborCodec.ts';

const fields = ['nodeBirthEvent', 'nodeClearEvent', 'edgeRemoveEvent', 'nodePendingRemoveEvents'];
const invalidEvents = [null, 3, {}, { lamport: 0, writerId: 'A', patchSha: 'abcd', opIndex: 0 }];

describe.each(fields)('full-state lifecycle entries: %s', (field) => {
  it.each(invalidEvents)('rejects malformed event %# through both readers', (event) => {
    const payload = codec.encode({
      version: 'full-v6', nodeAlive: {}, edgeAlive: {}, prop: [], observedFrontier: {}, edgeBirthEvent: [],
      nodeBirthEvent: [], nodeClearEvent: [], edgeRemoveEvent: [], nodePendingRemoveEvents: [],
      [field]: [['n', field === 'nodePendingRemoveEvents' ? [event] : event]],
    });
    expect(() => decodeWarpFullState(payload, codec)).toThrow(
      expect.objectContaining({ code: 'E_INVALID_FULL_STATE_LIFECYCLE' }),
    );
    expect(() => decodeCanonicalWarpFullState(payload, codec)).toThrow(
      expect.objectContaining({ code: 'E_FULL_STATE_INVALID' }),
    );
  });
});
