/**
 * The domain full-state reader does not decode full-v7 lifecycle records
 * itself. It takes them from an injected decoder, and without one it refuses
 * a full-v7 state rather than read it with its lifecycle records missing.
 */
import { describe, expect, it } from 'vitest';
import { Dot, encodeDot } from '../../../../../src/domain/crdt/Dot.ts';
import { applyPatchOp, createEmptyState } from '../../../../../src/domain/services/JoinReducer.ts';
import {
  deserializeFullState,
  serializeFullState,
} from '../../../../../src/domain/services/state/CheckpointSerializer.ts';
import NodeAdd from '../../../../../src/domain/types/ops/NodeAdd.ts';
import NodeRemove from '../../../../../src/domain/types/ops/NodeRemove.ts';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';
import CborFullStateLifecycleDecoder from '../../../../../src/infrastructure/adapters/CborFullStateLifecycleDecoder.ts';
import defaultCodec from '../../../../../src/infrastructure/codecs/CborCodec.ts';

function removedAndReadded() {
  const state = createEmptyState();
  applyPatchOp(state, new NodeAdd('n', Dot.create('A', 1)), new EventId(1, 'A', 'abcdef01', 0));
  applyPatchOp(state, new NodeRemove('n', [encodeDot(Dot.create('A', 1))]), new EventId(2, 'A', 'abcdef02', 0));
  applyPatchOp(state, new NodeAdd('n', Dot.create('B', 1)), new EventId(3, 'B', 'abcdef03', 0));
  return state;
}

describe('deserializeFullState lifecycle decoding', () => {
  it('takes full-v7 lifecycle records from the injected decoder', () => {
    const state = removedAndReadded();
    const restored = deserializeFullState(serializeFullState(state, { codec: defaultCodec }), {
      codec: defaultCodec,
      lifecycle: new CborFullStateLifecycleDecoder(defaultCodec),
    });

    expect(restored.nodeBirthEvent).toEqual(state.nodeBirthEvent);
    expect(restored.nodeClearEvent).toEqual(state.nodeClearEvent);
    expect(restored.nodePendingRemoveEvents).toEqual(state.nodePendingRemoveEvents);
    expect(restored.edgeRemoveEvent).toEqual(state.edgeRemoveEvent);
  });

  it('refuses a full-v7 state whose node clear events are missing', () => {
    const envelope = defaultCodec.decode<Record<string, object>>(
      serializeFullState(removedAndReadded(), { codec: defaultCodec }),
    );
    delete envelope['nodeClearEvent'];

    expect(() => deserializeFullState(defaultCodec.encode(envelope), {
      codec: defaultCodec,
      lifecycle: new CborFullStateLifecycleDecoder(defaultCodec),
    })).toThrow(expect.objectContaining({ code: 'E_INVALID_FULL_STATE_LIFECYCLE' }));
  });

  it('still decodes a full-v5 state, which carries no lifecycle records', () => {
    const state = removedAndReadded();
    const { nodeAlive, edgeAlive, prop, observedFrontier, edgeBirthEvent } = defaultCodec.decode<Record<string, object>>(
      serializeFullState(state, { codec: defaultCodec }),
    );
    const fullV5 = defaultCodec.encode({ version: 'full-v5', nodeAlive, edgeAlive, prop, observedFrontier, edgeBirthEvent });
    const restored = deserializeFullState(fullV5, {
      codec: defaultCodec,
      lifecycle: new CborFullStateLifecycleDecoder(defaultCodec),
    });

    expect(restored.nodeAlive.elements()).toEqual(['n']);
    expect(restored.nodeBirthEvent).toEqual(new Map());
    expect(restored.nodeClearEvent).toEqual(new Map());
    expect(restored.nodePendingRemoveEvents).toEqual(new Map());
    expect(restored.edgeRemoveEvent).toEqual(new Map());
  });

  it('refuses a full-v7 state without a lifecycle decoder', () => {
    const bytes = serializeFullState(removedAndReadded(), { codec: defaultCodec });

    expect(() => deserializeFullState(bytes, { codec: defaultCodec })).toThrow(
      expect.objectContaining({ code: 'E_FULL_STATE_LIFECYCLE_DECODER_REQUIRED' }),
    );
  });
});
