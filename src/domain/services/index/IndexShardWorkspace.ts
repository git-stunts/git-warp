/**
 * Mutable working set for one incremental index update.
 *
 * Loads the meta, edge, and label shards that a diff touches from an
 * `IndexShardTreePort`, inflates them into the mutable forms that the node
 * and edge updaters change, and deflates every loaded shard back into a
 * semantic `IndexShard`. It never handles shard bytes.
 *
 * @module domain/services/index/IndexShardWorkspace
 */

import IndexError from '../../errors/IndexError.ts';
import { MetaShard } from '../../artifacts/MetaShard.ts';
import { EdgeShard } from '../../artifacts/EdgeShard.ts';
import { LabelShard } from '../../artifacts/LabelShard.ts';
import type { IndexShard } from '../../artifacts/IndexShard.ts';
import type { default as IndexShardTreePort, IndexEdgeDirection } from '../../../ports/IndexShardTreePort.ts';
import { getRoaringBitmap32 } from '../../utils/roaring.ts';
import type { EdgeUpdateContext } from './IndexEdgeUpdater.ts';
import type { WorkingMetaShard, EdgeShardData } from './types.ts';

type EdgeCache = Map<string, EdgeShardData>;

/** Per-update working shards; create one for each diff. */
export default class IndexShardWorkspace {
  readonly labels: Record<string, number>;
  readonly #shards: IndexShardTreePort;
  readonly #metaCache = new Map<string, WorkingMetaShard>();
  readonly #fwdCache: EdgeCache = new Map();
  readonly #revCache: EdgeCache = new Map();
  #labelsDirty = false;
  #nextLabelId: number | null = null;

  constructor(shards: IndexShardTreePort) {
    this.#shards = shards;
    this.labels = inflateLabels(shards.readLabels());
  }

  /** Returns the working meta shard for a shard key, loading it once. */
  meta(shardKey: string): WorkingMetaShard {
    let meta = this.#metaCache.get(shardKey);
    if (meta === undefined) {
      meta = inflateMeta(this.#shards.readMeta(shardKey));
      this.#metaCache.set(shardKey, meta);
    }
    return meta;
  }

  /**
   * Returns the working edge shard for a shard key, loading it once.
   *
   * Each direction owns one cache: the updaters pass `fwdCache` with `fwd`
   * and `revCache` with `rev`, so the cache alone names the direction.
   */
  edges(cache: EdgeCache, dir: string, shardKey: string): EdgeShardData {
    let data = cache.get(shardKey);
    if (data === undefined) {
      data = inflateEdges(this.#shards.readEdges(requireEdgeDirection(dir), shardKey));
      cache.set(shardKey, data);
    }
    return data;
  }

  /** Registers a label with the next free ID when it is new. */
  ensureLabel(label: string): void {
    if (Object.prototype.hasOwnProperty.call(this.labels, label)) {
      return;
    }
    const id = this.#nextLabelId ?? nextFreeLabelId(this.labels);
    this.labels[label] = id;
    this.#nextLabelId = id + 1;
    this.#labelsDirty = true;
  }

  edgeContext(): EdgeUpdateContext {
    return {
      labels: this.labels,
      fwdCache: this.#fwdCache,
      revCache: this.#revCache,
      getOrLoadMeta: (shardKey) => this.meta(shardKey),
      getOrLoadEdgeShard: (cache, dir, shardKey) => this.edges(cache, dir, shardKey),
    };
  }

  /** Deflates every loaded shard, and the label registry when it changed. */
  flush(): IndexShard[] {
    const shards: IndexShard[] = [];
    for (const [shardKey, meta] of this.#metaCache) {
      shards.push(deflateMeta(shardKey, meta));
    }
    collectEdgeShards(this.#fwdCache, 'fwd', shards);
    collectEdgeShards(this.#revCache, 'rev', shards);
    if (this.#labelsDirty) {
      shards.push(deflateLabels(this.labels));
    }
    return shards;
  }
}

function requireEdgeDirection(dir: string): IndexEdgeDirection {
  if (dir === 'fwd' || dir === 'rev') {
    return dir;
  }
  throw new IndexError(`Unknown index edge direction: ${dir}`, {
    code: 'E_INDEX_INVALID_STATE',
    context: { dir },
  });
}

function inflateMeta(shard: MetaShard | null): WorkingMetaShard {
  const RoaringBitmap32 = getRoaringBitmap32();
  if (shard === null) {
    return { nodeToGlobal: [], nextLocalId: 0, aliveBitmap: new RoaringBitmap32(), globalToNode: new Map(), nodeToGlobalMap: new Map() };
  }
  const nodeToGlobal = shard.nodeToGlobal.map(([nodeId, gid]): [string, number] => [nodeId, gid]);
  const globalToNode = new Map<number, string>();
  const nodeToGlobalMap = new Map<string, number>();
  for (const [nodeId, gid] of nodeToGlobal) {
    globalToNode.set(gid, nodeId);
    nodeToGlobalMap.set(nodeId, gid);
  }
  const aliveBitmap = shard.alive.length > 0
    ? RoaringBitmap32.deserializeAlive(shard.alive)
    : new RoaringBitmap32();
  return { nodeToGlobal, nextLocalId: shard.nextLocalId, aliveBitmap, globalToNode, nodeToGlobalMap };
}

function deflateMeta(shardKey: string, meta: WorkingMetaShard): MetaShard {
  return new MetaShard({
    shardKey,
    nodeToGlobal: meta.nodeToGlobal,
    nextLocalId: meta.nextLocalId,
    alive: meta.aliveBitmap.serialize(true),
  });
}

function inflateEdges(shard: EdgeShard | null): EdgeShardData {
  const data: EdgeShardData = {};
  for (const [bucket, owners] of Object.entries(shard?.buckets ?? {})) {
    data[bucket] = { ...owners };
  }
  return data;
}

function collectEdgeShards(cache: EdgeCache, direction: IndexEdgeDirection, out: IndexShard[]): void {
  for (const [shardKey, buckets] of cache) {
    out.push(new EdgeShard({ shardKey, direction, buckets }));
  }
}

function inflateLabels(shard: LabelShard | null): Record<string, number> {
  const labels: Record<string, number> = {};
  Reflect.setPrototypeOf(labels, null);
  for (const [label, id] of shard?.labels ?? []) {
    labels[label] = id;
  }
  return labels;
}

function deflateLabels(labels: Record<string, number>): LabelShard {
  // Label names are unique registry keys, so two entries never compare equal.
  const entries = Object.entries(labels).sort(([a], [b]) => (a < b ? -1 : 1));
  return new LabelShard({ labels: entries });
}

function nextFreeLabelId(labels: Record<string, number>): number {
  return Object.values(labels).reduce((maxId, id) => Math.max(maxId, id), -1) + 1;
}
