import type CodecValue from '../../../../src/domain/types/codec/CodecValue.ts';
/**
 * Both full-state readers refuse a full-v7 state whose lifecycle lists are
 * missing or malformed.
 *
 * The full-v7 writer emits all four lifecycle lists, empty or not, so a
 * missing list, or one that is not a list, is a malformed state: reading it
 * as empty would make a hidden property visible again. The non-canonical
 * reader refuses with E_INVALID_FULL_STATE_LIFECYCLE, the code the
 * checkpoint lifecycle adapter uses; the canonical reader refuses because
 * the state does not re-encode to the same bytes. full-v5 carries no
 * lifecycle lists and still decodes with empty lifecycle maps.
 */
import { describe, expect, it } from 'vitest';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import WarpState from '../../../../src/domain/services/state/WarpState.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import {
  decodeCanonicalWarpFullState,
  decodeWarpFullState,
  encodeWarpFullState,
} from '../../../../src/infrastructure/adapters/WarpStateCborCodec.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';

const OLDER = new EventId(1, 'writer-a', 'a1b2c3d4', 0);
const NEWER = new EventId(2, 'writer-b', 'b1c2d3e4', 1);

const LIFECYCLE_FIELDS = ['nodeBirthEvent', 'nodeClearEvent', 'nodePendingRemoveEvents', 'edgeRemoveEvent'];

const LIFECYCLE_REFUSAL = expect.objectContaining({ code: 'E_INVALID_FULL_STATE_LIFECYCLE' });

/** node:a was removed and added again; node:b has two removes and no add yet. */
function lifecycleState(): WarpState {
  const state = WarpState.empty();
  state.nodeAlive.add('node:a', new Dot('writer-a', 1));
  state.nodeBirthEvent.set('node:a', NEWER);
  state.nodeClearEvent.set('node:a', OLDER);
  state.nodePendingRemoveEvents.set('node:b', [OLDER, NEWER]);
  state.edgeRemoveEvent.set('node:a\0node:a\0self', NEWER);
  return state;
}

/** The fields of a real full-v7 state, as its writer emitted them. */
function currentFields(): { [key: string]: CodecValue } {
  const fields = defaultCodec.decode(encodeWarpFullState(lifecycleState(), defaultCodec));
  if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) {
    throw new Error('Expected full-state record fixture');
  }
  return Object.fromEntries(Object.entries(fields));
}

function withoutField(field: string): Uint8Array {
  const fields = currentFields();
  delete fields[field];
  return defaultCodec.encode(fields);
}

describe('full-v7 lifecycle lists in the full-state readers', () => {
  it('decodes a complete full-v7 state through the non-canonical reader', () => {
    const decoded = decodeWarpFullState(defaultCodec.encode(currentFields()), defaultCodec);

    expect(decoded.nodeBirthEvent).toEqual(new Map([['node:a', NEWER]]));
    expect(decoded.nodePendingRemoveEvents).toEqual(new Map());
    expect(decoded.nodeClearEvent.get('node:b')).toEqual(NEWER);
  });

  it.each(LIFECYCLE_FIELDS)('refuses a full-v7 state without %s', (field) => {
    expect(() => decodeWarpFullState(withoutField(field), defaultCodec)).toThrow(LIFECYCLE_REFUSAL);
  });

  it.each(LIFECYCLE_FIELDS)('refuses a full-v7 state whose %s is not a list', (field) => {
    const bytes = defaultCodec.encode({ ...currentFields(), [field]: { n: 1 } });

    expect(() => decodeWarpFullState(bytes, defaultCodec)).toThrow(LIFECYCLE_REFUSAL);
  });

  it('refuses a full-v7 state with a node whose pending removes are not a list', () => {
    const bytes = defaultCodec.encode({
      ...currentFields(),
      nodePendingRemoveEvents: [['node:b', { lamport: 1, writerId: 'writer-a', patchSha: 'a1b2c3d4', opIndex: 0 }]],
    });

    expect(() => decodeWarpFullState(bytes, defaultCodec)).toThrow(LIFECYCLE_REFUSAL);
  });

  it('still decodes a full-v5 state, which carries no lifecycle lists, with empty lifecycle maps', () => {
    const fields = currentFields();
    for (const field of LIFECYCLE_FIELDS) {
      delete fields[field];
    }
    const decoded = decodeWarpFullState(defaultCodec.encode({ ...fields, version: 'full-v5' }), defaultCodec);

    expect(decoded.nodeAlive.elements()).toEqual(['node:a']);
    expect(decoded.nodeBirthEvent).toEqual(new Map());
    expect(decoded.nodeClearEvent).toEqual(new Map());
    expect(decoded.nodePendingRemoveEvents).toEqual(new Map());
    expect(decoded.edgeRemoveEvent).toEqual(new Map());
  });

  it.each(LIFECYCLE_FIELDS)('the canonical reader refuses a full-v7 state without %s', (field) => {
    expect(() => decodeCanonicalWarpFullState(withoutField(field), defaultCodec)).toThrow(
      expect.objectContaining({ code: 'E_FULL_STATE_INVALID' }),
    );
  });
});
