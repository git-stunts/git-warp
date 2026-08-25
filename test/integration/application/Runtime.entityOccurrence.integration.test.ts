import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Runtime, type EntityOccurrence } from '../../../index.ts';
import { intent } from '../../../advanced.ts';
import { receiptEnvelope } from '../../../bin/presenters/V19ReadingReceipt.ts';
import { createTestRepo } from '../api/helpers/setup.ts';

const LANE = 'think';
const CAPTURED_AT = '2026-08-03T20:00:00.000Z';

describe('Runtime entity occurrence receipts', () => {
  let repository: Awaited<ReturnType<typeof createTestRepo>>;

  beforeEach(async () => {
    repository = await createTestRepo('runtime-entity-occurrence');
  });

  afterEach(async () => {
    await repository.cleanup();
  });

  it('allocates distinct subjects and occurrence ids despite identical application time', async () => {
    const runtime = await Runtime.open({ at: repository.tempDir, writer: 'writer-a' });
    try {
      const lane = await runtime.lane(LANE);
      const firstReceipt = await lane.write(capture());
      const first = requireOccurrence(firstReceipt);
      const second = requireOccurrence(await lane.write(capture()));

      expect(first.subject).toMatch(/^entry:[0-9a-f]+$/);
      expect(second.subject).toMatch(/^entry:[0-9a-f]+$/);
      expect(second.subject).not.toBe(first.subject);
      expect(second.id).not.toBe(first.id);
      expect(second.relationTo(first)).toBe('after');
      expect(first.relationTo(second)).toBe('before');
      expect(second.compare(first)).toBeGreaterThan(0);
      const envelope = receiptEnvelope(firstReceipt);
      expect(envelope).toMatchObject({
        operation: 'write',
        occurrence: { id: first.id, subject: first.subject },
      });
      expect(envelope).not.toHaveProperty('occurrences');
    } finally {
      await runtime.close();
    }
  });

  it('keeps concurrent occurrences incomparable but deterministically ordered', async () => {
    const a = await Runtime.open({ at: repository.tempDir, writer: 'writer-a' });
    const b = await Runtime.open({ at: repository.tempDir, writer: 'writer-b' });
    try {
      const laneA = await a.lane(LANE);
      const laneB = await b.lane(LANE);
      const [left, right] = await Promise.all([laneA.write(capture()), laneB.write(capture())]);
      const occurrenceA = requireOccurrence(left);
      const occurrenceB = requireOccurrence(right);

      expect(occurrenceA.relationTo(occurrenceB)).toBe('concurrent');
      expect(occurrenceB.relationTo(occurrenceA)).toBe('concurrent');
      expect(Math.sign(occurrenceA.compare(occurrenceB))).toBe(
        -Math.sign(occurrenceB.compare(occurrenceA))
      );
      expect(occurrenceA.compare(occurrenceB)).not.toBe(0);
    } finally {
      await b.close();
      await a.close();
    }
  });

  it('scopes colliding writer dots to their independent worldlines', async () => {
    const runtime = await Runtime.open({ at: repository.tempDir, writer: 'writer-a' });
    try {
      const leftLane = await runtime.lane('left');
      const rightLane = await runtime.lane('right');
      const left = requireOccurrence(await leftLane.write(capture()));
      const right = requireOccurrence(await rightLane.write(capture()));

      expect(left.subject).toBe(right.subject);
      expect(left.id).not.toBe(right.id);
      expect(left.relationTo(right)).toBe('concurrent');
      expect(right.relationTo(left)).toBe('concurrent');
      expect(left.compare(right)).not.toBe(0);
    } finally {
      await runtime.close();
    }
  });

  it('returns a new occurrence for every supplied-subject admission', async () => {
    const runtime = await Runtime.open({ at: repository.tempDir, writer: 'writer-a' });
    try {
      const lane = await runtime.lane(LANE);
      const supplied = intent.entity.add({
        subject: 'entry:semantic-subject',
        properties: { kind: 'capture', capturedAt: CAPTURED_AT },
      });
      const first = requireOccurrence(await lane.write(supplied));
      const second = requireOccurrence(await lane.write(supplied));

      expect(first.subject).toBe('entry:semantic-subject');
      expect(second.subject).toBe(first.subject);
      expect(second.id).not.toBe(first.id);
      expect(second.relationTo(first)).toBe('after');
    } finally {
      await runtime.close();
    }
  });

  it('settles the auto-allocated strand subject without reminting it', async () => {
    let runtime: Runtime | null = await Runtime.open({
      at: repository.tempDir,
      writer: 'writer-a',
    });
    try {
      const parent = await runtime.lane(LANE);
      const strand = await runtime.fork(parent, { name: 'candidate' });
      const occurrence = requireOccurrence(await strand.write(capture()));

      const preview = await runtime.previewSettlement({ source: strand, target: parent });
      await expect(runtime.settle(preview.plan)).resolves.toMatchObject({
        outcome: { kind: 'derived' },
      });
      await runtime.close();
      runtime = null;

      const graph = await repository.openGraph(LANE, 'writer-a');
      const state = await graph.materialize();
      expect(state.nodeAlive.contains(occurrence.subject)).toBe(true);
    } finally {
      if (runtime !== null) {
        await runtime.close();
      }
    }
  });
});

function capture() {
  return intent.entity.addAuto({
    namespace: 'entry',
    properties: { kind: 'capture', capturedAt: CAPTURED_AT },
  });
}

function requireOccurrence(receipt: {
  readonly occurrence: EntityOccurrence | undefined;
}): EntityOccurrence {
  if (receipt.occurrence === undefined) {
    throw new Error('entity write receipt must carry an occurrence');
  }
  return receipt.occurrence;
}
