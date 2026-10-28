import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type PatchEntry from '../../../../../src/domain/artifacts/PatchEntry.ts';
import ConeFold from '../../../../../src/domain/services/cone/ConeFold.ts';
import ConeFolded from '../../../../../src/domain/services/cone/ConeFolded.ts';
import ConeFoldSession from '../../../../../src/domain/services/cone/ConeFoldSession.ts';
import ConeReader from '../../../../../src/domain/services/cone/ConeReader.ts';
import ConeRoot from '../../../../../src/domain/services/cone/ConeRoot.ts';
import { CONE_ADJACENCY_PAGE_SIZE } from '../../../../../src/domain/services/cone/ConeAdjacencyPage.ts';
import { reducePatches } from '../../../../../src/domain/services/JoinReducer.ts';
import { decodeEdgeKey } from '../../../../../src/domain/services/KeyCodec.ts';
import { createStateReader } from '../../../../../src/domain/services/state/StateReader.ts';
import type WarpState from '../../../../../src/domain/services/state/WarpState.ts';
import type { VisibleNodeView } from '../../../../../src/domain/types/VisibleNodeView.ts';
import type { VisibleStateReader } from '../../../../../src/domain/types/VisibleStateReader.ts';
import ConeHistoryGenerator, { interleave, type ConeHistory, type ConeHistoryShape } from '../../../../helpers/ConeHistoryGenerator.ts';
import InMemoryConeRecordStore from '../../../../helpers/InMemoryConeRecordStore.ts';
import { createRng } from '../../../../helpers/seededRng.ts';

/** Fixed fast-check seed: every run checks the same histories; a failure prints its history seed. */
const ORACLE_SEED = 1039;
const INTERLEAVINGS = 3;

const SHAPES: ReadonlyArray<{ readonly name: string; readonly runs: number; readonly shape: ConeHistoryShape }> = [
  { name: 'small dense', runs: 80, shape: { writers: 3, patches: 30, nodes: 4, maxOps: 3, syncChance: 0.5 } },
  { name: 'wide concurrent', runs: 40, shape: { writers: 5, patches: 60, nodes: 8, maxOps: 4, syncChance: 0.2 } },
  { name: 'long synced', runs: 20, shape: { writers: 3, patches: 150, nodes: 6, maxOps: 3, syncChance: 0.8 } },
];

type Totals = { histories: number; patches: number; folds: number; entities: number; ops: Map<string, number> };

/** Folds `order` into a fresh trie, committing every `chunk` patches, and returns the final root. */
async function foldAll(store: InMemoryConeRecordStore, order: readonly PatchEntry[], chunk: number): Promise<ConeRoot> {
  let root = ConeRoot.empty();
  for (let start = 0; start < order.length; start += chunk) {
    const session = new ConeFoldSession({ store, root, flushRecords: 7 });
    for (const entry of order.slice(start, start + chunk)) {
      const outcome = await ConeFold.fold(session, entry);
      expect(outcome).toBeInstanceOf(ConeFolded);
    }
    root = await session.commit();
  }
  return root;
}

function normalizedView(view: VisibleNodeView | null): VisibleNodeView | null {
  if (view === null) {
    return null;
  }
  const order = (left: { nodeId: string; label: string }, right: { nodeId: string; label: string }): number =>
    `${left.nodeId}\0${left.label}`.localeCompare(`${right.nodeId}\0${right.label}`);
  return { ...view, outgoing: [...view.outgoing].sort(order), incoming: [...view.incoming].sort(order) };
}

/** Compares liveness, properties and neighbourhood of every entity in the universe. */
async function assertEquivalent(history: ConeHistory, full: WarpState, cone: { store: InMemoryConeRecordStore; root: ConeRoot }): Promise<number> {
  const fullReader: VisibleStateReader = createStateReader(full);
  const reader = new ConeReader(cone.store);
  for (const nodeId of history.nodeIds) {
    const record = await reader.node(cone.root, nodeId);
    expect(record.isAlive(), `node ${nodeId} liveness, seed ${history.seed}`).toBe(full.nodeAlive.contains(nodeId));
    const neighbourhood = await reader.neighbourhood(cone.root, nodeId);
    expect(neighbourhood.hasNode(nodeId)).toBe(fullReader.hasNode(nodeId));
    const fullView = fullReader.inspectNode(nodeId);
    expect(normalizedView(neighbourhood.inspectNode(nodeId)), `node ${nodeId} view, seed ${history.seed}`).toEqual(normalizedView(fullView));
    for (const neighbour of fullView?.outgoing ?? []) {
      expect(neighbourhood.getEdgeProps(nodeId, neighbour.nodeId, neighbour.label))
        .toEqual(fullReader.getEdgeProps(nodeId, neighbour.nodeId, neighbour.label));
    }
    await assertAdjacencyComplete(reader, cone.root, { history, full, nodeId });
  }
  for (const edgeKey of history.edgeKeys) {
    expect((await reader.edge(cone.root, edgeKey)).isAlive(), `edge liveness, seed ${history.seed}`).toBe(full.edgeAlive.contains(edgeKey));
  }
  return history.nodeIds.length + history.edgeKeys.length;
}

/** Every edge the full state knows with this node as an endpoint is registered exactly once. */
async function assertAdjacencyComplete(
  reader: ConeReader,
  root: ConeRoot,
  context: { readonly history: ConeHistory; readonly full: WarpState; readonly nodeId: string },
): Promise<void> {
  const record = await reader.node(root, context.nodeId);
  for (const direction of ['out', 'in'] as const) {
    const registered: string[] = [];
    for (let index = 0; index * CONE_ADJACENCY_PAGE_SIZE < record.degree(direction); index += 1) {
      registered.push(...(await reader.adjacencyPage(root, context.nodeId, { direction, index })).edgeKeys);
    }
    const expected = [...context.full.edgeAlive.entries.keys()].filter((edgeKey) => {
      const { from, to } = decodeEdgeKey(edgeKey);
      return (direction === 'out' ? from : to) === context.nodeId;
    });
    expect(new Set(registered).size).toBe(registered.length);
    for (const edgeKey of expected) {
      expect(registered).toContain(edgeKey);
    }
  }
}

async function checkHistory(seed: number, shape: ConeHistoryShape, totals: Totals): Promise<void> {
  const history = new ConeHistoryGenerator(seed, shape).generate();
  const chainOrder = [...history.chains.values()].flat();
  const full = reducePatches(chainOrder.map((entry) => ({ patch: entry.patch, sha: entry.sha })));
  const rng = createRng(seed ^ 0x5eed);
  for (let run = 0; run < INTERLEAVINGS; run += 1) {
    const store = new InMemoryConeRecordStore();
    const order = interleave(rng, history.chains);
    const root = await foldAll(store, order, rng.nextInt(1, order.length + 1));
    totals.entities += await assertEquivalent(history, full, { store, root });
    totals.folds += order.length;
  }
  totals.histories += 1;
  totals.patches += chainOrder.length;
  for (const [kind, count] of history.opCounts) {
    totals.ops.set(kind, (totals.ops.get(kind) ?? 0) + count);
  }
}

describe('cone engine equivalence oracle (#1039)', () => {
  for (const { name, runs, shape } of SHAPES) {
    it(`matches a full JoinReducer reduction for every entity: ${name}`, async () => {
      const totals: Totals = { histories: 0, patches: 0, folds: 0, entities: 0, ops: new Map() };
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 1, max: 0x7fffffff }), async (seed) => { await checkHistory(seed, shape, totals); }),
        { seed: ORACLE_SEED, numRuns: runs },
      );
      console.log('CONE_ORACLE', JSON.stringify({ name, shape, ...totals, ops: Object.fromEntries(totals.ops) }));
      expect(totals.histories).toBe(runs);
    }, 300_000);
  }
});
