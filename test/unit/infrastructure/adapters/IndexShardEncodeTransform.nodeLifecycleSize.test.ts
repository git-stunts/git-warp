/**
 * Pins what the node lifecycle shard family costs per node, so the point at
 * which its largest shard reaches the checkpoint index shard limits is a
 * number that can be checked rather than extrapolated from a scratch run.
 *
 * Fixed input: 10,000 nodes named `node:000000` onwards, one writer, a
 * 40-hex patch sha, two properties per node. `once`: each node added and
 * written. `removed`: each node added, written and then removed, never added
 * again, which is the costliest record (birth, one pending remove and two
 * registers). The logical `meta_XX` shards of the `once` state are measured
 * beside them, because both families share the same 256 shard keys and the
 * same limits (`MATERIALIZATION_INDEX_SHARD_LIMITS`).
 */

import { describe, expect, it } from 'vitest';
import type { IndexShard } from '../../../../src/domain/artifacts/IndexShard.ts';
import { Dot, encodeDot } from '../../../../src/domain/crdt/Dot.ts';
import { MATERIALIZATION_INDEX_SHARD_LIMITS } from '../../../../src/domain/materialization/MaterializationIndexProfile.ts';
import { applyPatchOp, createEmptyState } from '../../../../src/domain/services/JoinReducer.ts';
import LogicalIndexBuildService from '../../../../src/domain/services/index/LogicalIndexBuildService.ts';
import NodeLifecycleIndexBuilder from '../../../../src/domain/services/index/NodeLifecycleIndexBuilder.ts';
import { isNodeLifecycleShardPath } from '../../../../src/domain/services/index/NodeLifecycleShardReader.ts';
import type WarpState from '../../../../src/domain/services/state/WarpState.ts';
import WarpStream from '../../../../src/domain/stream/WarpStream.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import NodeRemove from '../../../../src/domain/types/ops/NodeRemove.ts';
import PropSet from '../../../../src/domain/types/ops/PropSet.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import { IndexShardEncodeTransform } from '../../../../src/infrastructure/adapters/IndexShardEncodeTransform.ts';
import codec from '../../../../src/infrastructure/codecs/CborCodec.ts';

const NODES = 10_000;
const SHA = 'a'.repeat(40);
const META_SHARD_PATH = /^meta_[0-9a-f]{2}\.cbor$/u;

type Shape = 'once' | 'removed';

type LargestShard = Readonly<{ bytes: number; nodes: number; items: number }>;

function build(shape: Shape): WarpState {
  const state = createEmptyState();
  let lamport = 0;
  const next = (): EventId => new EventId(++lamport, 'w', SHA, 0);
  for (let index = 0; index < NODES; index += 1) {
    const node = `node:${String(index).padStart(6, '0')}`;
    const dot = Dot.create('w', index + 1);
    applyPatchOp(state, new NodeAdd(node, dot), next());
    applyPatchOp(state, new PropSet(node, 'name', `n${String(index)}`), next());
    applyPatchOp(state, new PropSet(node, 'kind', 'thing'), next());
    if (shape === 'removed') {
      applyPatchOp(state, new NodeRemove(node, [encodeDot(dot)]), next());
    }
  }
  return state;
}

async function encoded(shards: Iterable<IndexShard>): Promise<ReadonlyMap<string, Uint8Array>> {
  const members = new Map<string, Uint8Array>();
  for await (const [path, bytes] of WarpStream.from(shards).pipe(new IndexShardEncodeTransform(codec))) {
    members.set(path, bytes);
  }
  return members;
}

/** Every CBOR data item, counted as the bounded validator counts them: containers, map keys and scalars alike. */
function itemCount(value: object | string | number | boolean | null): number {
  if (Array.isArray(value)) {
    return 1 + value.reduce((total: number, child: object | string | number | boolean | null) => total + itemCount(child), 0);
  }
  if (value !== null && typeof value === 'object') {
    return 1 + Object.values(value).reduce(
      (total: number, child: object | string | number | boolean | null) => total + 1 + itemCount(child),
      0,
    );
  }
  return 1;
}

function largest(
  members: ReadonlyMap<string, Uint8Array>,
  include: (path: string) => boolean,
  nodesIn: (bytes: Uint8Array) => number,
): LargestShard {
  let found: LargestShard = { bytes: 0, nodes: 0, items: 0 };
  for (const [path, bytes] of members) {
    if (include(path) && bytes.length > found.bytes) {
      found = { bytes: bytes.length, nodes: nodesIn(bytes), items: itemCount(codec.decode<object>(bytes)) };
    }
  }
  return found;
}

function lifecycleNodes(bytes: Uint8Array): number {
  return codec.decode<{ entries: readonly object[] }>(bytes).entries.length;
}

function metaNodes(bytes: Uint8Array): number {
  return Object.keys(codec.decode<{ nodeToGlobal: object }>(bytes).nodeToGlobal).length;
}

async function largestLifecycleShard(shape: Shape): Promise<LargestShard> {
  const members = await encoded(NodeLifecycleIndexBuilder.fromState(build(shape)).yieldShards());
  return largest(members, isNodeLifecycleShardPath, lifecycleNodes);
}

describe('node lifecycle shard size at 10,000 nodes', () => {
  // A live record is 25 CBOR items and a removed one 30, plus 5 for the
  // shard envelope; the largest shard holds 50 of the 10,000 nodes.
  it('pins the largest lifecycle shard when every node is live', async () => {
    await expect(largestLifecycleShard('once')).resolves.toEqual({ bytes: 8_828, nodes: 50, items: 1_255 });
  });

  it('pins the largest lifecycle shard when every node was removed and never added again', async () => {
    await expect(largestLifecycleShard('removed')).resolves.toEqual({ bytes: 11_278, nodes: 50, items: 1_505 });
  });

  it('pins the largest logical meta shard of the same live graph', async () => {
    const members = await encoded(new LogicalIndexBuildService().buildLogicalIndexBuilder(build('once')).yieldShards());
    expect(largest(members, (path) => META_SHARD_PATH.test(path), metaNodes)).toEqual({ bytes: 1_058, nodes: 50, items: 389 });
  });
});

describe('node lifecycle shard ceiling', () => {
  /** Removed nodes whose 40-hex ids all route to the `aa` shard key. */
  function removedInOneShard(count: number): WarpState {
    const state = createEmptyState();
    let lamport = 0;
    const next = (): EventId => new EventId(++lamport, 'w', SHA, 0);
    for (let index = 0; index < count; index += 1) {
      const node = `aa${index.toString(16).padStart(38, '0')}`;
      const dot = Dot.create('w', index + 1);
      applyPatchOp(state, new NodeAdd(node, dot), next());
      applyPatchOp(state, new PropSet(node, 'name', 'n'), next());
      applyPatchOp(state, new PropSet(node, 'kind', 'thing'), next());
      applyPatchOp(state, new NodeRemove(node, [encodeDot(dot)]), next());
    }
    return state;
  }

  /**
   * Encodes the family with the index root's structure limits, as the index
   * writer does, and returns each member's byte length. The writer checks
   * the 16 MiB byte limit separately, after encoding.
   */
  async function encodeWithinIndexLimits(state: WarpState): Promise<ReadonlyMap<string, number>> {
    const transform = new IndexShardEncodeTransform(codec, MATERIALIZATION_INDEX_SHARD_LIMITS);
    const sizes = new Map<string, number>();
    for await (const [path, bytes] of WarpStream.from(NodeLifecycleIndexBuilder.fromState(state).yieldShards()).pipe(transform)) {
      sizes.set(path, bytes.length);
    }
    return sizes;
  }

  // (2,000,000 - 5) / 30 = 66,666 removed-node records fit one shard under
  // the item limit. With 40-hex node ids that shard is already past 16 MiB
  // (about 261 bytes a record), so for these records the byte limit binds
  // first, near 64,000; with the 11-character ids above (about 226 bytes a
  // record) the item limit binds first.
  it('admits one shard of 66,666 removed-node records under the item limit', async () => {
    const sizes = await encodeWithinIndexLimits(removedInOneShard(66_666));
    expect([...sizes.keys()]).toEqual(['life_aa.cbor', 'life_receipt.cbor']);
    expect(sizes.get('life_aa.cbor')).toBe(17_401_841);
    expect(sizes.get('life_aa.cbor')).toBeGreaterThan(MATERIALIZATION_INDEX_SHARD_LIMITS.maxBytes);
  }, 60_000);

  it('refuses one shard of 66,667 removed-node records', async () => {
    await expect(encodeWithinIndexLimits(removedInOneShard(66_667))).rejects.toMatchObject({
      code: 'E_INDEX_SHARD_MALFORMED',
      context: { reason: 'decoded item count exceeds the configured maximum' },
    });
  }, 60_000);
});
