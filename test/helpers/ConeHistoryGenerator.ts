import PatchEntry from '../../src/domain/artifacts/PatchEntry.ts';
import { Dot } from '../../src/domain/crdt/Dot.ts';
import { applyFast } from '../../src/domain/services/JoinReducer.ts';
import { encodeEdgeKey, encodeLegacyEdgePropNode } from '../../src/domain/services/KeyCodec.ts';
import WarpState from '../../src/domain/services/state/WarpState.ts';
import BlobValue from '../../src/domain/types/ops/BlobValue.ts';
import EdgeAdd from '../../src/domain/types/ops/EdgeAdd.ts';
import EdgePropSet from '../../src/domain/types/ops/EdgePropSet.ts';
import EdgeRemove from '../../src/domain/types/ops/EdgeRemove.ts';
import NodeAdd from '../../src/domain/types/ops/NodeAdd.ts';
import NodePropSet from '../../src/domain/types/ops/NodePropSet.ts';
import NodeRemove from '../../src/domain/types/ops/NodeRemove.ts';
import PropSet from '../../src/domain/types/ops/PropSet.ts';
import type { PatchOp } from '../../src/domain/types/ops/unions.ts';
import EntityAdmissionBoundary from '../../src/domain/types/EntityAdmissionBoundary.ts';
import EntityAdmissionOrigin from '../../src/domain/types/EntityAdmissionOrigin.ts';
import Patch from '../../src/domain/types/Patch.ts';
import { createRng } from './seededRng.ts';

type Rng = ReturnType<typeof createRng>;

/** Shape of one generated multi-writer history. */
export type ConeHistoryShape = {
  readonly writers: number;
  readonly patches: number;
  readonly nodes: number;
  readonly maxOps: number;
  /** Probability that a writer first observes another writer's chain. */
  readonly syncChance: number;
};

/** A generated history: each writer's chain in order, plus the element universe. */
export type ConeHistory = {
  readonly seed: number;
  readonly chains: ReadonlyMap<string, readonly PatchEntry[]>;
  readonly nodeIds: readonly string[];
  readonly edgeKeys: readonly string[];
  readonly opCounts: ReadonlyMap<string, number>;
};

type Writer = {
  readonly id: string;
  readonly view: WarpState;
  readonly seen: Set<string>;
  readonly chain: PatchEntry[];
  clock: number;
  counter: number;
};

const LABELS = ['links', 'cites'];
/** Probability that a generated patch also admits one entity (a NodeAdd plus its payload, with its boundary). */
const ENTITY_CHANCE = 0.3;
const KEYS = ['title', 'score'];

/**
 * Generates multi-writer histories the way independent clones produce them.
 *
 * Each writer keeps its own reduced view of the patches it has observed, so
 * removes name the dots that writer actually saw (including other writers'
 * adds, which a fold may receive after the remove), properties race under
 * LWW between writers that have not synced, nodes are cleared and re-added,
 * and legacy `PropSet` forms appear beside canonical ones.
 */
export default class ConeHistoryGenerator {
  readonly #rng: Rng;
  readonly #shape: ConeHistoryShape;
  readonly #seed: number;
  readonly #nodeIds: readonly string[];
  readonly #opCounts = new Map<string, number>();
  #shas = 0;

  constructor(seed: number, shape: ConeHistoryShape) {
    this.#seed = seed;
    this.#rng = createRng(seed);
    this.#shape = shape;
    this.#nodeIds = Array.from({ length: shape.nodes }, (_unused, index) => `n${index}`);
  }

  generate(): ConeHistory {
    const writers = Array.from({ length: this.#shape.writers }, (_unused, index): Writer => ({
      id: `w${index}`, view: WarpState.empty(), seen: new Set(), chain: [], clock: 0, counter: 0,
    }));
    for (let index = 0; index < this.#shape.patches; index += 1) {
      const writer = this.#rng.pick(writers);
      if (this.#rng.next() < this.#shape.syncChance) {
        this.#sync(writer, this.#rng.pick(writers));
      }
      this.#commit(writer);
    }
    const edgeKeys = this.#nodeIds.flatMap((from) => this.#nodeIds.flatMap((to) => LABELS.map((label) => encodeEdgeKey(from, to, label))));
    return {
      seed: this.#seed,
      chains: new Map(writers.map((writer) => [writer.id, writer.chain])),
      nodeIds: this.#nodeIds,
      edgeKeys,
      opCounts: this.#opCounts,
    };
  }

  #sync(writer: Writer, other: Writer): void {
    for (const entry of other.chain) {
      if (!writer.seen.has(entry.sha)) {
        writer.seen.add(entry.sha);
        applyFast(writer.view, entry.patch, entry.sha);
        writer.clock = Math.max(writer.clock, entry.patch.lamport);
      }
    }
  }

  #commit(writer: Writer): void {
    const count = this.#rng.nextInt(1, this.#shape.maxOps + 1);
    const ops = Array.from({ length: count }, () => this.#op(writer));
    const entityAdmissions = this.#rng.next() < ENTITY_CHANCE ? [this.#entity(writer, ops)] : [];
    writer.clock += 1;
    this.#shas += 1;
    const sha = (this.#seed >>> 0).toString(16).padStart(8, '0') + this.#shas.toString(16).padStart(32, '0');
    const patch = new Patch({ writer: writer.id, lamport: writer.clock, context: {}, ops, entityAdmissions });
    const entry = new PatchEntry({ patch, sha });
    writer.chain.push(entry);
    writer.seen.add(sha);
    applyFast(writer.view, entry.patch, sha);
  }

  /** Appends one supplied-subject entity admission to `ops` and returns its boundary. */
  #entity(writer: Writer, ops: PatchOp[]): EntityAdmissionBoundary {
    this.#opCounts.set('entity', (this.#opCounts.get('entity') ?? 0) + 1);
    writer.counter += 1;
    const subject = this.#node();
    const operationIndex = ops.length;
    ops.push(new NodeAdd(subject, new Dot(writer.id, writer.counter)), new NodePropSet(subject, 'kind', this.#value()));
    return new EntityAdmissionBoundary({ operationIndex, operationCount: 2, origin: EntityAdmissionOrigin.suppliedSubject() });
  }

  #op(writer: Writer): PatchOp {
    const kinds = ['nodeAdd', 'nodeAdd', 'nodeRemove', 'edgeAdd', 'edgeAdd', 'edgeRemove', 'nodeProp', 'nodeProp', 'edgeProp', 'blob'];
    const kind = this.#rng.pick(kinds);
    this.#opCounts.set(kind, (this.#opCounts.get(kind) ?? 0) + 1);
    if (kind === 'nodeAdd') {
      writer.counter += 1;
      return new NodeAdd(this.#node(), new Dot(writer.id, writer.counter));
    }
    if (kind === 'nodeRemove') {
      const node = this.#node();
      return new NodeRemove(node, [...writer.view.nodeAlive.getDots(node)]);
    }
    if (kind === 'edgeAdd' || kind === 'edgeRemove') {
      return this.#edgeOp(writer, kind);
    }
    if (kind === 'nodeProp') {
      return this.#nodeProp();
    }
    if (kind === 'edgeProp') {
      return this.#edgeProp();
    }
    return new BlobValue(this.#node(), 'b'.repeat(40));
  }

  #edgeOp(writer: Writer, kind: string): PatchOp {
    const [from, to, label] = this.#edge();
    if (kind === 'edgeAdd') {
      writer.counter += 1;
      return new EdgeAdd({ from, to, label, dot: new Dot(writer.id, writer.counter) });
    }
    const observedDots = [...writer.view.edgeAlive.getDots(encodeEdgeKey(from, to, label))];
    return new EdgeRemove({ from, to, label, observedDots });
  }

  #nodeProp(): PatchOp {
    const node = this.#node();
    const key = this.#rng.pick(KEYS);
    const value = this.#value();
    return this.#rng.next() < 0.5 ? new NodePropSet(node, key, value) : new PropSet(node, key, value);
  }

  #edgeProp(): PatchOp {
    const [from, to, label] = this.#edge();
    const key = this.#rng.pick(KEYS);
    const value = this.#value();
    return this.#rng.next() < 0.5
      ? new EdgePropSet({ from, to, label, key, value })
      : new PropSet(encodeLegacyEdgePropNode(from, to, label), key, value);
  }

  #node(): string {
    return this.#rng.pick([...this.#nodeIds]);
  }

  #edge(): [string, string, string] {
    return [this.#node(), this.#node(), this.#rng.pick(LABELS)];
  }

  #value(): string | number | boolean | null {
    const values: Array<string | number | boolean | null> = ['a', 'b', 1, 2, true, null];
    return values[this.#rng.nextInt(0, values.length)] ?? null;
  }
}

/** A random fold order that keeps each writer's chain order. */
export function interleave(rng: Rng, chains: ReadonlyMap<string, readonly PatchEntry[]>): PatchEntry[] {
  const cursors = [...chains.values()].map((chain) => ({ chain, next: 0 })).filter((cursor) => cursor.chain.length > 0);
  const order: PatchEntry[] = [];
  while (cursors.length > 0) {
    const index = rng.nextInt(0, cursors.length);
    const cursor = cursors[index]!;
    order.push(cursor.chain[cursor.next]!);
    cursor.next += 1;
    if (cursor.next === cursor.chain.length) {
      cursors.splice(index, 1);
    }
  }
  return order;
}
