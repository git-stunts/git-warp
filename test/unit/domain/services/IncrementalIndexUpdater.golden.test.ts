/**
 * Byte-compatibility witness for incremental index updates.
 *
 * Applies six seeded two-writer sequences of 40 one-operation patches, each
 * built up from an empty state, through MaterializedViewService.applyDiff and
 * digests every intermediate index tree.
 *
 * Oracle: change detection. PR #1115 reports that the expected digests were
 * recorded on main `96733bfbe` with the codec-owning updater, before #192
 * moved shard encoding behind IndexStorePort. That updater is gone, so the
 * recording cannot be repeated from this tree.
 *
 * Scope: the test fails when the bytes of a shard that these six sequences
 * produce change. It says nothing about other sequences. It has no legacy
 * map-form input: every tree here is written by the current full build and the
 * current adapter encoder.
 */
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { applyWithDiff, createEmptyState } from '../../../../src/domain/services/JoinReducer.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { decodeEdgeKey } from '../../../../src/domain/services/KeyCodec.ts';
import MaterializedViewService from '../../../../src/domain/services/MaterializedViewService.ts';
import type WarpState from '../../../../src/domain/services/state/WarpState.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import MockIndexStorage from '../../../helpers/MockIndexStorage.ts';
import { createRng } from '../../../helpers/seededRng.ts';

const NODE_IDS = ['A', 'B', 'C', 'D', 'E', '__proto__', 'constructor', 'user:1'];
const LABELS = ['knows', 'manages', 'owns'];
const PROP_KEYS = ['name', 'age', 'status'];
const PROP_VALUES = ['Alice', 'Bob', 42, true, null, '', new Uint8Array([1, 2]), ['x', 1], { nested: 'v' }];
const WRITERS = ['wa', 'wb'];
const PATCH_COUNT = 40;

type GeneratedOp =
  | { readonly type: 'NodeAdd'; readonly node: string; readonly dot: Dot }
  | { readonly type: 'NodeRemove'; readonly node: string; readonly observedDots: string[] }
  | { readonly type: 'EdgeAdd'; readonly from: string; readonly to: string; readonly label: string; readonly dot: Dot }
  | { readonly type: 'EdgeRemove'; readonly from: string; readonly to: string; readonly label: string; readonly observedDots: string[] }
  | { readonly type: 'PropSet'; readonly node: string; readonly key: string; readonly value: (typeof PROP_VALUES)[number] };

function pick<T>(next: () => number, values: readonly T[]): T {
  const value = values[Math.floor(next() * values.length)];
  if (value === undefined) {
    throw new Error('pick requires a non-empty list');
  }
  return value;
}

function nextOp(next: () => number, state: WarpState, dot: Dot): GeneratedOp {
  const roll = next();
  const alive = state.nodeAlive.elements();
  const edges = state.edgeAlive.elements();
  if (roll < 0.15 && alive.length > 0) {
    const node = pick(next, alive);
    return { type: 'NodeRemove', node, observedDots: [...state.nodeAlive.getDots(node)] };
  }
  if (roll < 0.45 && alive.length >= 2) {
    return { type: 'EdgeAdd', from: pick(next, alive), to: pick(next, alive), label: pick(next, LABELS), dot };
  }
  if (roll < 0.55 && edges.length > 0) {
    const edgeKey = pick(next, edges);
    return { type: 'EdgeRemove', ...decodeEdgeKey(edgeKey), observedDots: [...state.edgeAlive.getDots(edgeKey)] };
  }
  if (roll < 0.8 && alive.length > 0) {
    return { type: 'PropSet', node: pick(next, alive), key: pick(next, PROP_KEYS), value: pick(next, PROP_VALUES) };
  }
  return { type: 'NodeAdd', node: pick(next, NODE_IDS), dot };
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

function replaySeed(seed: number): string {
  const next = createRng(seed).next;
  const service = new MaterializedViewService({ codec: defaultCodec, indexStore: new MockIndexStorage() });
  const state = createEmptyState();
  let tree = service.build(createEmptyState()).tree;
  const chain = createHash('sha256');
  for (let lamport = 1; lamport <= PATCH_COUNT; lamport++) {
    const writer = pick(next, WRITERS);
    const op = nextOp(next, state, Dot.create(writer, lamport));
    const patch = { writer, lamport, ops: [op], context: VersionVector.empty() };
    const sha = lamport.toString(16).padStart(8, '0').padEnd(40, String(seed % 10));
    const { diff } = applyWithDiff(state, patch, sha);
    tree = service.applyDiff({ existingTree: tree, diff, state }).tree;
    chain.update(digestTree(tree));
  }
  return chain.digest('hex');
}

const GOLDEN_DIGESTS: Readonly<Record<number, string>> = {
  1: 'fd9db4c4189d6d504eb26a79088b55d3be0604f4d1028149fae2504437178901',
  2: 'fb745be3a4ffe53de68fe58ed2a809fcbb3fd6e6dd63fd881c2d2bfe952482b1',
  3: 'af227747e2f880f64c64b20961c19dbe60d353deb1420a53e66a4649f34787ab',
  4: 'c15dded5ae103522a5f8afa4c42836f5b7f7275fff914b5594c4b5118d9f6ebf',
  5: '8310f60ce3616bb6b19e34cb441a8e4a30d6fc67b9c6bb2b2d8328a783ff1745',
  6: '22d73d9491fe1b37dad4e294f06b556bc676754bd35d6943404224916ecc4235',
};

describe('IncrementalIndexUpdater byte compatibility', () => {
  it.each(Object.keys(GOLDEN_DIGESTS).map(Number))('seed %d reproduces the recorded index trees', (seed) => {
    expect(replaySeed(seed)).toBe(GOLDEN_DIGESTS[seed]);
  });
});
