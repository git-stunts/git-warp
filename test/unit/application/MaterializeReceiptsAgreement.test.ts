/**
 * #1119: on production Git storage, `materialize({ receipts: true })` and
 * `materialize()` must agree on membership, and a remove that takes effect
 * must report `applied`.
 *
 * Diagnostic shapes:
 * - API: writer `zed` adds n1 and n2. Writer `abe` materializes, then
 *   removes n1. A fresh reader compares both paths.
 * - Journal only: the same history is appended without any retained
 *   materialization, so no causal predecessor can serve the plain path.
 */

import { describe, it, expect } from 'vitest';
import Patch from '../../../src/domain/types/Patch.ts';
import NodeAdd from '../../../src/domain/types/ops/NodeAdd.ts';
import NodeRemove from '../../../src/domain/types/ops/NodeRemove.ts';
import { Dot, encodeDot } from '../../../src/domain/crdt/Dot.ts';
import { reducePatches } from '../../../src/domain/services/JoinReducer.ts';
import GitStorage from '../../../src/application/GitStorage.ts';
import { getDefaultRuntimeHostNodePorts } from '../../../src/application/RuntimeHostNodeDefaults.ts';
import { resolveWarpStorage } from '../../../src/application/WarpStorageRegistry.ts';
import { openRuntimeHostProduct } from '../../../src/domain/warp/RuntimeHostProduct.ts';
import GitCasRepositoryAdapter from '../../../src/infrastructure/adapters/GitCasRepositoryAdapter.ts';
import { openDefaultGitPlumbing } from '../../../src/infrastructure/adapters/GitPlumbingRuntimeAdapter.ts';
import GitTimelineHistoryAdapter from '../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import { createGitRepo } from '../../helpers/warpGraphTestUtils.ts';

const GRAPH = 'g';
type Host = Awaited<ReturnType<typeof openRuntimeHostProduct>>;

async function withHost<T>(cwd: string, writerId: string, work: (host: Host) => Promise<T>): Promise<T> {
  const ports = getDefaultRuntimeHostNodePorts();
  const storage = await GitStorage.open({ cwd });
  try {
    const binding = resolveWarpStorage(storage);
    const host = await openRuntimeHostProduct({
      persistence: binding.history,
      runtimeStorage: binding.runtimeStorage,
      graphName: GRAPH,
      writerId,
      codec: ports.codec,
      crypto: ports.crypto,
      trustCrypto: ports.trustCrypto,
      commitMessageCodec: ports.commitMessageCodec,
    });
    return await work(host);
  } finally {
    await storage.close();
  }
}

async function appendPatch(cwd: string, patch: Patch): Promise<void> {
  const ports = getDefaultRuntimeHostNodePorts();
  const plumbing = await openDefaultGitPlumbing(cwd);
  const history = new GitTimelineHistoryAdapter({ plumbing });
  const repo = new GitCasRepositoryAdapter({ plumbing, history });
  try {
    const services = repo.createMigrationStorageServices({
      timelineName: GRAPH,
      codec: ports.codec,
      crypto: ports.crypto,
      commitMessageCodec: ports.commitMessageCodec,
    });
    await services.patchJournal.appendPatch({
      patch,
      graph: GRAPH,
      writer: patch.writer,
      targetRef: `refs/warp/${GRAPH}/writers/${patch.writer}`,
      expectedHead: null,
      parent: null,
      attachments: [],
    });
  } finally {
    await repo.close();
    await history.close();
  }
}

type Observation = {
  readonly plain: string[];
  readonly withReceipts: string[];
  readonly getNodesAfterReceipts: string[];
  readonly receiptOrder: string[];
  readonly removeResult: string | undefined;
};

async function observe(cwd: string): Promise<Observation> {
  return await withHost(cwd, 'reader', async (host) => {
    const plain = [...(await host.materialize()).nodeAlive.elements()].sort();
    const { state, receipts } = await host.materialize({ receipts: true });
    const getNodesAfterReceipts = (await host.getNodes()).sort();
    const remove = receipts.flatMap((r) => r.ops).find((op) => op.op === 'NodeTombstone');
    return {
      plain,
      withReceipts: [...state.nodeAlive.elements()].sort(),
      getNodesAfterReceipts,
      receiptOrder: receipts.map((r) => `${r.writer}@${String(r.lamport)}`),
      removeResult: remove?.result,
    };
  });
}

async function inRepo<T>(work: (cwd: string) => Promise<T>): Promise<T> {
  const repo = await createGitRepo('materialize-receipts-1119');
  try {
    return await work(repo.tempDir);
  } finally {
    await repo.cleanup();
  }
}

// RED witnesses for #1119. `it.fails` keeps them executable until the fix
// lands; the fix flips them to `it`. The fix needs a recorded design choice
// (replay order, or floating tombstones in the session trie); see #1119 2f.
describe('materialize receipts agreement on Git storage (#1119)', () => {
  it.fails('API history: the receipts path agrees with plain materialize', { timeout: 30000 }, async () => {
    const seen = await inRepo(async (cwd) => {
      await withHost(cwd, 'zed', async (h) => { await (await h.createPatch()).addNode('n1').addNode('n2').commit(); });
      await withHost(cwd, 'abe', async (h) => { await h.materialize(); await (await h.createPatch()).removeNode('n1').commit(); });
      return await observe(cwd);
    });
    expect(seen.plain).toEqual(['n2']);
    expect(seen.withReceipts).toEqual(['n2']);
    expect(seen.getNodesAfterReceipts).toEqual(['n2']);
    expect(seen.removeResult).toBe('applied');
  });

  it.fails('journal-only history: plain materialize has no retained predecessor to lean on', { timeout: 30000 }, async () => {
    const zedAdds = new Patch({
      writer: 'zed', lamport: 1, context: {},
      ops: [new NodeAdd('n1', new Dot('zed', 1)), new NodeAdd('n2', new Dot('zed', 2))],
    });
    const abeRemoves = new Patch({
      writer: 'abe', lamport: 2, context: { zed: 2 },
      ops: [new NodeRemove('n1', [encodeDot(new Dot('zed', 1))])],
    });
    const seen = await inRepo(async (cwd) => {
      await withHost(cwd, 'init', async () => { /* opening the host writes the substrate marker */ });
      await appendPatch(cwd, zedAdds);
      await appendPatch(cwd, abeRemoves);
      return await observe(cwd);
    });
    const inMemoryWriterOrder = [...reducePatches([
      { patch: abeRemoves, sha: 'b'.repeat(40) },
      { patch: zedAdds, sha: 'a'.repeat(40) },
    ]).nodeAlive.elements()].sort();
    expect(inMemoryWriterOrder).toEqual(['n2']);
    expect(seen.plain).toEqual(['n2']);
    expect(seen.withReceipts).toEqual(['n2']);
    expect(seen.removeResult).toBe('applied');
  });
});
