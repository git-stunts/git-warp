/**
 * #1119: on Git storage, a host can checkpoint while it holds a remove but
 * not the add that the remove observed (one writer chain arrived, the chain
 * it observed did not). The add then arrives as checkpoint tail. The bounded
 * checkpoint-tail node read must give the answer `materialize()` gives: the
 * node is removed.
 *
 * Oracle: the in-memory reducer over the same patches. It is a reference
 * implementation of the same merge, so each case also states the expected
 * answer as a literal.
 *
 * The session trie keeps the early tombstone by reserving the observed dot
 * under the element, so the checkpoint state holds an entry for that dot.
 * The node lifecycle receipt must list the dot anyway; the first case reads
 * the receipt, the other cases read through the runtime host.
 */

import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { Dot, encodeDot } from '../../../src/domain/crdt/Dot.ts';
import { NodeLifecycleReceipt } from '../../../src/domain/artifacts/NodeLifecycleReceipt.ts';
import { reducePatches } from '../../../src/domain/services/JoinReducer.ts';
import NodeLifecycleIndexBuilder from '../../../src/domain/services/index/NodeLifecycleIndexBuilder.ts';
import type WarpState from '../../../src/domain/services/state/WarpState.ts';
import Patch from '../../../src/domain/types/Patch.ts';
import NodeAdd from '../../../src/domain/types/ops/NodeAdd.ts';
import NodeRemove from '../../../src/domain/types/ops/NodeRemove.ts';
import {
  appendJournalPatch,
  inGitRepo,
  JOURNAL_GRAPH,
  withGitStorageHost as withHost,
} from '../../helpers/GitStorageJournalFixture.ts';

const ZED_1 = encodeDot(new Dot('zed', 1));
const zedAdds = new Patch({
  writer: 'zed', lamport: 1, context: {},
  ops: [new NodeAdd('n1', new Dot('zed', 1)), new NodeAdd('n2', new Dot('zed', 2))],
});
const abeRemovesN1 = new Patch({
  writer: 'abe', lamport: 2, context: { zed: 2 },
  ops: [new NodeRemove('n1', [ZED_1])],
});
const yanAddsN1 = new Patch({
  writer: 'yan', lamport: 3, context: {},
  ops: [new NodeAdd('n1', new Dot('yan', 1))],
});
const zedAddsN3 = new Patch({
  writer: 'zed', lamport: 3, context: {},
  ops: [new NodeAdd('n3', new Dot('zed', 3))],
});

function reducerAlive(patches: readonly Patch[], nodeId: string): boolean {
  const entries = patches.map((patch, index) => ({ patch, sha: String(index + 1).repeat(40) }));
  return reducePatches(entries).nodeAlive.contains(nodeId);
}

function receiptTombstonesOf(state: WarpState): readonly string[] {
  for (const shard of NodeLifecycleIndexBuilder.fromState(state).yieldShards()) {
    if (shard instanceof NodeLifecycleReceipt) {
      return shard.floatingTombstones;
    }
  }
  throw new Error('the lifecycle builder yielded no receipt');
}

type NodeReads = {
  readonly opticAlive: boolean;
  readonly opticKind: string;
  readonly materializedAlive: boolean;
  readonly hasNode: boolean;
};

const REMOVED: NodeReads = {
  opticAlive: false, opticKind: 'checkpoint-tail-read', materializedAlive: false, hasNode: false,
};
const ALIVE: NodeReads = {
  opticAlive: true, opticKind: 'checkpoint-tail-read', materializedAlive: true, hasNode: true,
};

/** Appends `checkpoint`, checkpoints, appends `tail`, then reads the node on a fresh host. */
async function readAfterCheckpointAndTail(
  checkpoint: readonly Patch[],
  tail: readonly Patch[],
  nodeId: string,
): Promise<NodeReads> {
  return await inGitRepo('checkpoint-tail-early-remove', async (cwd) => {
    await withHost(cwd, 'init', async () => { /* writes the substrate marker */ });
    const tips = new Map<string, string>();
    const append = async (patch: Patch): Promise<void> => {
      tips.set(patch.writer, await appendJournalPatch(cwd, patch, tips.get(patch.writer) ?? null));
    };
    for (const patch of checkpoint) { await append(patch); }
    await withHost(cwd, 'reader', async (host) => {
      await host.materialize();
      await host.createCheckpoint();
    });
    for (const patch of tail) { await append(patch); }
    return await withHost(cwd, 'reader', async (host) => {
      const optic = await host.worldline().optic().node(nodeId).read();
      const state = await host.materialize();
      return {
        opticAlive: optic.alive,
        opticKind: optic.readIdentity.kind,
        materializedAlive: state.nodeAlive.contains(nodeId),
        hasNode: await host.hasNode(nodeId),
      };
    });
  });
}

function fetchWriter(origin: string, replica: string, writer: string): void {
  const ref = `refs/warp/${JOURNAL_GRAPH}/writers/${writer}`;
  execFileSync('git', ['-C', replica, 'fetch', origin, `${ref}:${ref}`], { stdio: 'pipe' });
}

describe('checkpoint-tail node read after an early remove on Git storage (#1119)', () => {
  it('lists the dot of an early remove in the node lifecycle receipt of the materialized state', { timeout: 60000 }, async () => {
    const materialized = await inGitRepo('checkpoint-tail-early-remove-receipt', async (cwd) => {
      await withHost(cwd, 'init', async () => { /* writes the substrate marker */ });
      await appendJournalPatch(cwd, abeRemovesN1);
      return await withHost(cwd, 'reader', async (host) => {
        await host.materialize();
        // The checkpoint builds its receipt from this state; the frozen value materialize() returns hides tombstones.
        const cached = host._cachedState;
        if (cached === null) { throw new Error('materialize left no cached state'); }
        return cached;
      });
    });
    expect({
      tombstones: [...materialized.nodeAlive.tombstonesIter()],
      receipt: receiptTombstonesOf(materialized),
    }).toEqual({ tombstones: [ZED_1], receipt: [ZED_1] });
  });

  it('reads a node removed when its add and its remove are both inside the checkpoint', { timeout: 60000 }, async () => {
    expect(reducerAlive([zedAdds, abeRemovesN1, zedAddsN3], 'n1')).toBe(false);
    expect(await readAfterCheckpointAndTail([zedAdds, abeRemovesN1], [zedAddsN3], 'n1')).toEqual(REMOVED);
  });

  it('reads a node alive when a tail add carries a dot the checkpoint remove did not observe', { timeout: 60000 }, async () => {
    expect(reducerAlive([abeRemovesN1, yanAddsN1], 'n1')).toBe(true);
    expect(await readAfterCheckpointAndTail([abeRemovesN1], [yanAddsN1], 'n1')).toEqual(ALIVE);
  });

  it('reads a node removed when the add its checkpoint remove observed arrives as tail', { timeout: 60000 }, async () => {
    expect(reducerAlive([abeRemovesN1, zedAdds], 'n1')).toBe(false);
    expect(await readAfterCheckpointAndTail([abeRemovesN1], [zedAdds], 'n1')).toEqual(REMOVED);
  });

  it('agrees with materialize on node and property reads after the removing writer is fetched and checkpointed first', { timeout: 120000 }, async () => {
    const seen = await inGitRepo('checkpoint-tail-early-remove-origin', async (origin) => await inGitRepo('checkpoint-tail-early-remove-replica', async (replica) => {
      await withHost(origin, 'zed', async (host) => {
        await (await host.createPatch()).addNode('n1').addNode('n2').setProperty('n1', 'k', 'v').commit();
      });
      await withHost(origin, 'abe', async (host) => {
        await host.materialize();
        await (await host.createPatch()).removeNode('n1').commit();
      });
      await withHost(replica, 'init', async () => { /* writes the substrate marker */ });
      fetchWriter(origin, replica, 'abe');
      await withHost(replica, 'reader', async (host) => {
        await host.materialize();
        await host.createCheckpoint();
      });
      fetchWriter(origin, replica, 'zed');
      const originAlive = await withHost(origin, 'reader', async (host) => (await host.materialize()).nodeAlive.contains('n1'));
      return await withHost(replica, 'reader', async (host) => {
        const node = await host.worldline().optic().node('n1').read();
        const untouched = await host.worldline().optic().node('n2').read();
        const prop = await host.worldline().optic().node('n1').prop('k').read();
        const state = await host.materialize();
        return {
          originAlive,
          opticAlive: node.alive,
          opticKind: node.readIdentity.kind,
          untouchedNodeAlive: untouched.alive,
          opticPropExists: prop.exists,
          materializedAlive: state.nodeAlive.contains('n1'),
          materializedProp: (await host.getNodeProps('n1'))?.['k'] ?? null,
        };
      });
    }));
    expect(seen).toEqual({
      originAlive: false,
      opticAlive: false,
      opticKind: 'checkpoint-tail-read',
      untouchedNodeAlive: true,
      opticPropExists: false,
      materializedAlive: false,
      materializedProp: null,
    });
  });
});
