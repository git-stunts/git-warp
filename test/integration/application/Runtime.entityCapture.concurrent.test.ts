import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Runtime } from '../../../index.ts';
import Intent from '../../../src/domain/api/Intent.ts';
import type WarpState from '../../../src/domain/services/state/WarpState.ts';
import type { PropValue } from '../../../src/domain/types/PropValue.ts';
import { createTestRepo } from '../api/helpers/setup.ts';

const LANE = 'think';
const SUBJECT = 'entry:same';

/**
 * What `addEntity`'s uniqueness guard actually promises.
 *
 * It refuses an id it can *see* — one this patch already added, or one alive
 * in the materialized basis the builder was opened against. That is a local
 * guard, not a distributed uniqueness law:
 *
 * - Two writers from the same frontier see neither each other's patch nor each
 *   other's intent, so both are admitted and the join merges them.
 * - A writer that has never materialized has no basis to check against, so the
 *   guard cannot fire at all.
 *
 * Collision-resistant ids are therefore the application's job, not the
 * substrate's. These tests exist so the documented promise stays the one the
 * substrate actually keeps.
 */
describe('entity capture under concurrent writers', () => {
  let repository: Awaited<ReturnType<typeof createTestRepo>>;

  beforeEach(async () => {
    repository = await createTestRepo('entity-capture-concurrent');
  });

  afterEach(async () => {
    await repository.cleanup();
  });

  it('admits both writers and merges them rather than rejecting either', async () => {
    await capture('writer-a', { kind: 'capture', text: 'from a' });
    await capture('writer-b', { kind: 'capture', text: 'from b' });

    const graph = await repository.openGraph(LANE, 'reader');
    await graph.materialize();
    const slice = await graph.materializeSlice(SUBJECT);

    // Both creations are real facts. Neither was silently dropped, and the
    // entity's cone is no longer a singleton.
    expect(slice.patchCount).toBe(2);
    expect(slice.state.nodeAlive.contains(SUBJECT)).toBe(true);
    expect([...slice.state.nodeAlive.getDots(SUBJECT)]).toHaveLength(2);

    // The merged property is one of the two, decided by the register's
    // conflict rule — not a blend, and not an error.
    expect(['from a', 'from b'])
      .toContain(propertiesOf(slice.state, SUBJECT)['text']);
  });

  it('cannot refuse a re-creation when the writer has no materialized basis', async () => {
    await capture('writer-a', { kind: 'capture', text: 'first' });

    // Same writer, same id, admitted — because a lane that has never
    // materialized has no basis in which to observe the existing id. The
    // guard is a shape check against what the builder can see, and here it
    // can see nothing.
    await expect(capture('writer-a', { kind: 'capture', text: 'second' }))
      .resolves.toBeUndefined();
  });

  async function capture(
    writer: string,
    properties: Record<string, PropValue>,
  ): Promise<void> {
    const runtime = await Runtime.open({ at: repository.tempDir, writer });
    try {
      const lane = await runtime.lane(LANE);
      await lane.write(Intent.addEntity({ subject: SUBJECT, properties }));
    } finally {
      await runtime.close();
    }
  }
});

function propertiesOf(state: WarpState, nodeId: string): Record<string, PropValue> {
  const properties: Record<string, PropValue> = {};
  for (const entry of state.nodeProperties()) {
    if (entry.nodeId === nodeId) {
      properties[entry.key] = entry.register.value;
    }
  }
  return properties;
}
