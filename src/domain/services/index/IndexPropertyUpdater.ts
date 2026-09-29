/**
 * Index property operations for incremental bitmap index updates.
 *
 * Rewrites the `props_<shard>.cbor` shards a PatchDiff touches so that they
 * hold exactly what a full rebuild would index for the affected nodes. A
 * property whose register is hidden by the node lifecycle rule is dropped:
 * a changed property whose winning register is already hidden, and every
 * property of a cleared node whose register became hidden.
 *
 * @module domain/services/index/IndexPropertyUpdater
 */

import type CodecPort from '../../../ports/CodecPort.ts';
import type { PropDiffEntry } from '../../types/PatchDiff.ts';
import computeShardKey from '../../utils/shardKey.ts';
import type WarpState from '../state/WarpState.ts';
import type { PropValue } from '../../types/PropValue.ts';
import { decodePropertyShard } from './PropertyIndexReader.ts';

type PropertyBag = Record<string, PropValue>;
type PropertyShard = Map<string, PropertyBag>;
type ShardLoader = (path: string) => Uint8Array | undefined;

/** Inputs for one property-shard update. */
export type PropertyShardUpdate = {
  readonly propsChanged: readonly PropDiffEntry[];
  readonly nodesCleared: readonly string[];
  readonly state: WarpState;
};

/**
 * Creates a null-prototype record pre-populated with props from source.
 */
function nullProtoBag(source: PropertyBag): PropertyBag {
  const base: PropertyBag = {};
  Reflect.setPrototypeOf(base, null);
  return Object.assign(base, source);
}

function propertyShardPath(shardKey: string): string {
  return `props_${shardKey}.cbor`;
}

/**
 * Handles property-level index mutations for one diff.
 */
export default class IndexPropertyUpdater {
  private readonly _codec: CodecPort;

  constructor(codec: CodecPort) {
    this._codec = codec;
    Object.freeze(this);
  }

  /** Returns the rewritten property shards, keyed by path. */
  computeDirtyPropertyShards(update: PropertyShardUpdate, loadShard: ShardLoader): Record<string, Uint8Array> {
    const shards = new Map<string, PropertyShard>();
    const shardFor = (nodeId: string): PropertyShard => this._shardFor(shards, computeShardKey(nodeId), loadShard);
    for (const prop of update.propsChanged) {
      applyChangedProperty(shardFor(prop.nodeId), prop, update.state);
    }
    for (const nodeId of update.nodesCleared) {
      dropHiddenProperties(shardFor(nodeId), nodeId, update.state);
    }
    const out: Record<string, Uint8Array> = {};
    for (const [shardKey, shard] of shards) {
      out[propertyShardPath(shardKey)] = this._codec.encode([...shard.entries()]).slice();
    }
    return out;
  }

  private _shardFor(shards: Map<string, PropertyShard>, shardKey: string, loadShard: ShardLoader): PropertyShard {
    let shard = shards.get(shardKey);
    if (shard === undefined) {
      const path = propertyShardPath(shardKey);
      shard = this._loadShard(loadShard(path), path);
      shards.set(shardKey, shard);
    }
    return shard;
  }

  private _loadShard(buf: Uint8Array | undefined, path: string): PropertyShard {
    const shard: PropertyShard = new Map();
    if (buf === undefined) {
      return shard;
    }
    for (const [nodeId, props] of decodePropertyShard(this._codec.decode(buf), path)) {
      shard.set(nodeId, nullProtoBag(props));
    }
    return shard;
  }
}

/** True when the node's current register for `key` is hidden by the lifecycle rule. */
function isHiddenProperty(state: WarpState, nodeId: string, key: string): boolean {
  const register = state.getNodeProp(nodeId, key);
  return register !== undefined && state.isStaleNodeRegister(nodeId, register);
}

function applyChangedProperty(shard: PropertyShard, prop: PropDiffEntry, state: WarpState): void {
  if (prop.value === undefined || isHiddenProperty(state, prop.nodeId, prop.key)) {
    deleteProperty(shard, prop.nodeId, prop.key);
    return;
  }
  let bag = shard.get(prop.nodeId);
  if (bag === undefined) {
    bag = nullProtoBag({});
    shard.set(prop.nodeId, bag);
  }
  bag[prop.key] = prop.value;
}

function dropHiddenProperties(shard: PropertyShard, nodeId: string, state: WarpState): void {
  for (const key of Object.keys(shard.get(nodeId) ?? {})) {
    if (isHiddenProperty(state, nodeId, key)) {
      deleteProperty(shard, nodeId, key);
    }
  }
}

/** Deletes one property, and the node's bag once it is empty, as a full rebuild would omit it. */
function deleteProperty(shard: PropertyShard, nodeId: string, key: string): void {
  const bag = shard.get(nodeId);
  if (bag === undefined) {
    return;
  }
  delete bag[key];
  if (Object.keys(bag).length === 0) {
    shard.delete(nodeId);
  }
}
