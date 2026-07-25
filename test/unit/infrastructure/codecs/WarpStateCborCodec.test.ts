import { describe, expect, it } from 'vitest';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import WarpState from '../../../../src/domain/services/state/WarpState.ts';
import type { EventId } from '../../../../src/domain/utils/EventId.ts';
import {
  decodeCanonicalWarpFullState,
  decodeWarpFullState,
  encodeWarpFullState,
} from '../../../../src/infrastructure/codecs/WarpStateCborCodec.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';

describe('WarpStateCborCodec', () => {
  it('round-trips canonical full state with deterministic properties and births', () => {
    const state = WarpState.empty();
    const older = eventId(1, 'writer-a', 'patch-a', 0);
    const newer = eventId(2, 'writer-b', 'patch-b', 1);
    state.nodeAlive.add('node:b', new Dot('writer-b', 2));
    state.nodeAlive.add('node:a', new Dot('writer-a', 1));
    state.edgeAlive.add('edge:b', new Dot('writer-b', 3));
    state.mutatePropLWW('prop:b', newer, 'newer');
    state.mutatePropLWW('prop:a', older, 'older');
    state.edgeBirthEvent.set('edge:b', newer);
    state.edgeBirthEvent.set('edge:a', older);

    const encoded = encodeWarpFullState(state, defaultCodec);
    const decoded = decodeCanonicalWarpFullState(encoded, defaultCodec);

    expect([...encodeWarpFullState(decoded, defaultCodec)]).toEqual([...encoded]);
    expect(decoded.nodeAlive.elements()).toEqual(['node:a', 'node:b']);
    expect(decoded.edgeAlive.elements()).toEqual(['edge:b']);
    expect(decoded.getEncodedProp('prop:a')).toEqual({
      eventId: older,
      value: 'older',
    });
    expect(decoded.edgeBirthEvent).toEqual(new Map([
      ['edge:a', older],
      ['edge:b', newer],
    ]));
  });

  it('decodes empty and legacy envelopes without inventing modern evidence', () => {
    const empty = decodeWarpFullState(
      null as unknown as Uint8Array,
      defaultCodec,
    );
    const legacy = decodeWarpFullState(defaultCodec.encode({
      prop: [
        ['drop', null],
        ['fallback', { eventId: null, value: 'legacy' }],
        ['coerce', {
          eventId: {
            lamport: 'invalid',
            writerId: 7,
            patchSha: null,
            opIndex: false,
          },
          value: 5,
        }],
      ],
      edgeBirthLamport: [['edge:legacy', 7]],
    }), defaultCodec);
    const partialBirth = decodeWarpFullState(defaultCodec.encode({
      version: 'full-v5',
      edgeBirthEvent: [['edge:partial', {}]],
    }), defaultCodec);
    const malformedCollections = decodeWarpFullState(defaultCodec.encode({
      version: 'full-v5',
      prop: {},
      edgeBirthEvent: {},
    }), defaultCodec);

    expect(empty.nodeAlive.elements()).toEqual([]);
    expect(legacy.hasProp('drop')).toBe(false);
    expect(legacy.getEncodedProp('fallback')?.eventId).toEqual({
      lamport: 0,
      writerId: '',
      patchSha: '0000',
      opIndex: 0,
    });
    expect(legacy.getEncodedProp('coerce')?.eventId).toEqual({
      lamport: 0,
      writerId: '',
      patchSha: '0000',
      opIndex: 0,
    });
    expect(legacy.edgeBirthEvent.get('edge:legacy')).toEqual({
      lamport: 7,
      writerId: '',
      patchSha: '0000',
      opIndex: 0,
    });
    expect(partialBirth.edgeBirthEvent.get('edge:partial')).toEqual({
      lamport: 0,
      writerId: '',
      patchSha: '0000',
      opIndex: 0,
    });
    expect(malformedCollections.propSize()).toBe(0);
    expect(malformedCollections.edgeBirthEvent.size).toBe(0);
  });

  it('rejects unsupported versions and non-canonical full-state bytes', () => {
    const unsupported = defaultCodec.encode({ version: 'full-v4' });
    const wrongShape = defaultCodec.encode([]);
    const extraField = defaultCodec.encode({
      version: 'full-v5',
      nodeAlive: {},
      edgeAlive: {},
      prop: [],
      observedFrontier: {},
      edgeBirthEvent: [],
      ignored: true,
    });

    expect(() => decodeWarpFullState(unsupported, defaultCodec)).toThrow(
      "Unsupported full state version: expected 'full-v5'",
    );
    expect(() => decodeCanonicalWarpFullState(wrongShape, defaultCodec)).toThrow(
      'Full state payload is not canonical',
    );
    expect(() => decodeCanonicalWarpFullState(extraField, defaultCodec)).toThrow(
      'Full state payload is not canonical',
    );
  });
});

function eventId(
  lamport: number,
  writerId: string,
  patchSha: string,
  opIndex: number,
): EventId {
  return { lamport, writerId, patchSha, opIndex };
}
