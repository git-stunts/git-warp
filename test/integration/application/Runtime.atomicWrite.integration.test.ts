import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Runtime } from '../../../index.ts';
import { intent } from '../../../advanced.ts';
import { receiptEnvelope } from '../../../bin/presenters/V19ReadingReceipt.ts';
import { createTestRepo } from '../api/helpers/setup.ts';

const LANE = 'events';
const WRITER_REF = 'refs/warp/events/writers/agent-1';

describe('Runtime atomic intent-array writes', () => {
  let repository: Awaited<ReturnType<typeof createTestRepo>>;

  beforeEach(async () => {
    repository = await createTestRepo('runtime-atomic-write');
  });

  afterEach(async () => {
    await repository.cleanup();
  });

  it('publishes several ordered graph edits as one patch and one receipt', async () => {
    const runtime = await Runtime.open({ at: repository.tempDir, writer: 'agent-1' });
    try {
      const lane = await runtime.lane(LANE);
      const intents = [
        intent.entity.add({
          subject: 'capture:first',
          properties: { body: 'one' },
        }),
        intent.entity.add({
          subject: 'capture:second',
          properties: { body: 'two' },
        }),
        intent.edge.add({
          from: 'capture:first',
          to: 'capture:second',
          label: 'precedes',
        }),
      ] as const;

      const receipt = await lane.write(intents);

      expect(receipt.outcome.kind).toBe('derived');
      expect(await repository.persistence.countNodes(WRITER_REF)).toBe(1);
      expect(receipt.occurrence).toBeUndefined();
      expect(receipt.intents).toEqual(intents);
      expect(Object.isFrozen(receipt.intent)).toBe(true);
      expect(Object.isFrozen(receipt.occurrences)).toBe(true);
      expect(receipt.occurrences.map(({ subject }) => subject)).toEqual([
        'capture:first',
        'capture:second',
      ]);
      expect(receiptEnvelope(receipt)).toMatchObject({
        intents: intents.map(({ descriptor }) => descriptor),
        occurrence: null,
        occurrences: [
          { subject: 'capture:first' },
          { subject: 'capture:second' },
        ],
      });
    } finally {
      await runtime.close();
    }

    const graph = await repository.openGraph(LANE, 'verifier');
    const state = await graph.materialize();
    expect(state.nodeAlive.contains('capture:first')).toBe(true);
    expect(state.nodeAlive.contains('capture:second')).toBe(true);
    expect(state.edgeAlive.contains('capture:first\0capture:second\0precedes')).toBe(true);
  });

  it('keeps a one-member atomic array distinct in its receipt envelope', async () => {
    const runtime = await Runtime.open({ at: repository.tempDir, writer: 'agent-1' });
    try {
      const lane = await runtime.lane(LANE);
      const requested = intent.node.add({ subject: 'capture:first' });

      const receipt = await lane.write([requested]);
      const envelope = receiptEnvelope(receipt);

      expect(envelope).toMatchObject({ intents: [requested.descriptor] });
      expect(envelope).not.toHaveProperty('intent');
      expect(await repository.persistence.countNodes(WRITER_REF)).toBe(1);
    } finally {
      await runtime.close();
    }
  });

  it('publishes none of an array when a later Intent cannot lower', async () => {
    const runtime = await Runtime.open({ at: repository.tempDir, writer: 'agent-1' });
    try {
      const lane = await runtime.lane(LANE);

      const receipt = await lane.write([
        intent.node.add({ subject: 'capture:would-have-existed' }),
        intent.node.remove({ subject: 'capture:missing' }),
      ]);

      expect(receipt.outcome.kind).toBe('obstruction');
      expect(receipt.reason).toBe('git-warp.write.missing-bounded-basis');
      expect(await repository.persistence.readRef(WRITER_REF)).toBeNull();
    } finally {
      await runtime.close();
    }

    const graph = await repository.openGraph(LANE, 'verifier');
    const state = await graph.materialize();
    expect(state.nodeAlive.contains('capture:would-have-existed')).toBe(false);
  });

  it('retains one array patch across Strand reopen and settlement', async () => {
    let runtime: Runtime | null = await Runtime.open({
      at: repository.tempDir,
      writer: 'agent-1',
    });
    try {
      const parent = await runtime.lane(LANE);
      const strand = await runtime.fork(parent, { name: 'candidate' });
      const receipt = await strand.write([
        intent.entity.add({
          subject: 'capture:first',
          properties: { body: 'one' },
        }),
        intent.entity.add({
          subject: 'capture:second',
          properties: { body: 'two' },
        }),
        intent.edge.add({
          from: 'capture:first',
          to: 'capture:second',
          label: 'precedes',
        }),
      ]);
      expect(receipt.occurrences).toHaveLength(2);
      await runtime.close();
      runtime = await Runtime.open({ at: repository.tempDir, writer: 'agent-1' });

      const reopenedParent = await runtime.lane(LANE);
      const reopenedStrand = await runtime.strand(reopenedParent, { name: 'candidate' });
      const preview = await runtime.previewSettlement({
        source: reopenedStrand,
        target: reopenedParent,
      });
      const settlement = await runtime.settle(preview.plan);

      expect(settlement.outcome.kind).toBe('derived');
      expect(await repository.persistence.countNodes(WRITER_REF)).toBe(1);
    } finally {
      if (runtime !== null) {
        await runtime.close();
      }
    }

    const graph = await repository.openGraph(LANE, 'verifier');
    const state = await graph.materialize();
    expect(state.nodeAlive.contains('capture:first')).toBe(true);
    expect(state.nodeAlive.contains('capture:second')).toBe(true);
    expect(state.edgeAlive.contains('capture:first\0capture:second\0precedes')).toBe(true);
  });
});
