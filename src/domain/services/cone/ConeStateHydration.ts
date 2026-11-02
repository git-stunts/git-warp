/**
 * Hydrates the reducer's own state shape from cone records.
 *
 * A fold workspace and a cone read both need a `WarpState` holding exactly
 * some records, so the existing reducer and state readers can run over it
 * unchanged. Tombstones become one OR-Set-wide set again; that is exact
 * because a folded trie never holds a dot claimed across elements.
 *
 * @module domain/services/cone/ConeStateHydration
 */

import ORSet from '../../crdt/ORSet.ts';
import VersionVector from '../../crdt/VersionVector.ts';
import type { LWWRegister } from '../../crdt/LWW.ts';
import type { PropValue } from '../../types/PropValue.ts';
import type { EventId } from '../../utils/EventId.ts';
import { encodeEdgePropKey, encodePropKey } from '../KeyCodec.ts';
import WarpState from '../state/WarpState.ts';
import type ConeEdgeRecord from './ConeEdgeRecord.ts';
import type ConeNodeRecord from './ConeNodeRecord.ts';

type Membership = { readonly element: string; readonly addDots: ReadonlySet<string>; readonly tombstones: ReadonlySet<string> };

/** A state holding exactly `nodes` and `edges`. */
export function hydrateConeState(nodes: readonly ConeNodeRecord[], edges: readonly ConeEdgeRecord[]): WarpState {
  return new WarpState({
    nodeAlive: membership(nodes.map((node) => ({ element: node.nodeId, ...node }))),
    edgeAlive: membership(edges.map((edge) => ({ element: edge.edgeKey, ...edge }))),
    prop: registers(nodes, edges),
    observedFrontier: VersionVector.empty(),
    nodeBirthEvent: events(nodes.map((node) => [node.nodeId, node.birth])),
    nodeClearEvent: events(nodes.map((node) => [node.nodeId, node.clear])),
    edgeBirthEvent: events(edges.map((edge) => [edge.edgeKey, edge.birth])),
    edgeRemoveEvent: events(edges.map((edge) => [edge.edgeKey, edge.remove])),
  });
}

function membership(elements: readonly Membership[]): ORSet {
  const entries = new Map<string, Set<string>>();
  const tombstones = new Set<string>();
  for (const element of elements) {
    if (element.addDots.size > 0) {
      entries.set(element.element, new Set(element.addDots));
    }
    for (const dot of element.tombstones) {
      tombstones.add(dot);
    }
  }
  return new ORSet(entries, tombstones);
}

function registers(nodes: readonly ConeNodeRecord[], edges: readonly ConeEdgeRecord[]): Map<string, LWWRegister<PropValue>> {
  const prop = new Map<string, LWWRegister<PropValue>>();
  for (const node of nodes) {
    for (const [key, register] of node.props) {
      prop.set(encodePropKey(node.nodeId, key), register);
    }
  }
  for (const edge of edges) {
    for (const [key, register] of edge.props) {
      prop.set(encodeEdgePropKey(edge.from, edge.to, edge.label, key), register);
    }
  }
  return prop;
}

function events(pairs: ReadonlyArray<readonly [string, EventId | null]>): Map<string, EventId> {
  const result = new Map<string, EventId>();
  for (const [element, event] of pairs) {
    if (event !== null) {
      result.set(element, event);
    }
  }
  return result;
}
