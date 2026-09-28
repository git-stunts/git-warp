/**
 * A bounded property read over a checkpoint answers what `materialize()`
 * answers when the tail removes the node and adds it again.
 *
 * The checkpoint carries node lifecycle records and register EventIds, so
 * the read can tell that the re-add hides the value written before the
 * removal. Without them it refused with
 * `tail-node-add-needs-checkpoint-lifecycle-witnesses`.
 */
import { describe, expect, it } from 'vitest';
import InMemoryGraphAdapter from '../../test/helpers/InMemoryGraphAdapter.ts';
import { openMemoryRuntimeHostProduct } from '../helpers/MemoryRuntimeHost.ts';
import type { PatchBuilder } from '../../src/domain/services/PatchBuilder.ts';

const NODE_ID = 'task-1';
const KEY = 'status';

type TailPatch = (patch: PatchBuilder) => void;

async function readAfterTail(graphName: string, tail: readonly TailPatch[]) {
  const runtime = await openMemoryRuntimeHostProduct({
    persistence: new InMemoryGraphAdapter(),
    graphName,
    writerId: 'app',
  });
  await runtime.patch((patch) => {
    patch.addNode(NODE_ID);
    patch.setProperty(NODE_ID, KEY, 'before-removal');
  });
  await runtime.materialize();
  await runtime.createCheckpoint();
  for (const write of tail) {
    await runtime.patch(write);
  }
  const optic = await runtime.worldline().optic().node(NODE_ID).prop(KEY).read();
  await runtime.materialize();
  const materialized = (await runtime.getNodeProps(NODE_ID))?.[KEY];
  return { optic, materialized };
}

describe('v18 checkpoint lifecycle optic read basis', () => {
  it('hides a value written before the node was removed and added again in the tail', async () => {
    const { optic, materialized } = await readAfterTail('lifecycle-readd', [
      (patch) => { patch.removeNode(NODE_ID); },
      (patch) => { patch.addNode(NODE_ID); },
    ]);

    expect(materialized).toBeUndefined();
    expect(optic).toMatchObject({ nodeId: NODE_ID, key: KEY, exists: false });
    expect(optic.value).toBe(materialized);
    expect(optic.readIdentity).toMatchObject({ kind: 'checkpoint-tail-read' });
  });

  it('shows a value written after the tail re-add', async () => {
    const { optic, materialized } = await readAfterTail('lifecycle-readd-write', [
      (patch) => { patch.removeNode(NODE_ID); },
      (patch) => {
        patch.addNode(NODE_ID);
        patch.setProperty(NODE_ID, KEY, 'after-readd');
      },
    ]);

    expect(materialized).toBe('after-readd');
    expect(optic).toMatchObject({ nodeId: NODE_ID, key: KEY, exists: true, value: materialized });
  });
});
