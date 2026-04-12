/**
 * Orchestrator for incremental bitmap index updates.
 *
 * Delegates node/edge mutations to IndexNodeUpdater and IndexEdgeUpdater.
 * Owns shard caches and adjacency state. Reuse one instance per linear
 * state stream; create a new instance to reset cache state.
 *
 * @module domain/services/index/IncrementalIndexUpdater
 */

import type CodecPort from '../../../ports/CodecPort.ts';
import type ORSet from '../../crdt/ORSet.ts';
import type { PatchDiff, PropDiffEntry, EdgeDiffEntry } from '../../types/PatchDiff.ts';
import defaultCodec from '../../utils/defaultCodec.ts';
import computeShardKey from '../../utils/shardKey.ts';
import toBytes from '../../utils/toBytes.ts';
import { getRoaringBitmap32 } from '../../utils/roaring.ts';
import { decodeEdgeKey } from '../KeyCodec.ts';
import IndexNodeUpdater from './IndexNodeUpdater.ts';
import IndexEdgeUpdater, { type EdgeUpdateContext } from './IndexEdgeUpdater.ts';
import type { WorkingMetaShard, EdgeShardData } from './types.ts';

/**
 * Creates a null-prototype object typed as a string-keyed record.
 */
function createNullProto<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

/**
 * Creates a null-prototype record pre-populated with props from source.
 */
function mergeIntoNullProto(source: Record<string, unknown>): Record<string, unknown> {
  const base: Record<string, unknown> = createNullProto();
  return Object.assign(base, source);
}

/** Shape of the WarpState fields consumed by the updater. */
type WarpStateLike = {
  nodeAlive: { contains(key: string): boolean };
  edgeAlive: ORSet;
};

export default class IncrementalIndexUpdater {
  private readonly _codec: CodecPort;
  private readonly _edgeAdjacencyCache: WeakMap<ORSet, Map<string, Set<string>>>;
  private readonly _nodeUpdater: IndexNodeUpdater;
  private readonly _edgeUpdater: IndexEdgeUpdater;

  /**
   * Cached next label ID — avoids O(L) max-scan per new label.
   * Initialized lazily from existing labels on first _ensureLabel call.
   */
  private _nextLabelId: number | null;

  constructor(options?: { codec?: CodecPort }) {
    const { codec } = options || {};
    this._codec = codec || defaultCodec;
    this._edgeAdjacencyCache = new WeakMap();
    this._nextLabelId = null;
    this._nodeUpdater = new IndexNodeUpdater();
    this._edgeUpdater = new IndexEdgeUpdater();
  }

  /**
   * Computes only the dirty shards from a PatchDiff.
   *
   * @returns Dirty shard buffers (path -> Uint8Array).
   */
  computeDirtyShards({ diff, state, loadShard }: {
    diff: PatchDiff;
    state: WarpStateLike;
    loadShard: (path: string) => Uint8Array | undefined;
  }): Record<string, Uint8Array> {
    const dirtyKeys = this._collectDirtyShardKeys(diff);
    if (dirtyKeys.size === 0) {
      return {};
    }

    const metaCache = new Map<string, WorkingMetaShard>();
    const out: Record<string, Uint8Array> = {};

    const getOrLoadMeta = (shardKey: string): WorkingMetaShard =>
      this._getOrLoadMeta(shardKey, metaCache, loadShard);

    const getOrLoadEdgeShard = (
      cache: Map<string, EdgeShardData>,
      dir: string,
      shardKey: string,
    ): EdgeShardData => this._getOrLoadEdgeShard(cache, dir, shardKey, loadShard);

    const labels = this._loadLabels(loadShard);
    // Reset cached next label ID so _ensureLabel re-scans the fresh labels
    // object loaded above. Without this, a stale _nextLabelId from a prior
    // call could collide with IDs already present in the new labels.
    this._nextLabelId = null;
    let labelsDirty = false;

    // Determine which added nodes are true re-adds (already have global IDs).
    // Brand-new nodes cannot have pre-existing indexed edges to restore.
    const readdedNodes = new Set<string>();
    for (const nodeId of diff.nodesAdded) {
      const meta = getOrLoadMeta(computeShardKey(nodeId));
      if (this._nodeUpdater.findGlobalId(meta, nodeId) !== undefined) {
        readdedNodes.add(nodeId);
      }
    }

    for (const nodeId of diff.nodesAdded) {
      const sk = computeShardKey(nodeId);
      const meta = getOrLoadMeta(sk);
      this._nodeUpdater.handleNodeAdd(nodeId, sk, meta);
    }
    for (const nodeId of diff.nodesRemoved) {
      const meta = getOrLoadMeta(computeShardKey(nodeId));
      this._nodeUpdater.handleNodeRemove(nodeId, meta);
    }

    const fwdCache = new Map<string, EdgeShardData>();
    const revCache = new Map<string, EdgeShardData>();

    const edgeCtx: EdgeUpdateContext = {
      labels, getOrLoadMeta, fwdCache, revCache, getOrLoadEdgeShard,
    };

    // Purge edge bitmaps for removed nodes (dangling edge elimination).
    const purgeCtx = { fwdCache, revCache, getOrLoadMeta, getOrLoadEdgeShard };
    for (const nodeId of diff.nodesRemoved) {
      this._nodeUpdater.purgeNodeEdges(nodeId, purgeCtx);
    }

    // Filter edgesAdded by endpoint alive-ness (matches edgeVisible).
    for (const edge of diff.edgesAdded) {
      if (!state.nodeAlive.contains(edge.from) || !state.nodeAlive.contains(edge.to)) {
        continue;
      }
      labelsDirty = this._ensureLabel(edge.label, labels) || labelsDirty;
      this._edgeUpdater.handleEdgeAdd(edge, edgeCtx);
    }
    for (const edge of diff.edgesRemoved) {
      this._edgeUpdater.handleEdgeRemove(edge, edgeCtx);
    }

    // Keep adjacency cache in sync for every diff once initialized.
    let readdAdjacency: Map<string, Set<string>> | null = null;
    if (readdedNodes.size > 0 || this._edgeAdjacencyCache.has(state.edgeAlive)) {
      readdAdjacency = this._getOrBuildAliveEdgeAdjacency(state, diff);
    }

    // Restore edges for re-added nodes only.
    if (readdedNodes.size > 0 && readdAdjacency) {
      const diffEdgeSet = new Set(
        diff.edgesAdded.map((e: EdgeDiffEntry) => `${e.from}\0${e.to}\0${e.label}`),
      );
      for (const edgeKey of this._collectReaddedEdgeKeys(readdAdjacency, readdedNodes)) {
        const { from, to, label } = decodeEdgeKey(edgeKey);
        if (!state.nodeAlive.contains(from) || !state.nodeAlive.contains(to)) {
          continue;
        }
        const diffKey = `${from}\0${to}\0${label}`;
        if (diffEdgeSet.has(diffKey)) {
          continue;
        }
        labelsDirty = this._ensureLabel(label, labels) || labelsDirty;
        this._edgeUpdater.handleEdgeAdd({ from, to, label }, edgeCtx);
      }
    }

    this._flushMeta(metaCache, out);
    this._flushEdgeShards(fwdCache, 'fwd', out);
    this._flushEdgeShards(revCache, 'rev', out);

    if (labelsDirty) {
      out['labels.cbor'] = this._saveLabels(labels);
    }

    this._handleProps(diff.propsChanged, loadShard, out);

    return out;
  }

  private _collectDirtyShardKeys(diff: PatchDiff): Set<string> {
    const keys = new Set<string>();
    for (const nid of diff.nodesAdded) {
      keys.add(computeShardKey(nid));
    }
    for (const nid of diff.nodesRemoved) {
      keys.add(computeShardKey(nid));
    }
    for (const e of diff.edgesAdded) {
      keys.add(computeShardKey(e.from));
      keys.add(computeShardKey(e.to));
    }
    for (const e of diff.edgesRemoved) {
      keys.add(computeShardKey(e.from));
      keys.add(computeShardKey(e.to));
    }
    for (const p of diff.propsChanged) {
      keys.add(computeShardKey(p.nodeId));
    }
    return keys;
  }

  /**
   * Ensures a label exists in the registry; returns true if newly added.
   */
  private _ensureLabel(label: string, labels: Record<string, number>): boolean {
    if (Object.prototype.hasOwnProperty.call(labels, label)) {
      return false;
    }
    if (this._nextLabelId === null) {
      let maxId = -1;
      for (const id of Object.values(labels)) {
        if (id > maxId) {
          maxId = id;
        }
      }
      this._nextLabelId = maxId + 1;
    }
    labels[label] = this._nextLabelId;
    this._nextLabelId++;
    return true;
  }

  private _handleProps(
    propsChanged: PropDiffEntry[],
    loadShard: (path: string) => Uint8Array | undefined,
    out: Record<string, Uint8Array>,
  ): void {
    if (propsChanged.length === 0) {
      return;
    }

    const shardMap = new Map<string, Map<string, Record<string, unknown>>>();

    for (const prop of propsChanged) {
      const shardKey = computeShardKey(prop.nodeId);
      if (!shardMap.has(shardKey)) {
        shardMap.set(shardKey, this._loadProps(shardKey, loadShard));
      }
      const shard = shardMap.get(shardKey)!;
      let nodeProps = shard.get(prop.nodeId);
      if (!nodeProps) {
        const fresh: Record<string, unknown> = createNullProto();
        nodeProps = fresh;
        shard.set(prop.nodeId, fresh);
      } else if (Object.getPrototypeOf(nodeProps) !== null) {
        const safeProps = mergeIntoNullProto(nodeProps);
        shard.set(prop.nodeId, safeProps);
        nodeProps = safeProps;
      }
      nodeProps[prop.key] = prop.value;
    }

    for (const [shardKey, shard] of shardMap) {
      out[`props_${shardKey}.cbor`] = this._saveProps(shard);
    }
  }

  private _getOrLoadMeta(
    shardKey: string,
    cache: Map<string, WorkingMetaShard>,
    loadShard: (path: string) => Uint8Array | undefined,
  ): WorkingMetaShard {
    const cached = cache.get(shardKey);
    if (cached) {
      return cached;
    }
    const meta = this._loadMeta(shardKey, loadShard);
    cache.set(shardKey, meta);
    return meta;
  }

  private _loadMeta(
    shardKey: string,
    loadShard: (path: string) => Uint8Array | undefined,
  ): WorkingMetaShard {
    const RoaringBitmap32 = getRoaringBitmap32();
    const buf = loadShard(`meta_${shardKey}.cbor`);
    if (!buf) {
      return {
        nodeToGlobal: [],
        nextLocalId: 0,
        aliveBitmap: new RoaringBitmap32(),
        globalToNode: new Map(),
        nodeToGlobalMap: new Map(),
      };
    }
    const raw = this._codec.decode(buf) as {
      nodeToGlobal: Array<[string, number]> | Record<string, number>;
      alive: Uint8Array | number[];
      nextLocalId: number;
    };
    const entries: Array<[string, number]> = Array.isArray(raw.nodeToGlobal)
      ? raw.nodeToGlobal
      : Object.entries(raw.nodeToGlobal);
    const alive = raw.alive !== undefined && raw.alive !== null && raw.alive.length > 0
      ? RoaringBitmap32.deserialize(toBytes(raw.alive), true)
      : new RoaringBitmap32();

    const globalToNode = new Map<number, string>();
    const nodeToGlobalMap = new Map<string, number>();
    for (const [nodeId, gid] of entries) {
      globalToNode.set(Number(gid), nodeId);
      nodeToGlobalMap.set(nodeId, Number(gid));
    }

    return { nodeToGlobal: entries, nextLocalId: raw.nextLocalId, aliveBitmap: alive, globalToNode, nodeToGlobalMap };
  }

  private _flushMeta(
    metaCache: Map<string, WorkingMetaShard>,
    out: Record<string, Uint8Array>,
  ): void {
    for (const [shardKey, meta] of metaCache) {
      const shard = {
        nodeToGlobal: meta.nodeToGlobal,
        nextLocalId: meta.nextLocalId,
        alive: meta.aliveBitmap.serialize(true),
      };
      out[`meta_${shardKey}.cbor`] = this._codec.encode(shard).slice();
    }
  }

  private _getOrLoadEdgeShard(
    cache: Map<string, EdgeShardData>,
    dir: string,
    shardKey: string,
    loadShard: (path: string) => Uint8Array | undefined,
  ): EdgeShardData {
    const cacheKey = `${dir}_${shardKey}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const data = this._loadEdgeShard(dir, shardKey, loadShard);
    cache.set(cacheKey, data);
    return data;
  }

  private _loadEdgeShard(
    dir: string,
    shardKey: string,
    loadShard: (path: string) => Uint8Array | undefined,
  ): EdgeShardData {
    const buf = loadShard(`${dir}_${shardKey}.cbor`);
    if (!buf) {
      return {};
    }
    return this._codec.decode(buf) as EdgeShardData;
  }

  private _flushEdgeShards(
    cache: Map<string, EdgeShardData>,
    dir: string,
    out: Record<string, Uint8Array>,
  ): void {
    const prefix = `${dir}_`;
    for (const [cacheKey, data] of cache) {
      if (!cacheKey.startsWith(prefix)) {
        continue;
      }
      const path = `${cacheKey}.cbor`;
      out[path] = this._codec.encode(data).slice();
    }
  }

  private _loadLabels(
    loadShard: (path: string) => Uint8Array | undefined,
  ): Record<string, number> {
    const buf = loadShard('labels.cbor');
    if (!buf) {
      return createNullProto<number>();
    }
    const decoded = this._codec.decode(buf) as Record<string, number> | Array<[string, number]>;
    const labels: Record<string, number> = createNullProto();
    const entries = Array.isArray(decoded) ? decoded : Object.entries(decoded);
    for (const [label, id] of entries) {
      labels[label] = id;
    }
    return labels;
  }

  private _saveLabels(labels: Record<string, number>): Uint8Array {
    const entries = Object.entries(labels).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return this._codec.encode(entries).slice();
  }

  private _loadProps(
    shardKey: string,
    loadShard: (path: string) => Uint8Array | undefined,
  ): Map<string, Record<string, unknown>> {
    const buf = loadShard(`props_${shardKey}.cbor`);
    const map = new Map<string, Record<string, unknown>>();
    if (!buf) {
      return map;
    }
    const decoded = this._codec.decode(buf) as Array<[string, Record<string, unknown>]>;
    if (Array.isArray(decoded)) {
      for (const [nodeId, props] of decoded) {
        const source = (props !== null && props !== undefined && typeof props === 'object') ? props : {};
        const safeProps = mergeIntoNullProto(source);
        map.set(nodeId, safeProps);
      }
    }
    return map;
  }

  private _saveProps(shard: Map<string, Record<string, unknown>>): Uint8Array {
    const entries = [...shard.entries()];
    return this._codec.encode(entries).slice();
  }

  private _collectReaddedEdgeKeys(
    adjacency: Map<string, Set<string>>,
    readdedNodes: Set<string>,
  ): Set<string> {
    const keys = new Set<string>();
    for (const nodeId of readdedNodes) {
      const incident = adjacency.get(nodeId);
      if (!incident) {
        continue;
      }
      for (const edgeKey of incident) {
        keys.add(edgeKey);
      }
    }
    return keys;
  }

  private _getOrBuildAliveEdgeAdjacency(
    state: WarpStateLike,
    diff: PatchDiff,
  ): Map<string, Set<string>> {
    const { edgeAlive } = state;
    let adjacency = this._edgeAdjacencyCache.get(edgeAlive);
    if (!adjacency) {
      adjacency = new Map();
      for (const edgeKey of edgeAlive.elements()) {
        const { from, to } = decodeEdgeKey(edgeKey);
        this._addEdgeKeyToAdjacency(adjacency, from, edgeKey);
        this._addEdgeKeyToAdjacency(adjacency, to, edgeKey);
      }
      this._edgeAdjacencyCache.set(edgeAlive, adjacency);
      return adjacency;
    }

    for (const edge of diff.edgesAdded) {
      const edgeKey = `${edge.from}\0${edge.to}\0${edge.label}`;
      if (!edgeAlive.contains(edgeKey)) {
        continue;
      }
      this._addEdgeKeyToAdjacency(adjacency, edge.from, edgeKey);
      this._addEdgeKeyToAdjacency(adjacency, edge.to, edgeKey);
    }
    for (const edge of diff.edgesRemoved) {
      const edgeKey = `${edge.from}\0${edge.to}\0${edge.label}`;
      if (edgeAlive.contains(edgeKey)) {
        continue;
      }
      this._removeEdgeKeyFromAdjacency(adjacency, edge.from, edgeKey);
      this._removeEdgeKeyFromAdjacency(adjacency, edge.to, edgeKey);
    }

    return adjacency;
  }

  private _addEdgeKeyToAdjacency(
    adjacency: Map<string, Set<string>>,
    nodeId: string,
    edgeKey: string,
  ): void {
    let set = adjacency.get(nodeId);
    if (!set) {
      set = new Set();
      adjacency.set(nodeId, set);
    }
    set.add(edgeKey);
  }

  private _removeEdgeKeyFromAdjacency(
    adjacency: Map<string, Set<string>>,
    nodeId: string,
    edgeKey: string,
  ): void {
    const set = adjacency.get(nodeId);
    if (!set) {
      return;
    }
    set.delete(edgeKey);
    if (set.size === 0) {
      adjacency.delete(nodeId);
    }
  }
}
