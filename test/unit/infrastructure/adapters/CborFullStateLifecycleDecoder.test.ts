/**
 * The full-v6 lifecycle records are decoded at the infrastructure boundary.
 *
 * A full-v6 state carries each node's latest add, its clear event and its
 * pending removes, and each edge's latest remove. The adapter turns those
 * wire arrays into validated EventIds, so the domain full-state reader never
 * handles their untyped form. The full-v6 writer always emits all four
 * lists, so a missing list, or one that is not a list, is a malformed
 * checkpoint: reading it as empty would make a hidden property visible again.
 */
import { describe, expect, it } from 'vitest';
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import CborFullStateLifecycleDecoder from '../../../../src/infrastructure/adapters/CborFullStateLifecycleDecoder.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';

const BIRTH = new EventId(4, 'writer-b', 'abcdef04', 0);
const CLEAR = new EventId(3, 'writer-b', 'abcdef03', 1);
const PENDING = new EventId(7, 'writer-a', 'abcdef07', 0);
const EDGE_REMOVE = new EventId(5, 'writer-a', 'abcdef05', 2);

function wire(event: EventId): object {
  return { lamport: event.lamport, writerId: event.writerId, patchSha: event.patchSha, opIndex: event.opIndex };
}

const LIFECYCLE_FIELDS = ['nodeBirthEvent', 'nodeClearEvent', 'nodePendingRemoveEvents', 'edgeRemoveEvent'];

/** A full-v6 envelope with every lifecycle list present and empty, then the overrides. */
function complete(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    version: 'full-v6',
    nodeBirthEvent: [],
    nodeClearEvent: [],
    nodePendingRemoveEvents: [],
    edgeRemoveEvent: [],
    ...overrides,
  };
}

describe('CborFullStateLifecycleDecoder', () => {
  const decoder = new CborFullStateLifecycleDecoder(defaultCodec);

  it('decodes every lifecycle record of a full-v6 envelope into EventIds', () => {
    const lifecycle = decoder.decode(defaultCodec.encode({
      version: 'full-v6',
      nodeBirthEvent: [['n', wire(BIRTH)]],
      nodeClearEvent: [['n', wire(CLEAR)]],
      nodePendingRemoveEvents: [['n', [wire(PENDING)]]],
      edgeRemoveEvent: [['e', wire(EDGE_REMOVE)]],
    }));

    expect(lifecycle.nodeBirthEvent).toEqual(new Map([['n', BIRTH]]));
    expect(lifecycle.nodeClearEvent).toEqual(new Map([['n', CLEAR]]));
    expect(lifecycle.nodePendingRemoveEvents).toEqual(new Map([['n', [PENDING]]]));
    expect(lifecycle.edgeRemoveEvent).toEqual(new Map([['e', EDGE_REMOVE]]));
    expect(lifecycle.nodeBirthEvent.get('n')).toBeInstanceOf(EventId);
  });

  it('reads empty record lists as empty maps', () => {
    const lifecycle = decoder.decode(defaultCodec.encode(complete({})));

    expect(lifecycle.nodeBirthEvent.size).toBe(0);
    expect(lifecycle.nodeClearEvent.size).toBe(0);
    expect(lifecycle.nodePendingRemoveEvents.size).toBe(0);
    expect(lifecycle.edgeRemoveEvent.size).toBe(0);
  });

  it.each(LIFECYCLE_FIELDS)('refuses a full-v6 envelope without %s', (field) => {
    const envelope: Record<string, unknown> = complete({});
    delete envelope[field];

    expect(() => decoder.decode(defaultCodec.encode(envelope))).toThrow(
      expect.objectContaining({ code: 'E_INVALID_FULL_STATE_LIFECYCLE' }),
    );
  });

  it.each(LIFECYCLE_FIELDS)('refuses a full-v6 envelope whose %s is not a list', (field) => {
    expect(() => decoder.decode(defaultCodec.encode(complete({ [field]: { n: wire(CLEAR) } })))).toThrow(
      expect.objectContaining({ code: 'E_INVALID_FULL_STATE_LIFECYCLE' }),
    );
  });

  it('refuses a node whose pending removes are not a list', () => {
    expect(() => decoder.decode(defaultCodec.encode(complete({
      nodePendingRemoveEvents: [['n', wire(PENDING)]],
    })))).toThrow(expect.objectContaining({ code: 'E_INVALID_FULL_STATE_LIFECYCLE' }));
  });

  it('refuses a state envelope that is not a record', () => {
    expect(() => decoder.decode(defaultCodec.encode([]))).toThrow(
      expect.objectContaining({ code: 'E_INVALID_FULL_STATE_LIFECYCLE' }),
    );
  });

  it('refuses a lifecycle record that is not an event id', () => {
    expect(() => decoder.decode(defaultCodec.encode(complete({
      nodeClearEvent: [['n', 3]],
    })))).toThrow(expect.objectContaining({ code: 'E_INVALID_FULL_STATE_LIFECYCLE' }));
  });
});
