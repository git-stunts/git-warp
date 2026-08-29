import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Runtime } from '../../../index.ts';
import { intent } from '../../../advanced.ts';
import { createTestRepo } from '../api/helpers/setup.ts';

/**
 * RED for docs/plans/optic-only-public-api.md, slice 2.
 *
 * The optic is the sole public read handle: `lane.optic()` reads at the live
 * frontier. Immediately after a handful of writes on a fresh lane, an optic
 * read must return the written value.
 *
 * Today it fails closed: the live optic's read verifies a pre-existing
 * checkpoint-tail basis (CheckpointTailBasisVerifier) and throws
 * `E_OPTIC_NO_BOUNDED_BASIS` when none has been published; the bounded read
 * path never establishes one (READINGS_AND_OPTICS.md Sec.10 — "a checkpoint
 * that never fires is decoration on the one-way door").
 *
 * GREEN: the live optic read self-establishes its aperture-scoped basis
 * through the handle-first cold materialization and returns the reading. No
 * captureCoordinate, no fork, no CLI repair, no whole-state materialization.
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

      // The optic is the read handle; a bare lane.optic() reads at the live
      // frontier. This is the operation that currently fails closed.
      const reading = await lane.optic().node('capture:first').prop('body').read();

      expect(reading.exists).toBe(true);
      expect(reading.value).toBe('one');
    } finally {
      await runtime.close();
    }
  });
});
