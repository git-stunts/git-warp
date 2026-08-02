import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Runtime } from '../../../index.ts';
import Intent from '../../../src/domain/api/Intent.ts';
import type Lane from '../../../src/domain/api/Lane.ts';
import type WarpState from '../../../src/domain/services/state/WarpState.ts';
import type { PropValue } from '../../../src/domain/types/PropValue.ts';
import { createTestRepo } from '../api/helpers/setup.ts';

const LANE = 'think';
const SUBJECT = 'entry:same';

/**
 * What `addEntity`'s uniqueness guard actually promises on the lane path.
 *
 * It refuses an id it can *see* — one this patch already added, or one alive in
 * the materialized basis the builder was opened against. On the `Runtime` →
 * `Lane.write` path it can see neither, so it never fires:
 *
 * - `Runtime` exposes `lane`, `fork`, `strand`, `settle` and `close`, and
 *   `Lane` exposes `write`. Nothing there materializes, so the builder's basis
 *   is always null and the "alive in the basis" arm is unreachable.
 *   Materializing is a reader concern, and readers do not write.
 * - `Lane.write` lowers one intent per patch, and `addEntity` validates before
 *   it adds the node, so the "added earlier in this patch" arm is unreachable
 *   too.
 *
 * The three tests below walk that from the tightest case outwards: one writer
 * on one lane, then two writers holding a shared frontier, then a writer that
 * opens only after the other's patch is durable. All three are admitted. The
 * guard is reachable only for a direct `PatchBuilder` opened against a
 * materialized state — see `test/unit/domain/services/PatchBuilder.entity.test.ts`.
 *
 * Collision-resistant ids are therefore the application's job, not the
 * substrate's. These tests exist so the documented promise stays the one the
 * substrate actually keeps.
 */
describe('entity capture uniqueness on the lane write path', () => {
  let repository: Awaited<ReturnType<typeof createTestRepo>>;

  beforeEach(async () => {
    repository = await createTestRepo('entity-capture-concurrent');
  });

  afterEach(async () => {
    await repository.cleanup();
  });

  it('cannot refuse a re-creation even on one lane held by one writer', async () => {
    // The tightest case there is: nothing is concurrent, nothing is remote, and
    // the first patch is already in this lane's own history. The guard still
    // has no basis to see it in.
    const runtime = await Runtime.open({ at: repository.tempDir, writer: 'writer-a' });
    try {
      const lane = await runtime.lane(LANE);
      await write(lane, 'first');
      await expect(write(lane, 'second')).resolves.toBeUndefined();
    } finally {
      await runtime.close();
    }

    expect(await creationCount()).toBe(2);
  });

  it('admits both writers holding a shared frontier and merges them', async () => {
    // Both runtimes are open before either writes, so neither could observe the
    // other even if it had a basis. This is the genuine frontier case: the
    // sequential test below cannot distinguish it from "never materialized".
    const a = await Runtime.open({ at: repository.tempDir, writer: 'writer-a' });
    const b = await Runtime.open({ at: repository.tempDir, writer: 'writer-b' });
    try {
      const laneA = await a.lane(LANE);
      const laneB = await b.lane(LANE);
      await write(laneA, 'from a');
      await expect(write(laneB, 'from b')).resolves.toBeUndefined();
    } finally {
      await b.close();
      await a.close();
    }

    const slice = await sliceOfSubject();

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

  it('admits a writer that opens only after the first creation is durable', async () => {
    await captureThroughOwnRuntime('writer-a', 'from a');

    // writer-b opens after writer-a's patch is committed and its runtime
    // closed, so the id it is about to create already exists on disk. It is
    // still admitted, because opening a lane does not materialize anything.
    await expect(captureThroughOwnRuntime('writer-b', 'from b')).resolves.toBeUndefined();

    expect(await creationCount()).toBe(2);
  });

  async function write(lane: Lane, text: string): Promise<void> {
    await lane.write(Intent.addEntity({
      subject: SUBJECT,
      properties: { kind: 'capture', text },
    }));
  }

  async function captureThroughOwnRuntime(writer: string, text: string): Promise<void> {
    const runtime = await Runtime.open({ at: repository.tempDir, writer });
    try {
      await write(await runtime.lane(LANE), text);
    } finally {
      await runtime.close();
    }
  }

  async function sliceOfSubject(): Promise<{
    patchCount: number;
    state: WarpState;
  }> {
    const graph = await repository.openGraph(LANE, 'reader');
    await graph.materialize();
    return graph.materializeSlice(SUBJECT);
  }

  async function creationCount(): Promise<number> {
    const slice = await sliceOfSubject();
    return slice.patchCount;
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
