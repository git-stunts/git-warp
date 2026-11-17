/**
 * Byte-compatibility witness for the index tree that a full build writes.
 *
 * Builds the empty state and three non-empty states through
 * `MaterializedViewService.build()` and digests each tree: every path, its
 * byte length and its bytes, in path order.
 *
 * Oracle: change detection. The digests were recorded on main `3100d3e9a`,
 * where `build()` encoded shards in core with the P5-LEGACY bridge
 * (`shardToEntry`), before #228 moved that encode behind `IndexStorePort`.
 *
 * Scope: the test fails when a byte of a shard that these four states produce
 * changes. The states cover the shard kinds a full build writes (meta, edge,
 * label, property and receipt), most of the 256 shard keys, hex SHA node IDs
 * (keyed by their first two characters), removed nodes and edges, a removed
 * node whose register stays visible, and every property value kind. It says
 * nothing about other states.
 */
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { createEmptyState, reducePatches } from '../../../../src/domain/services/JoinReducer.ts';
import { Dot, encodeDot } from '../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import MaterializedViewService from '../../../../src/domain/services/MaterializedViewService.ts';
import type WarpState from '../../../../src/domain/services/state/WarpState.ts';
import type { PropValue } from '../../../../src/domain/types/PropValue.ts';
import MockIndexStorage from '../../../helpers/MockIndexStorage.ts';

/** One reducer input: a patch and the SHA of its commit. */
type Entry = Parameters<typeof reducePatches>[0][number];
type Op = Entry['patch']['ops'][number];

const LABELS = ['knows', 'manages', 'owns'];
const WIDE_NODE_COUNT = 300;

/** Records one-op patches of one writer and remembers the add dot of each element. */
class History {
  readonly #writer: string;
  readonly #entries: Entry[] = [];
  readonly #addDots = new Map<string, Dot>();

  constructor(writer: string) {
    this.#writer = writer;
  }

  addNode(node: string): this {
    const dot = this.#nextDot();
    this.#addDots.set(`node:${node}`, dot);
    return this.#push({ type: 'NodeAdd', node, dot });
  }

  removeNode(node: string): this {
    return this.#push({ type: 'NodeRemove', node, observedDots: [this.#observed(`node:${node}`)] });
  }

  addEdge(from: string, to: string, label: string): this {
    const dot = this.#nextDot();
    this.#addDots.set(`edge:${from}:${to}:${label}`, dot);
    return this.#push({ type: 'EdgeAdd', from, to, label, dot });
  }

  removeEdge(from: string, to: string, label: string): this {
    return this.#push({ type: 'EdgeRemove', from, to, label, observedDots: [this.#observed(`edge:${from}:${to}:${label}`)] });
  }

  setProperty(node: string, key: string, value: PropValue): this {
    return this.#push({ type: 'PropSet', node, key, value });
  }

  state(): WarpState {
    return reducePatches(this.#entries);
  }

  #nextDot(): Dot {
    return Dot.create(this.#writer, this.#entries.length + 1);
  }

  #observed(key: string): string {
    const dot = this.#addDots.get(key);
    if (dot === undefined) {
      throw new Error(`no add dot recorded for ${key}`);
    }
    return encodeDot(dot);
  }

  #push(op: Op): this {
    const lamport = this.#entries.length + 1;
    this.#entries.push({
      sha: lamport.toString(16).padStart(40, '0'),
      patch: { writer: this.#writer, lamport, ops: [op], context: VersionVector.empty() },
    });
    return this;
  }
}

/** 300 FNV-keyed nodes on a ring with chords, each with two properties. */
function wideGraph(): WarpState {
  const history = new History('wide');
  const nodes = Array.from({ length: WIDE_NODE_COUNT }, (_, i) => `node:${String(i)}`);
  for (const node of nodes) {
    history.addNode(node);
  }
  nodes.forEach((node, i) => {
    history.addEdge(node, nodes[(i + 1) % WIDE_NODE_COUNT] ?? node, LABELS[i % LABELS.length] ?? 'knows');
    history.addEdge(node, nodes[(i * 7 + 3) % WIDE_NODE_COUNT] ?? node, LABELS[(i + 1) % LABELS.length] ?? 'owns');
    history.setProperty(node, 'rank', i);
    history.setProperty(node, 'name', `Node ${String(i)}`);
  });
  return history.state();
}

/** Hex SHA node IDs, which shard by their first two characters, in both cases. */
function hexIdGraph(): WarpState {
  const ids = [
    'ABCDEF0123456789abcdef0123456789ABCDEF01',
    'abcdef0123456789abcdef0123456789abcdef02',
    '0f'.repeat(32),
    'E3'.repeat(32),
    'not-a-sha-but-similar-0123456789abcdef0',
  ];
  const history = new History('hex');
  for (const id of ids) {
    history.addNode(id);
  }
  ids.forEach((id, i) => {
    history.addEdge(id, ids[(i + 1) % ids.length] ?? id, 'next');
    history.setProperty(id, 'sha', id);
  });
  history.addEdge(ids[0] ?? '', ids[0] ?? '', 'self');
  return history.state();
}

/** Removals, a re-add, prototype-shaped IDs and every property value kind. */
function tombstoneGraph(): WarpState {
  return new History('tomb')
    .addNode('A').addNode('B').addNode('C').addNode('__proto__').addNode('constructor').addNode('ünïcødé')
    .addEdge('A', 'B', 'knows').addEdge('A', 'B', 'manages').addEdge('B', 'C', 'owns')
    .addEdge('__proto__', 'constructor', 'knows').addEdge('C', 'A', 'knows')
    .setProperty('A', 'string', 'Alice').setProperty('A', 'empty', '').setProperty('A', 'number', 42)
    .setProperty('A', 'float', 1.5).setProperty('A', 'bool', true).setProperty('A', 'null', null)
    .setProperty('A', 'bytes', new Uint8Array([1, 2, 3])).setProperty('A', 'list', ['x', 1])
    .setProperty('A', 'map', { nested: 'v' }).setProperty('__proto__', 'polluted', 'no')
    .setProperty('C', 'color', 'red')
    .removeEdge('A', 'B', 'manages')
    .removeNode('C')
    .setProperty('C', 'after', 'visible register on a removed node')
    .addNode('C')
    .removeNode('B')
    .state();
}

function digestTree(tree: Readonly<Record<string, Uint8Array>>): string {
  const hash = createHash('sha256');
  for (const path of Object.keys(tree).sort()) {
    const bytes = tree[path];
    if (bytes === undefined) {
      throw new Error(`missing tree entry ${path}`);
    }
    hash.update(path).update('\0').update(String(bytes.byteLength)).update('\0').update(bytes);
  }
  return hash.digest('hex');
}

function builtTree(state: WarpState): Readonly<Record<string, Uint8Array>> {
  return new MaterializedViewService({ indexStore: new MockIndexStorage() }).build(state).tree;
}

const CASES: ReadonlyArray<readonly [string, () => WarpState, number, string]> = [
  ['empty graph', createEmptyState, 2, '3dc92a45ee32573b2ea37400a84c4e1f06dda3b8bf402c7763c1db956e48eb03'],
  ['300 FNV-keyed nodes', wideGraph, 674, '17e91ac0f0c21d9b14daca2d226a39d5fb63544a4df4401b7ca63fd2657cb6cf'],
  ['hex SHA node IDs', hexIdGraph, 18, '770d34680c98c6fb578c8056cb0985389b152c5133f22d02d150434d0f420b6c'],
  ['removals and every property value kind', tombstoneGraph, 14, '06d8af926adc0e48cfaa71ef154709bd04c0b826e1642170aaef09441f27c64c'],
];

describe('MaterializedViewService.build byte compatibility', () => {
  it.each(CASES)('%s reproduces the recorded index tree', (_name, state, shardPaths, digest) => {
    const tree = builtTree(state());

    expect({ paths: Object.keys(tree).length, digest: digestTree(tree) }).toEqual({ paths: shardPaths, digest });
  });
});
