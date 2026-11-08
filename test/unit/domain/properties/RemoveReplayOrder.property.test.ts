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
 * No clock and no ambient randomness: every history comes from a fixed seed.
 */

import { describe, expect, it } from 'vitest';
import { Dot, encodeDot } from '../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import TrieGeometry from '../../../../src/domain/orset/trie/TrieGeometry.ts';
import StateSession from '../../../../src/domain/orset/session/StateSession.ts';
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
import CborFullStateLifecycleDecoder from '../../../../src/infrastructure/adapters/CborFullStateLifecycleDecoder.ts';
import cborCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import { createRng } from '../../../helpers/seededRng.ts';
import { InMemoryTrieStore } from '../../../helpers/trieHelpers.ts';
import { appendJournalOnly, inGitRepo, withGitStorageHost } from '../../../helpers/GitStorageJournalFixture.ts';

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
