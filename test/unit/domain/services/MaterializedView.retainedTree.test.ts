/**
 * An incremental index update never changes the tree that it starts from,
 * whether it succeeds or the index store refuses a shard. The runtime keeps
 * that tree's index until a new one replaces it; on a refusal it marks the
 * index degraded and rebuilds later (`RuntimeHostIncrementalIndex.test.ts`).
 *
 * `applyDiff()` is synchronous and has no cancellation point. A refused shard
 * is the one way an update stops part-way, so the refusal case stands for
 * "cancellation leaves retained roots valid" in the #192 test plan.
 *
 * Oracle: specified. `IndexShardTreePort.withShards()` returns a new tree, and
 * the adapter refuses a malformed shard with `E_INDEX_SHARD_MALFORMED`.
 */
import { describe, it, expect } from 'vitest';
import { applyWithDiff, createEmptyState } from '../../../../src/domain/services/JoinReducer.ts';
import type { PatchLike } from '../../../../src/domain/services/JoinReducer.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import MaterializedViewService from '../../../../src/domain/services/MaterializedViewService.ts';
import computeShardKey from '../../../../src/domain/utils/shardKey.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import MockIndexStorage from '../../../helpers/MockIndexStorage.ts';

const FIRST_SHA = 'a1'.padEnd(40, '0');
const SECOND_SHA = 'a2'.padEnd(40, '0');

function patch(lamport: number, ops: PatchLike['ops']): PatchLike {
  return { writer: 'A', lamport, ops, context: VersionVector.empty() };
}

const FIRST = patch(1, [
  { type: 'NodeAdd', node: 'a', dot: Dot.create('A', 1) },
  { type: 'NodeAdd', node: 'b', dot: Dot.create('A', 2) },
  { type: 'EdgeAdd', from: 'a', to: 'b', label: 'knows', dot: Dot.create('A', 3) },
  { type: 'PropSet', node: 'a', key: 'name', value: 'Ada' },
]);
const SECOND = patch(2, [
  { type: 'NodeAdd', node: 'c', dot: Dot.create('A', 4) },
  { type: 'EdgeAdd', from: 'b', to: 'c', label: 'knows', dot: Dot.create('A', 5) },
  { type: 'PropSet', node: 'a', key: 'name', value: 'Ada L.' },
]);

/**
 * Each path's bytes as hex. Hex is one-to-one, so equal snapshots mean equal
 * bytes; it also copies, where `Buffer#slice` would share memory.
 */
function bytesByPath(tree: Readonly<Record<string, Uint8Array>>): Record<string, string> {
  return Object.fromEntries(Object.entries(tree).map(([path, bytes]) => [path, Buffer.from(bytes).toString('hex')]));
}

describe('incremental index update and the tree it starts from', () => {
  it('leaves the existing tree unchanged when it applies a diff', () => {
    const service = new MaterializedViewService({ indexStore: new MockIndexStorage() });
    const state = createEmptyState();
    applyWithDiff(state, FIRST, FIRST_SHA);
    const existingTree = service.build(state).tree;
    const before = bytesByPath(existingTree);
    const { diff } = applyWithDiff(state, SECOND, SECOND_SHA);

    service.applyDiff({ existingTree, diff, state });

    expect(bytesByPath(existingTree)).toEqual(before);
  });

  it('refuses a diff over a malformed property shard and leaves the existing tree unchanged', () => {
    const service = new MaterializedViewService({ indexStore: new MockIndexStorage() });
    const state = createEmptyState();
    applyWithDiff(state, FIRST, FIRST_SHA);
    const propsPath = `props_${computeShardKey('a')}.cbor`;
    const existingTree = { ...service.build(state).tree, [propsPath]: defaultCodec.encode([['a', 'not a bag']]) };
    const before = bytesByPath(existingTree);
    const { diff } = applyWithDiff(state, SECOND, SECOND_SHA);

    const update = (): unknown => service.applyDiff({ existingTree, diff, state });

    expect(update).toThrow(expect.objectContaining({
      code: 'E_INDEX_SHARD_MALFORMED',
      context: { path: propsPath, reason: 'legacy property bag must be an object' },
    }));
    expect(bytesByPath(existingTree)).toEqual(before);
  });
});
