/**
 * Generated differential: incremental index updates agree with full rebuilds
 * over multi-writer histories.
 *
 * Each seed builds one history of three writers. A writer acts on its own
 * view and syncs that view with the delivered history only sometimes. So it
 * removes the nodes and edges that it observed, writes properties to nodes it
 * never saw alive, and adds edges whose endpoints no patch has added yet.
 * Patches are delivered in the order they were generated, which interleaves
 * the writers' Lamport clocks out of order: a register write can arrive
 * before or after the concurrent write that beats it.
 *
 * Oracle: differential against a full rebuild (`MaterializedViewService.build`
 * over `reducePatches` of the same delivered prefix), after every patch, for
 * every node id the generator can name: the alive bit, the outgoing and
 * incoming neighbours, and the indexed properties of alive nodes. Readers gate
 * indexed property reads on the alive bitmap (`QueryReads.hasIndexForNode`),
 * and the incremental props shard keeps the visible registers of a dead node
 * that a full rebuild omits, so properties are compared for alive nodes only.
 *
 * The last test classifies the corpus, so the seeds cannot pass by never
 * producing the cases that the differential exists for. One class is a patch
 * that moves one node or edge out of the alive set and back in, or in and back
 * out: its diff lists the element as both added and removed.
 */
import { describe, it, expect } from 'vitest';
import { applyWithDiff, createEmptyState, reducePatches } from '../../../../src/domain/services/JoinReducer.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { EventId, compareEventIds } from '../../../../src/domain/utils/EventId.ts';
import { decodeEdgeKey, encodeEdgeKey } from '../../../../src/domain/services/KeyCodec.ts';
import MaterializedViewService, { type BuildResult } from '../../../../src/domain/services/MaterializedViewService.ts';
import BitmapNeighborProvider from '../../../../src/domain/services/index/BitmapNeighborProvider.ts';
import type WarpState from '../../../../src/domain/services/state/WarpState.ts';
import type { PatchDiff } from '../../../../src/domain/types/PatchDiff.ts';
import MockIndexStorage from '../../../helpers/MockIndexStorage.ts';
import { createRng } from '../../../helpers/seededRng.ts';

const THIS_FILE = 'test/unit/domain/services/MaterializedView.generatedHistories.test.ts';
const NODE_IDS = ['a', 'b', 'c', 'd', 'e', '__proto__', 'user:1'];
const LABELS = ['knows', 'owns'];
const PROP_KEYS = ['name', 'status'];
const PROP_VALUES = ['x', 'y', 7, null];
const WRITERS = ['wa', 'wb', 'wc'];
const PATCH_COUNT = 30;
const SYNC_RATE = 0.35;
const SEEDS = Array.from({ length: 24 }, (_, index) => index + 1);
const REPLAY_COMMAND = `bash scripts/run-in-docker.sh vitest run ${THIS_FILE}`;

type GeneratedOp =
  | { readonly type: 'NodeAdd'; readonly node: string; readonly dot: Dot }
  | { readonly type: 'NodeRemove'; readonly node: string; readonly observedDots: string[] }
  | { readonly type: 'EdgeAdd'; readonly from: string; readonly to: string; readonly label: string; readonly dot: Dot }
  | { readonly type: 'EdgeRemove'; readonly from: string; readonly to: string; readonly label: string; readonly observedDots: string[] }
  | { readonly type: 'PropSet'; readonly node: string; readonly key: string; readonly value: (typeof PROP_VALUES)[number] };

type GeneratedPatch = {
  readonly writer: string;
  readonly lamport: number;
  readonly ops: readonly GeneratedOp[];
  readonly context: VersionVector;
};

type Delivered = { readonly patch: GeneratedPatch; readonly sha: string };

type NodeView = {
  readonly alive: boolean;
  readonly out: readonly string[];
  readonly in: readonly string[];
  readonly props: object | null | 'not read: node is not alive';
};

type NodeViews = ReadonlyArray<readonly [string, NodeView]>;

type IndexViews = {
  readonly incremental: readonly NodeViews[];
  readonly full: readonly NodeViews[];
};

type CorpusClasses = Record<
  | 'edgesAddedBeforeAnEndpointIsAlive'
  | 'nodesFirstAddedUnderAnAliveEdge'
  | 'nodesAddedAgain'
  | 'registerWritesThatLostOnArrival'
  | 'deadNodesWithVisibleRegisters'
  | 'elementsMovedTwiceByOnePatch',
  number
>;

/** One writer's view of the history: its own patches and the ones it synced. */
class WriterView {
  readonly state: WarpState = createEmptyState();
  readonly seen = new Set<string>();
  lamport = 0;
  dots = 0;
}

function pick<T>(next: () => number, values: readonly T[]): T {
  const value = values[Math.floor(next() * values.length)];
  if (value === undefined) {
    throw new Error('pick requires a non-empty list');
  }
  return value;
}

function mintDot(view: WriterView, writer: string): Dot {
  view.dots += 1;
  return Dot.create(writer, view.dots);
}

function nextStructuralOp(next: () => number, view: WriterView, writer: string): GeneratedOp | null {
  const roll = next();
  const alive = view.state.nodeAlive.elements();
  const edges = view.state.edgeAlive.elements();
  if (roll < 0.25) {
    return { type: 'NodeAdd', node: pick(next, NODE_IDS), dot: mintDot(view, writer) };
  }
  if (roll < 0.4 && alive.length > 0) {
    const node = pick(next, alive);
    return { type: 'NodeRemove', node, observedDots: [...view.state.nodeAlive.getDots(node)] };
  }
  if (roll < 0.65) {
    return { type: 'EdgeAdd', from: pick(next, NODE_IDS), to: pick(next, NODE_IDS), label: pick(next, LABELS), dot: mintDot(view, writer) };
  }
  if (roll < 0.75 && edges.length > 0) {
    const edgeKey = pick(next, edges);
    return { type: 'EdgeRemove', ...decodeEdgeKey(edgeKey), observedDots: [...view.state.edgeAlive.getDots(edgeKey)] };
  }
  return null;
}

function nextOp(next: () => number, view: WriterView, writer: string): GeneratedOp {
  return nextStructuralOp(next, view, writer)
    ?? { type: 'PropSet', node: pick(next, NODE_IDS), key: pick(next, PROP_KEYS), value: pick(next, PROP_VALUES) };
}

function syncView(view: WriterView, delivered: readonly Delivered[]): void {
  for (const { patch, sha } of delivered) {
    if (!view.seen.has(sha)) {
      applyWithDiff(view.state, patch, sha);
      view.seen.add(sha);
      view.lamport = Math.max(view.lamport, patch.lamport);
    }
  }
}

function generateHistory(seed: number): Delivered[] {
  const next = createRng(seed).next;
  const views = new Map(WRITERS.map((writer) => [writer, new WriterView()]));
  const delivered: Delivered[] = [];
  for (let step = 1; step <= PATCH_COUNT; step++) {
    const writer = pick(next, WRITERS);
    const view = views.get(writer) ?? new WriterView();
    if (next() < SYNC_RATE) {
      syncView(view, delivered);
    }
    view.lamport += 1;
    const ops = Array.from({ length: 1 + Math.floor(next() * 3) }, () => nextOp(next, view, writer));
    const patch = { writer, lamport: view.lamport, ops, context: VersionVector.empty() };
    const sha = `${step.toString(16).padStart(4, '0')}${seed.toString(16).padStart(4, '0')}`.padEnd(40, '0');
    applyWithDiff(view.state, patch, sha);
    view.seen.add(sha);
    delivered.push({ patch, sha });
  }
  return delivered;
}

function service(): MaterializedViewService {
  return new MaterializedViewService({ indexStore: new MockIndexStorage() });
}

/** Every named node's view, in `NODE_IDS` order. A list, so `__proto__` stays an ordinary entry. */
async function snapshot(result: BuildResult): Promise<NodeViews> {
  const provider = new BitmapNeighborProvider({ logicalIndex: result.logicalIndex });
  const views: Array<readonly [string, NodeView]> = [];
  for (const nodeId of NODE_IDS) {
    const alive = result.logicalIndex.isAlive(nodeId);
    const out = await provider.getNeighbors(nodeId, 'out');
    const incoming = await provider.getNeighbors(nodeId, 'in');
    views.push([nodeId, {
      alive,
      out: out.map((edge) => `${edge.label}:${edge.neighborId}`).sort(),
      in: incoming.map((edge) => `${edge.label}:${edge.neighborId}`).sort(),
      props: alive ? await result.propertyReader.getNodeProps(nodeId) : 'not read: node is not alive',
    }]);
  }
  return views;
}

/** Applies the seed's history patch by patch; returns both indexes' views after every patch. */
async function replayBothIndexes(seed: number): Promise<IndexViews> {
  const history = generateHistory(seed);
  const views = service();
  const state = createEmptyState();
  let incremental = views.build(createEmptyState());
  const incrementalViews: NodeViews[] = [];
  const fullViews: NodeViews[] = [];
  for (const [index, { patch, sha }] of history.entries()) {
    const { diff } = applyWithDiff(state, patch, sha);
    incremental = views.applyDiff({ existingTree: incremental.tree, diff, state });
    incrementalViews.push(await snapshot(incremental));
    fullViews.push(await snapshot(views.build(reducePatches(history.slice(0, index + 1)))));
  }
  return { incremental: incrementalViews, full: fullViews };
}

function everAliveBefore(diff: PatchDiff, everAlive: ReadonlySet<string>): Set<string> {
  return new Set(diff.nodesAdded.filter((nodeId) => everAlive.has(nodeId)));
}

function hasAliveIncidentEdgeOutsideDiff(state: WarpState, nodeId: string, diff: PatchDiff): boolean {
  const diffEdges = new Set(diff.edgesAdded.map((edge) => encodeEdgeKey(edge.from, edge.to, edge.label)));
  return state.edgeAlive.elements().some((edgeKey) => {
    const { from, to } = decodeEdgeKey(edgeKey);
    const other = from === nodeId ? to : from;
    return (from === nodeId || to === nodeId) && state.nodeAlive.contains(other) && !diffEdges.has(edgeKey);
  });
}

function lostOnArrival(state: WarpState, op: GeneratedOp, writtenBy: EventId): boolean {
  if (op.type !== 'PropSet') {
    return false;
  }
  const winner = state.getNodeProp(op.node, op.key)?.eventId;
  return winner instanceof EventId && compareEventIds(winner, writtenBy) !== 0;
}

function countDeadNodesWithVisibleRegisters(state: WarpState): number {
  return NODE_IDS.filter((nodeId) => !state.nodeAlive.contains(nodeId) && PROP_KEYS.some((key) => {
    const register = state.getNodeProp(nodeId, key);
    return register !== undefined && !state.isStaleNodeRegister(nodeId, register);
  })).length;
}

/** Nodes and edges that one patch moves out of the alive set and back, or in and back out. */
function countElementsMovedTwice(diff: PatchDiff): number {
  const removedEdges = new Set(diff.edgesRemoved.map((edge) => encodeEdgeKey(edge.from, edge.to, edge.label)));
  return diff.nodesAdded.filter((nodeId) => diff.nodesRemoved.includes(nodeId)).length
    + diff.edgesAdded.filter((edge) => removedEdges.has(encodeEdgeKey(edge.from, edge.to, edge.label))).length;
}

function classifyHistory(history: readonly Delivered[], counts: CorpusClasses): void {
  const state = createEmptyState();
  const everAlive = new Set<string>();
  for (const { patch, sha } of history) {
    const aliveBefore = new Set(state.nodeAlive.elements());
    counts.edgesAddedBeforeAnEndpointIsAlive += patch.ops.filter((op) => op.type === 'EdgeAdd'
      && (!aliveBefore.has(op.from) || !aliveBefore.has(op.to))).length;
    const { diff } = applyWithDiff(state, patch, sha);
    counts.elementsMovedTwiceByOnePatch += countElementsMovedTwice(diff);
    const addedAgain = everAliveBefore(diff, everAlive);
    counts.nodesAddedAgain += addedAgain.size;
    counts.nodesFirstAddedUnderAnAliveEdge += diff.nodesAdded.filter((nodeId) => !addedAgain.has(nodeId)
      && hasAliveIncidentEdgeOutsideDiff(state, nodeId, diff)).length;
    counts.registerWritesThatLostOnArrival += patch.ops.filter((op, index) => lostOnArrival(
      state, op, new EventId(patch.lamport, patch.writer, sha, index),
    )).length;
    diff.nodesAdded.forEach((nodeId) => everAlive.add(nodeId));
  }
  counts.deadNodesWithVisibleRegisters += countDeadNodesWithVisibleRegisters(state);
}

describe('incremental index against full rebuilds over generated multi-writer histories', () => {
  it.each(SEEDS)('seed %d agrees with a full rebuild after every patch', async (seed) => {
    const { incremental, full } = await replayBothIndexes(seed);

    // Array index = patch number - 1. Replay: the command below, with -t 'seed <n> '.
    expect(incremental, `seed ${String(seed)}; replay: ${REPLAY_COMMAND} -t 'seed ${String(seed)} '`).toEqual(full);
  });

  it('generates every case class that the differential exists for', () => {
    const counts: CorpusClasses = {
      edgesAddedBeforeAnEndpointIsAlive: 0,
      nodesFirstAddedUnderAnAliveEdge: 0,
      nodesAddedAgain: 0,
      registerWritesThatLostOnArrival: 0,
      deadNodesWithVisibleRegisters: 0,
      elementsMovedTwiceByOnePatch: 0,
    };
    for (const seed of SEEDS) {
      classifyHistory(generateHistory(seed), counts);
    }

    const empty = Object.entries(counts).filter(([, count]) => count === 0).map(([name]) => name);
    expect(empty, `corpus classes over ${String(SEEDS.length)} seeds: ${Object.entries(counts).map(([name, count]) => `${name}=${String(count)}`).join(', ')}`).toEqual([]);
  });
});
