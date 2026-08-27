import { describe, expect, it } from 'vitest';

import Intent from '../../../src/domain/api/Intent.ts';
import IntentSequence from '../../../src/domain/api/IntentSequence.ts';
import {
  applyIntentSequenceToPatch,
  intentSequenceFromPatch,
  MAX_ATOMIC_WRITE_OPERATIONS,
} from '../../../src/domain/api/IntentSequenceRuntime.ts';
import Patch from '../../../src/domain/types/Patch.ts';
import EdgeRemove from '../../../src/domain/types/ops/EdgeRemove.ts';
import NodeRemove from '../../../src/domain/types/ops/NodeRemove.ts';
import { createPatchBuilder } from './services/PatchBuilderTestHarness.ts';

describe('IntentSequenceRuntime', () => {
  it('rehydrates and deterministically replays one retained multi-edit patch', () => {
    const original = IntentSequence.from([
      Intent.addEntity({
        subject: 'capture:first',
        properties: { body: 'one', capturedAt: '2026-08-25T00:00:00.000Z' },
      }),
      Intent.addEntity({
        subject: 'capture:second',
        properties: { body: 'two', capturedAt: '2026-08-25T00:01:00.000Z' },
      }),
      Intent.addEdge({
        from: 'capture:first',
        to: 'capture:second',
        label: 'precedes',
      }),
    ]);
    const firstBuilder = createPatchBuilder({ graphName: 'captures', writerId: 'agent-1' });
    applyIntentSequenceToPatch(original, firstBuilder);
    const retained = firstBuilder.build();

    const recovered = intentSequenceFromPatch(retained);
    const replayBuilder = createPatchBuilder({ graphName: 'captures', writerId: 'agent-1' });
    applyIntentSequenceToPatch(recovered, replayBuilder);

    expect(recovered.atomic).toBe(true);
    expect(replayBuilder.build()).toEqual(retained);
  });

  it('does not invent array syntax for a canonical single-Intent retained patch', () => {
    const original = IntentSequence.from([
      Intent.addEntity({
        subject: 'capture:first',
        properties: { body: 'one' },
      }),
    ]);
    const firstBuilder = createPatchBuilder({ graphName: 'captures', writerId: 'agent-1' });
    applyIntentSequenceToPatch(original, firstBuilder);
    const retained = firstBuilder.build();

    const recovered = intentSequenceFromPatch(retained);
    const replayBuilder = createPatchBuilder({ graphName: 'captures', writerId: 'agent-1' });
    applyIntentSequenceToPatch(recovered, replayBuilder);

    expect(original.atomic).toBe(true);
    expect(recovered.atomic).toBe(false);
    expect(replayBuilder.build()).toEqual(retained);
  });

  it('replays an allocated entity at its retained subject and allocation origin', () => {
    const original = IntentSequence.from(Intent.addEntityAuto({
      namespace: 'capture',
      properties: { body: 'one' },
    }));
    const firstBuilder = createPatchBuilder({ graphName: 'captures', writerId: 'agent-1' });
    applyIntentSequenceToPatch(original, firstBuilder);
    const retained = firstBuilder.build();

    const recovered = intentSequenceFromPatch(retained);
    const replayBuilder = createPatchBuilder({ graphName: 'captures', writerId: 'agent-1' });
    applyIntentSequenceToPatch(recovered, replayBuilder);

    expect(replayBuilder.build()).toEqual(retained);
    expect(replayBuilder.build().entityAdmissions?.[0]?.origin).toMatchObject({
      kind: 'allocated',
      namespace: 'capture',
    });
  });

  it('keeps a classified manual node-property array primitive', () => {
    const original = IntentSequence.from([
      Intent.addNode({ subject: 'capture:manual' }),
      Intent.setProperty({
        subject: 'capture:manual',
        key: 'body',
        value: 'not an entity admission',
      }),
    ]);
    const firstBuilder = createPatchBuilder({ graphName: 'captures', writerId: 'agent-1' });
    applyIntentSequenceToPatch(original, firstBuilder);
    const retained = firstBuilder.build();

    const recovered = intentSequenceFromPatch(retained);
    const replayBuilder = createPatchBuilder({ graphName: 'captures', writerId: 'agent-1' });
    applyIntentSequenceToPatch(recovered, replayBuilder);

    expect(retained.entityAdmissions).toEqual([]);
    expect(recovered.kinds).toEqual(['node.add', 'property.set']);
    expect(replayBuilder.build()).toEqual(retained);
  });

  it('rehydrates a marked cascading node removal as one Intent', () => {
    const retained = new Patch({
      writer: 'agent-1',
      lamport: 1,
      context: {},
      ops: [
        new EdgeRemove({
          from: 'capture:first',
          to: 'capture:second',
          label: 'precedes',
          observedDots: ['agent-1:2'],
        }),
        new NodeRemove('capture:first', ['agent-1:1']),
      ],
      entityAdmissions: [],
    });

    const recovered = intentSequenceFromPatch(retained);

    expect(recovered.atomic).toBe(false);
    expect(recovered.kinds).toEqual(['node.remove']);
  });

  it('rejects a sequence whose lowering exceeds the operation limit', () => {
    const properties = Object.fromEntries(
      Array.from({ length: MAX_ATOMIC_WRITE_OPERATIONS }, (_, index) => [
        `field-${String(index).padStart(5, '0')}`,
        'value',
      ]),
    );
    const sequence = IntentSequence.from([
      Intent.addEntity({ subject: 'capture:oversized', properties }),
    ]);
    const builder = createPatchBuilder({ graphName: 'captures', writerId: 'agent-1' });

    expect(() => applyIntentSequenceToPatch(sequence, builder)).toThrowError(
      expect.objectContaining({ code: 'E_INTENT_SEQUENCE_OPERATIONS' }),
    );
  });

  it('rejects a retained patch with no operations', () => {
    const empty = new Patch({
      writer: 'agent-1',
      lamport: 1,
      context: {},
      ops: [],
    });

    expect(() => intentSequenceFromPatch(empty)).toThrowError(
      expect.objectContaining({ code: 'E_DRAFT_INTENT_HYDRATION' }),
    );
  });
});
