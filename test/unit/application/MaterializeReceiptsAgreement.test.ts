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
 *
 * Full replays stream writer chains in writer-id order, so the remove from
 * `abe` runs before the `zed` add it observed. Receipt order stays writer
 * order, so the early remove reports `redundant`, exactly as the in-memory
 * reducer does for the same order. The state must still drop the node.
 */

import { describe, it, expect } from 'vitest';
import Patch from '../../../src/domain/types/Patch.ts';
import NodeAdd from '../../../src/domain/types/ops/NodeAdd.ts';
import NodeRemove from '../../../src/domain/types/ops/NodeRemove.ts';
import EdgeAdd from '../../../src/domain/types/ops/EdgeAdd.ts';
import EdgeRemove from '../../../src/domain/types/ops/EdgeRemove.ts';
import { Dot, encodeDot } from '../../../src/domain/crdt/Dot.ts';
import { encodeEdgeKey, reducePatches } from '../../../src/domain/services/JoinReducer.ts';
import type { TickReceipt } from '../../../src/domain/types/TickReceipt.ts';
import {
  appendJournalOnly,
  inGitRepo,
  withGitStorageHost as withHost,
} from '../../helpers/GitStorageJournalFixture.ts';

type Observation = {
  readonly plain: string[];
  readonly withReceipts: string[];
  readonly getNodesAfterReceipts: string[];
  readonly plainEdges: string[];
  readonly receiptEdges: string[];
  readonly receipts: readonly TickReceipt[];
};

function edgeKeys(edges: ReadonlyMap<string, ReadonlySet<string>> | Iterable<string>): string[] {
  return [...edges instanceof Map ? edges.keys() : edges].sort();
}

async function observe(cwd: string): Promise<Observation> {
  return await withHost(cwd, 'reader', async (host) => {
    const plainState = await host.materialize();
    const { state, receipts } = await host.materialize({ receipts: true });
    return {
      plain: [...plainState.nodeAlive.elements()].sort(),
      withReceipts: [...state.nodeAlive.elements()].sort(),
      getNodesAfterReceipts: (await host.getNodes()).sort(),
      plainEdges: edgeKeys(plainState.edgeAlive.elements()),
      receiptEdges: edgeKeys(state.edgeAlive.elements()),
      receipts,
    };
  });
}

function receiptOutcomes(receipts: readonly TickReceipt[]): string[] {
  return receipts.flatMap((r) => r.ops.map((op) => `${r.writer}:${op.op}:${op.target}:${op.result}`));
}

async function inRepo<T>(work: (cwd: string) => Promise<T>): Promise<T> {
  return await inGitRepo('materialize-receipts-1119', work);
}

async function journalOnly(patches: readonly Patch[]): Promise<Observation> {
  return await inRepo(async (cwd) => {
    await appendJournalOnly(cwd, patches);
    return await observe(cwd);
  });
}

/** In-memory receipts for the writer-id order that full replays use. */
function inMemoryWriterOrder(patches: readonly Patch[]): { nodes: string[]; edges: string[]; outcomes: string[] } {
  const ordered = [...patches]
    .sort((a, b) => a.writer.localeCompare(b.writer))
    .map((patch, i) => ({ patch, sha: String(i + 1).repeat(40).slice(0, 40) }));
  const { state, receipts } = reducePatches(ordered, undefined, { receipts: true });
  return {
    nodes: [...state.nodeAlive.elements()].sort(),
    edges: [...state.edgeAlive.elements()].sort(),
    outcomes: receiptOutcomes(receipts),
  };
}

const zedAddsNodes = new Patch({
  writer: 'zed', lamport: 1, context: {},
  ops: [new NodeAdd('n1', new Dot('zed', 1)), new NodeAdd('n2', new Dot('zed', 2))],
});
const abeRemovesN1 = new Patch({
  writer: 'abe', lamport: 2, context: { zed: 2 },
  ops: [new NodeRemove('n1', [encodeDot(new Dot('zed', 1))])],
});

describe('materialize receipts agreement on Git storage (#1119)', () => {
  it('API history: the receipts path agrees with plain materialize', { timeout: 30000 }, async () => {
    const seen = await inRepo(async (cwd) => {
      await withHost(cwd, 'zed', async (h) => { await (await h.createPatch()).addNode('n1').addNode('n2').commit(); });
      await withHost(cwd, 'abe', async (h) => { await h.materialize(); await (await h.createPatch()).removeNode('n1').commit(); });
      return await observe(cwd);
    });
    expect(seen.plain).toEqual(['n2']);
    expect(seen.withReceipts).toEqual(['n2']);
    expect(seen.getNodesAfterReceipts).toEqual(['n2']);
    expect(seen.receipts.map((r) => r.writer)).toEqual(['abe', 'zed']);
    expect(receiptOutcomes(seen.receipts)).toEqual([
      'abe:NodeTombstone:n1:redundant',
      'zed:NodeAdd:n1:applied',
      'zed:NodeAdd:n2:applied',
    ]);
  });

  it('journal-only node history: both paths and the in-memory reducer agree', { timeout: 30000 }, async () => {
    const seen = await journalOnly([zedAddsNodes, abeRemovesN1]);
    const memory = inMemoryWriterOrder([zedAddsNodes, abeRemovesN1]);
    expect(memory.nodes).toEqual(['n2']);
    expect(seen.plain).toEqual(memory.nodes);
    expect(seen.withReceipts).toEqual(memory.nodes);
    expect(seen.getNodesAfterReceipts).toEqual(memory.nodes);
    expect(receiptOutcomes(seen.receipts)).toEqual(memory.outcomes);
  });

  it('journal-only edge history: an early EdgeRemove still deletes the edge', { timeout: 30000 }, async () => {
    const zedAddsEdge = new Patch({
      writer: 'zed', lamport: 1, context: {},
      ops: [
        new NodeAdd('a', new Dot('zed', 1)),
        new NodeAdd('b', new Dot('zed', 2)),
        new EdgeAdd({ from: 'a', to: 'b', label: 'rel', dot: new Dot('zed', 3) }),
      ],
    });
    const abeRemovesEdge = new Patch({
      writer: 'abe', lamport: 2, context: { zed: 3 },
      ops: [new EdgeRemove({ from: 'a', to: 'b', label: 'rel', observedDots: [encodeDot(new Dot('zed', 3))] })],
    });
    const seen = await journalOnly([zedAddsEdge, abeRemovesEdge]);
    const memory = inMemoryWriterOrder([zedAddsEdge, abeRemovesEdge]);
    expect(memory.edges).toEqual([]);
    expect(seen.plainEdges).toEqual([]);
    expect(seen.receiptEdges).toEqual([]);
    expect(seen.plain).toEqual(['a', 'b']);
    expect(receiptOutcomes(seen.receipts)).toEqual(memory.outcomes);
    expect(receiptOutcomes(seen.receipts)[0]).toBe(`abe:EdgeTombstone:${encodeEdgeKey('a', 'b', 'rel')}:redundant`);
  });

  it('stored owned empty-dot removes still decode and materialize on both paths', { timeout: 30000 }, async () => {
    const aliceAdds = new Patch({
      writer: 'alice', lamport: 1, context: {},
      ops: [new NodeAdd('n1', new Dot('alice', 1)), new NodeAdd('n2', new Dot('alice', 2))],
    });
    const oldEmptyRemoves = new Patch({
      writer: 'old', lamport: 9, context: { alice: 2 },
      ops: [new NodeRemove('n1', []), new NodeRemove('ghost', [])],
    });
    const seen = await journalOnly([aliceAdds, oldEmptyRemoves]);
    expect(seen.plain).toEqual(['n1', 'n2']);
    expect(seen.withReceipts).toEqual(['n1', 'n2']);
    expect(receiptOutcomes(seen.receipts).slice(2)).toEqual([
      'old:NodeTombstone:n1:redundant',
      'old:NodeTombstone:ghost:redundant',
    ]);
  });
});
