/**
 * One policy for a property key that cannot be read.
 *
 * `\x01` marks a key as edge-owned and `decodeEdgePropKey` then demands
 * exactly four `\0`-separated fields. Nothing validated that shape on the way
 * in, and the read paths disagreed on what to do about it: the node branch
 * resolved an unreadable key to no owner and hid the row, while every edge
 * branch threw and took the whole read with it.
 *
 * The policy is: refuse such a key where it can still be refused, and skip it
 * where it cannot.
 */

import { describe, it, expect } from 'vitest';
import WarpState from '../../../../../src/domain/services/state/WarpState.ts';
import { reconstructStateFromCheckpoint } from '../../../../../src/domain/services/state/checkpointLoad.ts';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';
import WarpError from '../../../../../src/domain/errors/WarpError.ts';
import {
  EDGE_PROP_PREFIX,
  encodeEdgeKey,
  encodeEdgePropKey,
} from '../../../../../src/domain/services/KeyCodec.ts';

/** An edge-prefixed key with five fields where the codec demands four. */
const MALFORMED = `${EDGE_PROP_PREFIX}a\0b\0c\0d\0e`;

function stateWithMalformedKey(): WarpState {
  const state = WarpState.empty();
  const edgeKey = encodeEdgeKey('file:a.ts', 'ast:root', 'contains_ast');
  state.nodeAlive.add('file:a.ts', Dot.create('A', 1));
  state.nodeAlive.add('ast:root', Dot.create('A', 2));
  state.edgeAlive.add(edgeKey, Dot.create('A', 3));
  // One readable edge property alongside the unreadable one.
  state.mutatePropLWW(
    encodeEdgePropKey('file:a.ts', 'ast:root', 'contains_ast', 'weight'),
    new EventId(1, 'A', 'abcdef01', 1),
    'readable',
  );
  state.mutatePropLWW(MALFORMED, new EventId(1, 'A', 'abcdef01', 2), 'unreadable');
  return state;
}

describe('reads skip a property key they cannot decode', () => {
  it('attachmentRecords yields the readable rows instead of throwing', () => {
    const state = stateWithMalformedKey();
    const records = state.attachmentRecords();
    expect(records.map((r) => r.key.toString())).toContain('weight');
    expect(records.map((r) => r.key.toString())).not.toContain('unreadable');
  });

  it('edgeProperties yields the readable rows instead of throwing', () => {
    const state = stateWithMalformedKey();
    const keys = [...state.edgeProperties()].map((e) => e.key);
    expect(keys).toEqual(['weight']);
  });

  it('edgePropertiesFromMap skips it too', () => {
    const state = stateWithMalformedKey();
    const map = new Map([...state.allPropEntries()]);
    const keys = [...WarpState.edgePropertiesFromMap(map)].map((e) => e.key);
    expect(keys).toEqual(['weight']);
  });

  it('edgePropertiesFromState skips it too', () => {
    const state = stateWithMalformedKey();
    const keys = [...WarpState.edgePropertiesFromState(state)].map((e) => e.key);
    expect(keys).toEqual(['weight']);
  });

  it('keeps the unreadable register in state rather than dropping it', () => {
    // Skipping is a read decision, not a deletion. Only GC removes registers.
    const state = stateWithMalformedKey();
    void state.attachmentRecords();
    expect(state.hasProp(MALFORMED)).toBe(true);
  });
});

describe('checkpoint load refuses a property owner it could never have written', () => {
  const base = {
    nodes: ['file:a.ts'],
    edges: [] as Array<{ from: string; to: string; label: string }>,
  };

  it('rejects a props[].node carrying the edge-property prefix', () => {
    // projectState fills props[].node from node properties only, so this
    // shape cannot come from a checkpoint this library wrote.
    expect(() => reconstructStateFromCheckpoint({
      ...base,
      props: [{ node: `${EDGE_PROP_PREFIX}file:a.ts\0ast:root\0contains_ast`, key: 'weight', value: 1 }],
    })).toThrow(WarpError);
  });

  it('names the offending owner in the refusal', () => {
    try {
      reconstructStateFromCheckpoint({
        ...base,
        props: [{ node: `${EDGE_PROP_PREFIX}bad`, key: 'weight', value: 1 }],
      });
      expect.unreachable('checkpoint load should have refused');
    } catch (error) {
      expect(error).toBeInstanceOf(WarpError);
      expect((error as WarpError).code).toBe('E_CHECKPOINT_INVALID_PROP_OWNER');
    }
  });

  it('accepts ordinary node-owned properties', () => {
    const state = reconstructStateFromCheckpoint({
      ...base,
      props: [{ node: 'file:a.ts', key: 'path', value: 'a.ts' }],
    });
    expect(state.getNodeProp('file:a.ts', 'path')?.value).toBe('a.ts');
  });
});
