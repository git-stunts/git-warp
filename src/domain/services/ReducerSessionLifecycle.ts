/**
 * ReducerSessionLifecycle — the node lifecycle records and edge removes a
 * reducer session frame keeps, and how one patch operation updates them.
 *
 * @module domain/services/ReducerSessionLifecycle
 */

import PatchError from '../errors/PatchError.ts';
import EdgeRemove from '../types/ops/EdgeRemove.ts';
import NodeAdd from '../types/ops/NodeAdd.ts';
import NodeRemove from '../types/ops/NodeRemove.ts';
import type Op from '../types/ops/Op.ts';
import type { EventId } from '../utils/EventId.ts';
import { encodeEdgeKey } from './KeyCodec.ts';
import { advanceLifecycleEvent } from './state/ElementLifecycle.ts';
import { recordNodeAdd, recordNodeRemove, type NodeLifecycleEvents } from './state/NodeLifecycle.ts';

/** The lifecycle maps a reducer session frame owns, apart from edge births. */
export type SessionLifecycle = NodeLifecycleEvents & {
  readonly edgeRemoveEvent: Map<string, EventId>;
};

/**
 * Records a node add, or a node or edge remove that observed at least one
 * dot. Edge births are recorded where the edge add is applied.
 */
export function recordSessionLifecycleOp(lifecycle: SessionLifecycle, op: Op, eventId: EventId): void {
  if (op instanceof NodeAdd) {
    recordNodeAdd(lifecycle, op.node, eventId);
    return;
  }
  if (op instanceof NodeRemove || op instanceof EdgeRemove) {
    recordObservedRemove(lifecycle, op, eventId);
  }
}

function recordObservedRemove(lifecycle: SessionLifecycle, op: NodeRemove | EdgeRemove, eventId: EventId): void {
  if (op.observedDots.length === 0) {
    return;
  }
  if (op instanceof NodeRemove) {
    recordNodeRemove(lifecycle, op.node, eventId);
    return;
  }
  advanceLifecycleEvent(lifecycle.edgeRemoveEvent, encodeEdgeKey(op.from, op.to, op.label), eventId);
}

/** The node a node add or remove targets and its clear event before the op, or null for other ops. */
export type NodeClearWatch = { readonly nodeId: string; readonly clearBefore: EventId | undefined } | null;

/** Takes the clear event of the node a node add or remove targets, before the op applies. */
export function watchNodeClear(lifecycle: NodeLifecycleEvents, op: Op): NodeClearWatch {
  if (op instanceof NodeAdd || op instanceof NodeRemove) {
    return { nodeId: op.node, clearBefore: lifecycle.nodeClearEvent.get(op.node) };
  }
  return null;
}

/**
 * Records the node as cleared when the op advanced its clear event: earlier
 * property registers became hidden even if the node stayed alive.
 */
export function recordClearedNode(nodesCleared: string[], lifecycle: NodeLifecycleEvents, watch: NodeClearWatch): void {
  if (watch !== null && lifecycle.nodeClearEvent.get(watch.nodeId) !== watch.clearBefore) {
    nodesCleared.push(watch.nodeId);
  }
}

/** A lifecycle map the frame was given, or a fresh one when it was not. */
export function optionalLifecycleMap<V>(
  value: Map<string, V> | undefined,
  field: string,
): Map<string, V> {
  if (value === undefined) {
    return new Map<string, V>();
  }
  if (!(value instanceof Map)) {
    throw new PatchError(`ReducerSessionFrame requires a ${field} Map`);
  }
  return value;
}
