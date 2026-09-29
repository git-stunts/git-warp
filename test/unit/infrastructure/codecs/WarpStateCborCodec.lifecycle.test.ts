import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { serializeORSet } from '../../../../src/domain/services/state/ORSetWireBoundary.ts';
import WarpState from '../../../../src/domain/services/state/WarpState.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import {
  decodeCanonicalWarpFullState,
  decodeWarpFullState,
  encodeWarpFullState,
} from '../../../../src/infrastructure/adapters/WarpStateCborCodec.ts';
import {
  deserializeFullState,
  serializeFullState,
} from '../../../../src/domain/services/state/CheckpointSerializer.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import CborFullStateLifecycleDecoder from '../../../../src/infrastructure/adapters/CborFullStateLifecycleDecoder.ts';

const OLDER = new EventId(1, 'writer-a', 'a1b2c3d4', 0);
const NEWER = new EventId(2, 'writer-b', 'b1c2d3e4', 1);

/** A state with live and removed nodes and edges and one register. */
function baseState(): WarpState {
  const state = WarpState.empty();
  state.nodeAlive.add('node:a', new Dot('writer-a', 1));
  state.edgeAlive.add('node:a\0node:a\0self', new Dot('writer-a', 2));
  state.mutatePropLWW('node:a\0name', OLDER, 'alpha');
  state.edgeBirthEvent.set('node:a\0node:a\0self', OLDER);
  state.observedFrontier = VersionVector.from({ 'writer-a': 2 });
  return state;
}

/**
 * The full-v5 envelope, field for field, as the v5 encoder wrote it. Its
 * sha256 was pinned against that encoder before full-v6 existed.
 */
function fullV5Bytes(): Uint8Array {
  const state = baseState();
  return defaultCodec.encode({
    version: 'full-v5',
    nodeAlive: serializeORSet(state.nodeAlive),
    edgeAlive: serializeORSet(state.edgeAlive),
    prop: [['node:a\0name', { eventId: { lamport: 1, opIndex: 0, patchSha: 'a1b2c3d4', writerId: 'writer-a' }, value: 'alpha' }]],
    observedFrontier: { 'writer-a': 2 },
    edgeBirthEvent: [['node:a\0node:a\0self', { lamport: 1, writerId: 'writer-a', patchSha: 'a1b2c3d4', opIndex: 0 }]],
  });
}

const FULL_V5_SHA256 = '872bd28e8917dbcade134801e1b54e6f39cc9f5ec849f7255d729ef6d046a77a';

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** node:a was removed and added again; node:b has two removes and no add yet. */
function lifecycleState(): WarpState {
  const state = baseState();
  state.nodeBirthEvent.set('node:a', NEWER);
  state.nodeClearEvent.set('node:a', OLDER);
  state.nodePendingRemoveEvents.set('node:b', [OLDER, NEWER]);
  state.edgeRemoveEvent.set('node:a\0node:a\0self', NEWER);
  return state;
}

describe('full state format across the node lifecycle bump', () => {
  it('uses bytes identical to what the full-v5 encoder wrote', () => {
    expect(sha256(fullV5Bytes())).toBe(FULL_V5_SHA256);
  });

  it('decodes a canonical full-v5 state with empty node and remove maps', () => {
    const decoded = decodeCanonicalWarpFullState(fullV5Bytes(), defaultCodec);

    expect(decoded.nodeAlive.elements()).toEqual(['node:a']);
    expect(decoded.getEncodedProp('node:a\0name')?.value).toBe('alpha');
    expect(decoded.edgeBirthEvent.get('node:a\0node:a\0self')).toEqual(OLDER);
    expect(decoded.nodeBirthEvent).toEqual(new Map());
    expect(decoded.nodeClearEvent).toEqual(new Map());
    expect(decoded.nodePendingRemoveEvents).toEqual(new Map());
    expect(decoded.edgeRemoveEvent).toEqual(new Map());
  });

  it('decodes a full-v5 checkpoint through both full-state readers', () => {
    const viaCodec = decodeWarpFullState(fullV5Bytes(), defaultCodec);
    const viaCheckpoint = deserializeFullState(fullV5Bytes(), { codec: defaultCodec });

    for (const decoded of [viaCodec, viaCheckpoint]) {
      expect(decoded.getEncodedProp('node:a\0name')?.value).toBe('alpha');
      expect(decoded.nodeBirthEvent).toEqual(new Map());
      expect(decoded.edgeRemoveEvent).toEqual(new Map());
    }
  });

  it('round-trips full-v6 byte for byte with every lifecycle map', () => {
    const encoded = encodeWarpFullState(lifecycleState(), defaultCodec);
    const decoded = decodeCanonicalWarpFullState(encoded, defaultCodec);

    expect([...encodeWarpFullState(decoded, defaultCodec)]).toEqual([...encoded]);
    expect(defaultCodec.decode<{ version: string }>(encoded).version).toBe('full-v6');
    expect(decoded.nodeBirthEvent).toEqual(new Map([['node:a', NEWER]]));
    expect(decoded.nodeClearEvent).toEqual(new Map([['node:a', OLDER]]));
    expect(decoded.nodePendingRemoveEvents).toEqual(new Map([['node:b', [OLDER, NEWER]]]));
    expect(decoded.edgeRemoveEvent).toEqual(new Map([['node:a\0node:a\0self', NEWER]]));
  });

  it('refuses a full-v6 envelope whose pending remove sorts below the node birth', () => {
    const state = lifecycleState();
    state.nodePendingRemoveEvents.set('node:a', [OLDER]);
    const inconsistent = encodeWarpFullState(state, defaultCodec);

    expect(() => decodeCanonicalWarpFullState(inconsistent, defaultCodec)).toThrow(
      'Full state payload is not canonical',
    );
  });

  it('writes the checkpoint serializer format as the same full-v6 bytes', () => {
    const state = lifecycleState();
    const bytes = serializeFullState(state, { codec: defaultCodec });
    const decoded = deserializeFullState(bytes, {
      codec: defaultCodec,
      lifecycle: new CborFullStateLifecycleDecoder(defaultCodec),
    });

    expect([...bytes]).toEqual([...encodeWarpFullState(state, defaultCodec)]);
    expect([...serializeFullState(decoded, { codec: defaultCodec })]).toEqual([...bytes]);
  });

  it('refuses a full-v5 envelope that carries full-v6 fields', () => {
    const mixed = defaultCodec.encode({
      ...defaultCodec.decode<object>(encodeWarpFullState(lifecycleState(), defaultCodec)),
      version: 'full-v5',
    });

    expect(() => decodeCanonicalWarpFullState(mixed, defaultCodec)).toThrow(
      'Full state payload is not canonical',
    );
  });
});
