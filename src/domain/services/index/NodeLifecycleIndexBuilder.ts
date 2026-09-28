/**
 * Builds the node lifecycle shard family of a checkpoint index root.
 *
 * One `life_XX.cbor` shard per index shard key holds a NodeLifecycleRecord
 * for every node with a lifecycle record or a register that is not stale,
 * and one `life_receipt.cbor` marks the root as carrying the family and
 * lists the node tombstones whose adds the state does not hold.
 *
 * @module domain/services/index/NodeLifecycleIndexBuilder
 */

import type { IndexShard } from '../../artifacts/IndexShard.ts';
import { NodeLifecycleReceipt } from '../../artifacts/NodeLifecycleReceipt.ts';
import { NodeLifecycleRecord } from '../../artifacts/NodeLifecycleRecord.ts';
import { NodeLifecycleShard } from '../../artifacts/NodeLifecycleShard.ts';
import { EventId } from '../../utils/EventId.ts';
import computeShardKey from '../../utils/shardKey.ts';
import type WarpState from '../state/WarpState.ts';

const NODE_LIFECYCLE_RECEIPT_SHARDS = 1;

export default class NodeLifecycleIndexBuilder {
  /** Shard key to node id to that node's register EventIds, by property key. */
  private readonly _nodesByShard: ReadonlyMap<string, ReadonlyMap<string, Map<string, EventId>>>;
  private readonly _state: WarpState;

  private constructor(
    state: WarpState,
    nodesByShard: ReadonlyMap<string, ReadonlyMap<string, Map<string, EventId>>>,
  ) {
    this._state = state;
    this._nodesByShard = nodesByShard;
    Object.freeze(this);
  }

  static fromState(state: WarpState): NodeLifecycleIndexBuilder {
    const nodesByShard = new Map<string, Map<string, Map<string, EventId>>>();
    const registersOf = (nodeId: string): Map<string, EventId> => {
      const shardKey = computeShardKey(nodeId);
      const nodes = nodesByShard.get(shardKey) ?? new Map<string, Map<string, EventId>>();
      nodesByShard.set(shardKey, nodes);
      const registers = nodes.get(nodeId) ?? new Map<string, EventId>();
      nodes.set(nodeId, registers);
      return registers;
    };
    for (const nodeId of lifecycleNodeIds(state)) {
      registersOf(nodeId);
    }
    for (const entry of state.nodeProperties()) {
      if (!state.isStaleNodeRegister(entry.nodeId, entry.register)) {
        registersOf(entry.nodeId).set(entry.key, entry.register.eventId);
      }
    }
    return new NodeLifecycleIndexBuilder(state, nodesByShard);
  }

  /** Record shards plus the receipt. */
  shardCount(): number {
    return this._nodesByShard.size + NODE_LIFECYCLE_RECEIPT_SHARDS;
  }

  *yieldShards(): Generator<IndexShard> {
    let nodeCount = 0;
    for (const shardKey of [...this._nodesByShard.keys()].sort(compareStrings)) {
      const records = this._shardRecords(shardKey);
      nodeCount += records.length;
      yield new NodeLifecycleShard({ shardKey, records });
    }
    yield new NodeLifecycleReceipt({
      nodeCount,
      shardCount: this._nodesByShard.size,
      floatingTombstones: floatingNodeTombstones(this._state),
    });
  }

  private _shardRecords(shardKey: string): readonly NodeLifecycleRecord[] {
    const nodes = this._nodesByShard.get(shardKey) ?? new Map<string, Map<string, EventId>>();
    return [...nodes.keys()].sort(compareStrings).map((nodeId) => new NodeLifecycleRecord({
      nodeId,
      birth: optionalEvent(this._state.nodeBirthEvent.get(nodeId)),
      clear: optionalEvent(this._state.nodeClearEvent.get(nodeId)),
      pendingRemoves: (this._state.nodePendingRemoveEvents.get(nodeId) ?? []).map(eventIdOf),
      registers: [...(nodes.get(nodeId) ?? new Map<string, EventId>()).entries()]
        .sort(([left], [right]) => compareStrings(left, right))
        .map(([key, event]) => [key, eventIdOf(event)]),
    }));
  }
}

function optionalEvent(event: EventId | undefined): EventId | null {
  return event === undefined ? null : eventIdOf(event);
}

/**
 * States restored from a snapshot or cache can hold EventIds as plain
 * records with the same fields. The record requires EventId instances.
 */
function eventIdOf(event: Pick<EventId, 'lamport' | 'writerId' | 'patchSha' | 'opIndex'>): EventId {
  return event instanceof EventId
    ? event
    : new EventId(event.lamport, event.writerId, event.patchSha, event.opIndex);
}

/**
 * Node tombstones no add in the state holds. Compaction drops a dot's entry
 * and its tombstone together, so these come only from removes that observed
 * an add the state has not received.
 */
function floatingNodeTombstones(state: WarpState): readonly string[] {
  const held = new Set(state.nodeAlive.entryDotsIter());
  return [...state.nodeAlive.tombstonesIter()].filter((dot) => !held.has(dot)).sort(compareStrings);
}

function lifecycleNodeIds(state: WarpState): ReadonlySet<string> {
  return new Set([
    ...state.nodeBirthEvent.keys(),
    ...state.nodeClearEvent.keys(),
    ...state.nodePendingRemoveEvents.keys(),
  ]);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
