/**
 * #1119: membership must not depend on replay order.
 *
 * Seeded, well-formed multi-writer histories (every remove names the true
 * owner of the dots it lists) are replayed in causal, writer-id, reversed
 * and shuffled orders, with causal and skewed Lamport clocks. The in-memory
 * reducer, the session (trie) reducer, a join of two halves, a full-state
 * checkpoint round trip, and plain and receipts `materialize()` on Git
 * storage must all match the OR-set specification. Both reducers must also
 * report the same receipt outcomes for the same order.
 *
 * #1153: a session that starts from a state the in-memory reducer left (as a
 * sync does) must also match the specification. Each order is split: the
 * prefix is the base, and the rest arrives after it. The session is seeded
 * from the base, or resumed from the retained roots of a seeded session, and
 * its state and its point reads (what `hasNode` reads) are checked. On Git
 * storage, a host first commits a node of its own (`x`, so that its
 * checkpoint has a frontier), takes the prefix through `applySyncResponse`,
 * checkpoints, and then the rest arrives in the writer chains.
 * `materialize()` and `hasNode` must match. The bounded checkpoint-tail read
 * must match wherever it answers; it refuses a node whose remove is in the
 * tail (`E_OPTIC_NO_BOUNDED_BASIS`), by design.
 *
 * No clock and no ambient randomness: every history comes from a fixed seed.
 * Replay one failing seed with `vitest run <this file> -t "seed <n>"`.
 */

import { describe, expect, it } from 'vitest';
import PatchEntry from '../../../../src/domain/artifacts/PatchEntry.ts';
import { Dot, encodeDot } from '../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import MaterializationCoordinate from '../../../../src/domain/materialization/MaterializationCoordinate.ts';
import TrieGeometry from '../../../../src/domain/orset/trie/TrieGeometry.ts';
import FloatingTombstones from '../../../../src/domain/orset/session/FloatingTombstones.ts';
import StateSession from '../../../../src/domain/orset/session/StateSession.ts';
import {
  materializationSessionOpen,
  reduceSessionBackedState,
  type MaterializeSessionOpen,
} from '../../../../src/domain/services/controllers/MaterializeSessionBridge.ts';
import { encodeEdgeKey, joinStates, reducePatches } from '../../../../src/domain/services/JoinReducer.ts';
import { ReducerSessionFrame, reducePatchesInSession } from '../../../../src/domain/services/JoinReducerSession.ts';
import { deserializeFullState, serializeFullState } from '../../../../src/domain/services/state/CheckpointSerializer.ts';
import type WarpState from '../../../../src/domain/services/state/WarpState.ts';
import Patch from '../../../../src/domain/types/Patch.ts';
import EdgeAdd from '../../../../src/domain/types/ops/EdgeAdd.ts';
import EdgeRemove from '../../../../src/domain/types/ops/EdgeRemove.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import NodePropSet from '../../../../src/domain/types/ops/NodePropSet.ts';
import NodeRemove from '../../../../src/domain/types/ops/NodeRemove.ts';
import type { PatchOp } from '../../../../src/domain/types/ops/unions.ts';
import type { TickReceipt } from '../../../../src/domain/types/TickReceipt.ts';
import QueryError from '../../../../src/domain/errors/QueryError.ts';
import CborFullStateLifecycleDecoder from '../../../../src/infrastructure/adapters/CborFullStateLifecycleDecoder.ts';
import cborCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import type MaterializationWorkspacePort from '../../../../src/ports/MaterializationWorkspacePort.ts';
import InMemoryMaterializationStore from '../../../helpers/InMemoryMaterializationStore.ts';
import { createRng } from '../../../helpers/seededRng.ts';
import { InMemoryTrieStore } from '../../../helpers/trieHelpers.ts';
import {
  appendJournalOnly,
  appendJournalPatch,
  inGitRepo,
  withGitStorageHost,
  type GitStorageHost,
} from '../../../helpers/GitStorageJournalFixture.ts';

const SEEDS = Object.freeze([1, 7, 19, 42, 101, 256, 977, 1337, 4242, 65535, 90001, 123457]);
const GIT_SEEDS = Object.freeze([7, 42, 1337]);
const WRITERS = Object.freeze(['abe', 'mid', 'zed']);
const NODES = Object.freeze(['n0', 'n1', 'n2', 'n3', 'n4']);
const LABEL = 'rel';

type Rng = ReturnType<typeof createRng>;
type Entry = { readonly patch: Patch; readonly sha: string };
type Membership = { readonly nodes: string[]; readonly edges: string[] };

/** Generator truth: the live dots of each element (the OR-set specification). */
class Truth {
  readonly nodes = new Map<string, Set<string>>();
  readonly edges = new Map<string, Set<string>>();

  membership(): Membership {
    return { nodes: liveKeys(this.nodes), edges: liveKeys(this.edges) };
  }
}

function liveKeys(map: ReadonlyMap<string, ReadonlySet<string>>): string[] {
  return [...map].filter(([, dots]) => dots.size > 0).map(([key]) => key).sort();
}

class WriterClocks {
  readonly #counters = new Map<string, number>();

  next(writer: string): Dot {
    const counter = (this.#counters.get(writer) ?? 0) + 1;
    this.#counters.set(writer, counter);
    return new Dot(writer, counter);
  }
}

function track(map: Map<string, Set<string>>, key: string, dot: string): void {
  const dots = map.get(key) ?? new Set<string>();
  dots.add(dot);
  map.set(key, dots);
}

function takeAll(map: Map<string, Set<string>>, key: string): string[] {
  const dots = [...(map.get(key) ?? [])];
  map.set(key, new Set());
  return dots;
}

function pickLive(rng: Rng, map: ReadonlyMap<string, ReadonlySet<string>>): string | null {
  const live = liveKeys(map);
  return live.length === 0 ? null : rng.pick(live);
}

function nodeOp(rng: Rng, writer: string, ctx: { truth: Truth; clocks: WriterClocks }): PatchOp {
  const victim = rng.next() < 0.35 ? pickLive(rng, ctx.truth.nodes) : null;
  if (victim !== null) {
    return new NodeRemove(victim, takeAll(ctx.truth.nodes, victim));
  }
  const node = rng.pick([...NODES]);
  const dot = ctx.clocks.next(writer);
  track(ctx.truth.nodes, node, encodeDot(dot));
  return new NodeAdd(node, dot);
}

function edgeOp(rng: Rng, writer: string, ctx: { truth: Truth; clocks: WriterClocks }): PatchOp {
  const victim = rng.next() < 0.4 ? pickLive(rng, ctx.truth.edges) : null;
  if (victim !== null) {
    const [from = '', to = ''] = victim.split('\0');
    return new EdgeRemove({ from, to, label: LABEL, observedDots: takeAll(ctx.truth.edges, victim) });
  }
  const from = rng.pick([...NODES]);
  const to = rng.pick([...NODES]);
  const dot = ctx.clocks.next(writer);
  track(ctx.truth.edges, encodeEdgeKey(from, to, LABEL), encodeDot(dot));
  return new EdgeAdd({ from, to, label: LABEL, dot });
}

function randomOp(rng: Rng, writer: string, ctx: { truth: Truth; clocks: WriterClocks }): PatchOp {
  const roll = rng.next();
  if (roll < 0.15) {
    return new NodePropSet(rng.pick([...NODES]), 'k', rng.nextInt(0, 100));
  }
  return roll < 0.6 ? nodeOp(rng, writer, ctx) : edgeOp(rng, writer, ctx);
}

function generate(seed: number, skewed: boolean): { entries: Entry[]; truth: Truth } {
  const rng = createRng(seed);
  const ctx = { truth: new Truth(), clocks: new WriterClocks() };
  const entries: Entry[] = [];
  const patchCount = rng.nextInt(8, 16);
  for (let i = 0; i < patchCount; i += 1) {
    const writer = rng.pick([...WRITERS]);
    const ops = Array.from({ length: rng.nextInt(1, 4) }, () => randomOp(rng, writer, ctx));
    const lamport = skewed ? rng.nextInt(1, 6) : i + 1;
    const sha = (i + 1).toString(16).padStart(40, '0');
    entries.push({ patch: new Patch({ writer, lamport, context: {}, ops }), sha });
  }
  return { entries, truth: ctx.truth };
}

function orders(rng: Rng, entries: readonly Entry[]): Entry[][] {
  const byWriter = [...entries].sort((a, b) => a.patch.writer.localeCompare(b.patch.writer));
  return [[...entries], byWriter, [...entries].reverse(), rng.shuffle([...entries]), rng.shuffle([...entries])];
}

type MembershipSource = { readonly nodeAlive: { elements(): readonly string[] }; readonly edgeAlive: { elements(): readonly string[] } };

function stateMembership(state: WarpState | MembershipSource): Membership {
  return { nodes: [...state.nodeAlive.elements()].sort(), edges: [...state.edgeAlive.elements()].sort() };
}

async function collect(source: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const item of source) {
    out.push(item);
  }
  return out.sort();
}

async function sessionReplay(order: readonly Entry[]): Promise<{ membership: Membership; receipts: TickReceipt[] }> {
  const session = await StateSession.open({
    nodeAliveRootOid: null,
    edgeAliveRootOid: null,
    store: new InMemoryTrieStore(),
    codec: cborCodec,
    geometry: TrieGeometry.default16way(),
  });
  const frame = new ReducerSessionFrame({
    session, prop: new Map(), observedFrontier: VersionVector.empty(), edgeBirthEvent: new Map(),
  });
  const result = await reducePatchesInSession(order, frame, { receipts: true });
  const membership = { nodes: await collect(session.scanNodes()), edges: await collect(session.scanEdges()) };
  await session.close();
  return { membership, receipts: result.receipts };
}

function outcomes(receipts: readonly TickReceipt[]): string[] {
  return receipts.flatMap((r) => r.ops.map((op) => `${r.patchSha}:${op.op}:${op.target}:${op.result}`));
}

function checkpointRoundTrip(state: WarpState): WarpState {
  const bytes = serializeFullState(state, { codec: cborCodec });
  return deserializeFullState(bytes, { codec: cborCodec, lifecycle: new CborFullStateLifecycleDecoder(cborCodec) });
}

describe('replay-order agreement for well-formed removes (#1119)', () => {
  for (const skewed of [false, true]) {
    for (const seed of SEEDS) {
      it(`seed ${String(seed)}${skewed ? ' with skewed clocks' : ''}: every reducer path matches the OR-set spec`, async () => {
        const { entries, truth } = generate(seed, skewed);
        const spec = truth.membership();
        for (const order of orders(createRng(seed ^ 0x5eed), entries)) {
          const memory = reducePatches(order, undefined, { receipts: true });
          const session = await sessionReplay(order);
          expect(stateMembership(memory.state), `seed ${String(seed)} in-memory`).toEqual(spec);
          expect(session.membership, `seed ${String(seed)} session`).toEqual(spec);
          expect(outcomes(session.receipts), `seed ${String(seed)} receipts`).toEqual(outcomes(memory.receipts));
          expect(stateMembership(checkpointRoundTrip(memory.state))).toEqual(spec);
          const half = Math.floor(order.length / 2);
          const joined = joinStates(reducePatches(order.slice(0, half)), reducePatches(order.slice(half)));
          expect(stateMembership(joined), `seed ${String(seed)} join`).toEqual(spec);
        }
      });
    }
  }

  for (const seed of GIT_SEEDS) {
    it(`seed ${String(seed)}: plain and receipts materialize on Git storage match the spec`, { timeout: 60000 }, async () => {
      const { entries, truth } = generate(seed, true);
      const seen = await inGitRepo(`remove-order-${String(seed)}`, async (cwd) => {
        await appendJournalOnly(cwd, entries.map((entry) => entry.patch));
        return await withGitStorageHost(cwd, 'reader', async (host) => {
          const plain = stateMembership(await host.materialize());
          const receipts = stateMembership((await host.materialize({ receipts: true })).state);
          return { plain, receipts };
        });
      });
      expect(seen.plain).toEqual(truth.membership());
      expect(seen.receipts).toEqual(truth.membership());
    });
  }
});

// ── #1153: sessions that start from a state the in-memory reducer left ────────

/** Every split of an order: the base holds `order[0:k]`, the rest arrives after it. */
function splits(length: number): number[] {
  return Array.from({ length: length - 1 }, (_, index) => index + 1);
}

function holdsFloatingTombstone(state: WarpState): boolean {
  const floating = FloatingTombstones.of(state);
  return [...floating.nodeDots(), ...floating.edgeDots()].length > 0;
}

async function bridgeReduce(
  store: InMemoryTrieStore,
  base: WarpState,
  patches: readonly Entry[],
  roots?: MaterializeSessionOpen,
): Promise<{ readonly state: WarpState; readonly roots: MaterializeSessionOpen }> {
  const reduced = await reduceSessionBackedState({
    openStateSession: async (open, options: { readonly workspace: MaterializationWorkspacePort }) =>
      await StateSession.open({
        ...open, store, codec: cborCodec, geometry: TrieGeometry.default16way(), workspace: options.workspace,
      }),
    materializations: new InMemoryMaterializationStore(),
    coordinate: new MaterializationCoordinate({ frontier: new Map([['abe', 'f'.repeat(40)]]), ceiling: null }),
    patches: patches.map((entry) => new PatchEntry(entry)),
    baseState: base,
    ...(roots === undefined ? {} : { roots }),
    receipts: false,
    wantDiff: false,
  });
  const reopen = materializationSessionOpen(reduced.roots);
  if (reopen === null) { throw new Error('the session left no reopenable roots'); }
  return { state: reduced.state, roots: reopen };
}

/** What point reads such as `hasNode` see: the retained trie, reopened, probed for every element. */
async function pointMembership(store: InMemoryTrieStore, roots: MaterializeSessionOpen, truth: Truth): Promise<Membership> {
  const session = await StateSession.open({ ...roots, store, codec: cborCodec, geometry: TrieGeometry.default16way() });
  const nodes: string[] = [];
  for (const node of NODES) {
    if (await session.nodeContains(node)) { nodes.push(node); }
  }
  const edges: string[] = [];
  for (const edge of truth.edges.keys()) {
    if (await session.edgeContains(edge)) { edges.push(edge); }
  }
  return { nodes: nodes.sort(), edges: edges.sort() };
}

/** Sync carries no canonical-only property op; membership does not depend on one. */
function membershipOnly(entry: Entry): Entry {
  const ops = entry.patch.ops.filter((op) => !(op instanceof NodePropSet));
  return { patch: new Patch({ writer: entry.patch.writer, lamport: entry.patch.lamport, context: {}, ops }), sha: entry.sha };
}

function syncResponseOf(prefix: readonly Entry[]) {
  const patches = prefix.map(membershipOnly).map(({ patch, sha }) => ({ writerId: patch.writer, sha, patch }));
  const frontier = Object.fromEntries(patches.map(({ writerId, sha }) => [writerId, sha]));
  return { type: 'sync-response' as const, frontier, patches };
}

async function appendInOrder(cwd: string, patches: readonly Entry[]): Promise<void> {
  const tips = new Map<string, string>();
  for (const { patch } of patches) {
    tips.set(patch.writer, await appendJournalPatch(cwd, patch, tips.get(patch.writer) ?? null));
  }
}

/** Bounded node reads: the nodes answered alive, the nodes answered at all, and the read kinds. */
type BoundedReads = { readonly alive: string[]; readonly answered: string[]; readonly kinds: string[] };

async function boundedReads(host: GitStorageHost): Promise<BoundedReads> {
  const alive: string[] = [];
  const answered: string[] = [];
  const kinds = new Set<string>();
  for (const node of NODES) {
    try {
      const read = await host.worldline().optic().node(node).read();
      answered.push(node);
      kinds.add(read.readIdentity.kind);
      if (read.alive) { alive.push(node); }
    } catch (error) {
      // A typed refusal is the bounded read's documented limit, never an answer.
      if (!(error instanceof QueryError) || error.code !== 'E_OPTIC_NO_BOUNDED_BASIS') { throw error; }
    }
  }
  return { alive, answered, kinds: [...kinds] };
}

type HostReads = { readonly bounded: BoundedReads; readonly materialized: Membership; readonly hasNode: string[] };

async function hostReads(host: GitStorageHost): Promise<HostReads> {
  const bounded = await boundedReads(host);
  const materialized = stateMembership(await host.materialize());
  const hasNode: string[] = [];
  for (const node of NODES) {
    if (await host.hasNode(node)) { hasNode.push(node); }
  }
  return { bounded, materialized, hasNode };
}

describe('replay-order agreement for a session that starts from a sync-applied state (#1153)', () => {
  it('the corpus holds sync-applied bases with a tombstone that no entry holds', () => {
    const seedsWithFloatingBases: string[] = [];
    for (const skewed of [false, true]) {
      for (const seed of SEEDS) {
        const { entries } = generate(seed, skewed);
        const found = orders(createRng(seed ^ 0x5eed), entries).some((order) =>
          splits(order.length).some((k) => holdsFloatingTombstone(reducePatches(order.slice(0, k)))));
        if (found) { seedsWithFloatingBases.push(`${String(seed)}${skewed ? '/skewed' : ''}`); }
      }
    }
    // Counted at the commit that adds this test: 23 of the 24 seed and clock pairs.
    expect(seedsWithFloatingBases.length, seedsWithFloatingBases.join(' ')).toBeGreaterThanOrEqual(23);
  });

  for (const skewed of [false, true]) {
    for (const seed of SEEDS) {
      it(`seed ${String(seed)}${skewed ? ' with skewed clocks' : ''}: seeded and resumed sessions match the OR-set spec`, async () => {
        const { entries, truth } = generate(seed, skewed);
        const spec = truth.membership();
        for (const [index, order] of orders(createRng(seed ^ 0x5eed), entries).entries()) {
          for (const k of splits(order.length)) {
            const label = `seed ${String(seed)} order ${String(index)} split ${String(k)}`;
            const base = reducePatches(order.slice(0, k));
            const store = new InMemoryTrieStore();
            const seeded = await bridgeReduce(store, base, order.slice(k));
            expect(stateMembership(seeded.state), `${label} seeded`).toEqual(spec);
            expect(await pointMembership(store, seeded.roots, truth), `${label} seeded point reads`).toEqual(spec);
            const middle = k + Math.floor((order.length - k) / 2);
            const first = await bridgeReduce(store, base, order.slice(k, middle));
            const resumed = await bridgeReduce(store, first.state, order.slice(middle), first.roots);
            expect(stateMembership(resumed.state), `${label} resumed`).toEqual(spec);
            expect(await pointMembership(store, resumed.roots, truth), `${label} resumed point reads`).toEqual(spec);
          }
        }
      });
    }
  }

  for (const seed of GIT_SEEDS) {
    it(`seed ${String(seed)}: a Git host that syncs a prefix, checkpoints and then fetches the rest agrees on every read`, { timeout: 300000 }, async () => {
      const { entries, truth } = generate(seed, true);
      const spec = truth.membership();
      let answeredReads = 0;
      for (const [index, order] of orders(createRng(seed ^ 0x5eed), entries).entries()) {
        const half = Math.floor(order.length / 2);
        const seen = await inGitRepo(`seeded-order-${String(seed)}-${String(index)}`, async (cwd) => {
          await withGitStorageHost(cwd, 'bea', async (host) => {
            await (await host.createPatch()).addNode('x').commit();
            await host.materialize();
            await host._syncController.applySyncResponse(syncResponseOf(order.slice(0, half)));
            await host.createCheckpoint();
          });
          await appendInOrder(cwd, order.slice(half));
          return await withGitStorageHost(cwd, 'reader', async (host) => await hostReads(host));
        });
        answeredReads += seen.bounded.answered.length;
        expect({
          bounded: seen.bounded.alive,
          kinds: seen.bounded.kinds,
          materialized: seen.materialized,
          hasNode: seen.hasNode,
        }, `seed ${String(seed)} order ${String(index)} split ${String(half)}`).toEqual({
          bounded: spec.nodes.filter((node) => seen.bounded.answered.includes(node)),
          kinds: seen.bounded.answered.length === 0 ? [] : ['checkpoint-tail-read'],
          materialized: { nodes: [...spec.nodes, 'x'].sort(), edges: spec.edges },
          hasNode: spec.nodes,
        });
      }
      expect(answeredReads, `seed ${String(seed)}: bounded reads that answered`).toBeGreaterThan(0);
    });
  }
});
