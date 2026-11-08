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

import { PropertyShard } from '../../artifacts/PropertyShard.ts';
import type { PropDiffEntry } from '../../types/PatchDiff.ts';
import computeShardKey from '../../utils/shardKey.ts';
import type WarpState from '../state/WarpState.ts';
import type { PropValue } from '../../types/PropValue.ts';
import type IndexShardTreePort from '../../../ports/IndexShardTreePort.ts';

type PropertyBag = Record<string, PropValue>;
type WorkingPropertyShard = Map<string, PropertyBag>;

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

/**
 * Handles property-level index mutations for one diff.
 */
export default class IndexPropertyUpdater {
  constructor() {
    Object.freeze(this);
  }

  /** Returns the rewritten property shards. */
  computeDirtyPropertyShards(update: PropertyShardUpdate, shards: IndexShardTreePort): PropertyShard[] {
    const working = new Map<string, WorkingPropertyShard>();
    const shardFor = (nodeId: string): WorkingPropertyShard => loadShard(working, computeShardKey(nodeId), shards);
    for (const prop of update.propsChanged) {
      applyChangedProperty(shardFor(prop.nodeId), prop, update.state);
    }
    for (const nodeId of update.nodesCleared) {
      dropHiddenProperties(shardFor(nodeId), nodeId, update.state);
    }
    return Array.from(working, ([shardKey, shard]) => new PropertyShard({ shardKey, entries: [...shard.entries()] }));
  }
}

function loadShard(
  working: Map<string, WorkingPropertyShard>,
  shardKey: string,
  shards: IndexShardTreePort,
): WorkingPropertyShard {
  let shard = working.get(shardKey);
  if (shard === undefined) {
    shard = new Map();
    for (const [nodeId, props] of shards.readProperties(shardKey) ?? []) {
      shard.set(nodeId, nullProtoBag(props));
    }
    working.set(shardKey, shard);
  }
  return shard;
}

/** True when the node's current register for `key` is hidden by the lifecycle rule. */
function isHiddenProperty(state: WarpState, nodeId: string, key: string): boolean {
  const register = state.getNodeProp(nodeId, key);
  return register !== undefined && state.isStaleNodeRegister(nodeId, register);
}

function applyChangedProperty(shard: WorkingPropertyShard, prop: PropDiffEntry, state: WarpState): void {
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

function dropHiddenProperties(shard: WorkingPropertyShard, nodeId: string, state: WarpState): void {
  for (const key of Object.keys(shard.get(nodeId) ?? {})) {
    if (isHiddenProperty(state, nodeId, key)) {
      deleteProperty(shard, nodeId, key);
    }
  }
}

/** Deletes one property, and the node's bag once it is empty, as a full rebuild would omit it. */
function deleteProperty(shard: WorkingPropertyShard, nodeId: string, key: string): void {
  const bag = shard.get(nodeId);
  if (bag === undefined) {
    return;
  }
  delete bag[key];
  if (Object.keys(bag).length === 0) {
    shard.delete(nodeId);
  }
}
