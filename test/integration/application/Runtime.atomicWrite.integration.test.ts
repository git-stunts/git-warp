import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Runtime } from '../../../index.ts';
import { intent } from '../../../advanced.ts';
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

      // @ts-expect-error RED: v19 lost the public atomic-array overload.
      const receipt = await lane.write(intents);

      expect(receipt.outcome.kind).toBe('derived');
      expect(await repository.persistence.countNodes(WRITER_REF)).toBe(1);
      // @ts-expect-error RED: compound receipts do not expose plural births yet.
      expect(receipt.occurrences.map(({ subject }) => subject)).toEqual([
        'capture:first',
        'capture:second',
      ]);
    } finally {
      await runtime.close();
    }

    const graph = await repository.openGraph(LANE, 'verifier');
    const state = await graph.materialize();
    expect(state.nodeAlive.contains('capture:first')).toBe(true);
    expect(state.nodeAlive.contains('capture:second')).toBe(true);
    expect(state.edgeAlive.contains('capture:first\0capture:second\0precedes')).toBe(true);
  });
});
