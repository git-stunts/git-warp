/**
 * StateLifecycle — the events a WarpState keeps to decide which property
 * registers are current: each edge's latest add and latest remove (see
 * ElementLifecycle) and each node's lifecycle records (see NodeLifecycle).
 *
 * @module domain/services/state/StateLifecycle
 */

import type { EventId } from '../../utils/EventId.ts';
import { mergeLifecycleEvents } from './ElementLifecycle.ts';
import { copyNodeLifecycle, mergeNodeLifecycles, type NodeLifecycleEvents } from './NodeLifecycle.ts';

/** Lifecycle maps as a state or snapshot carries them; an absent map reads as empty. */
export type StateLifecycleSource = {
  /** EdgeKey → EventId of the most recent EdgeAdd. */
  readonly edgeBirthEvent?: Map<string, EventId>;
  /** NodeId → EventId of the most recent NodeAdd. */
  readonly nodeBirthEvent?: Map<string, EventId>;
  /** NodeId → latest NodeRemove sorting below the node's latest add. */
  readonly nodeClearEvent?: Map<string, EventId>;
  /** NodeId → NodeRemoves sorting above the node's latest add, ascending. */
  readonly nodePendingRemoveEvents?: Map<string, readonly EventId[]>;
  /** EdgeKey → EventId of the most recent EdgeRemove. */
  readonly edgeRemoveEvent?: Map<string, EventId>;
};

/** Every lifecycle map, present and owned by the holder. */
export type StateLifecycle = NodeLifecycleEvents & {
  readonly edgeBirthEvent: Map<string, EventId>;
  readonly edgeRemoveEvent: Map<string, EventId>;
};

/** Copies every lifecycle map into a fresh one. */
export function copyStateLifecycle(source: StateLifecycleSource): StateLifecycle {
  return {
    edgeBirthEvent: new Map(source.edgeBirthEvent ?? []),
    ...copyNodeLifecycle(source),
    edgeRemoveEvent: new Map(source.edgeRemoveEvent ?? []),
  };
}

/** Joins two sets of lifecycle maps: EventId max per edge, NodeLifecycle merge per node. Pure. */
export function joinStateLifecycles(left: StateLifecycleSource, right: StateLifecycleSource): StateLifecycle {
  return {
    edgeBirthEvent: mergeLifecycleEvents(left.edgeBirthEvent, right.edgeBirthEvent),
    ...mergeNodeLifecycles(left, right),
    edgeRemoveEvent: mergeLifecycleEvents(left.edgeRemoveEvent, right.edgeRemoveEvent),
  };
}
