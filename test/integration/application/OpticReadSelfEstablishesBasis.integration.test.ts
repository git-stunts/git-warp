import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Runtime } from '../../../index.ts';
import { captureCoordinate, intent } from '../../../advanced.ts';
import { createTestRepo } from '../api/helpers/setup.ts';

/**
 * RED for docs/plans/optic-only-public-api.md, slice 1.
 *
 * A public optic read at the live frontier, immediately after a handful of
 * writes on a fresh lane, must return the written value. Today this fails
 * closed: `captureCoordinate(lane)` runs `prepareOpticBasis()` ->
 * `CheckpointTailBasisVerifier.verify()`, which only *verifies* a pre-existing
 * checkpoint-tail basis and throws `E_OPTIC_NO_BOUNDED_BASIS` when none has
 * been published. The bounded read path never triggers the cache-publishing
 * materialization (READINGS_AND_OPTICS.md Sec.10: "a checkpoint that never
 * fires is decoration on the one-way door"), so a fresh lane with fewer than
 * the auto-checkpoint cadence of writes can never be read in-process without
 * forking a strand or shelling out to `git warp repair`.
 *
 * GREEN (slice 2): the bounded read path establishes its own aperture-scoped
 * basis transparently through the already-shipped handle-first cold read,
 * publishes the retained materialization to the persistent cache, and returns
 * the reading. No fork, no CLI repair, no whole-state materialization.
 */
const LANE = 'events';

describe('optic read self-establishes its aperture-scoped basis', () => {
  let repository: Awaited<ReturnType<typeof createTestRepo>>;

  beforeEach(async () => {
    repository = await createTestRepo('optic-read-self-basis');
  });

  afterEach(async () => {
    await repository.cleanup();
  });

  it('reads a written property at the live frontier without a prior checkpoint', async () => {
    const runtime = await Runtime.open({ at: repository.tempDir, writer: 'agent-1' });
    try {
      const lane = await runtime.lane(LANE);

      // A handful of writes, fewer than the default { every: 64 } auto-checkpoint
      // cadence, so no checkpoint-tail basis is published by the write path.
      await lane.write([
        intent.entity.add({ subject: 'capture:first', properties: { body: 'one' } }),
        intent.entity.add({ subject: 'capture:second', properties: { body: 'two' } }),
      ]);

      // Public optic read on the live frontier. This is the operation that
      // currently fails closed with E_OPTIC_NO_BOUNDED_BASIS.
      const coordinate = await captureCoordinate(lane);
      const reading = await coordinate.optic().node('capture:first').prop('body').read();

      expect(reading.exists).toBe(true);
      expect(reading.value).toBe('one');
    } finally {
      await runtime.close();
    }
  });
});
