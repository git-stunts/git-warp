import { describe, expect, it } from 'vitest';

import Intent from '../../../src/domain/api/Intent.ts';
import IntentSequence from '../../../src/domain/api/IntentSequence.ts';
import {
  applyIntentSequenceToPatch,
  intentSequenceFromPatch,
  MAX_ATOMIC_WRITE_OPERATIONS,
} from '../../../src/domain/api/IntentSequenceRuntime.ts';
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
});
