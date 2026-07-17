/**
 * QueryReads — graph read operations on materialized state.
 *
 * Functions that read nodes, edges, properties, and neighbors
 * from cached CRDT state. Extracted from QueryController.
 */

import {
  encodeEdgeKey,
  decodeEdgeKey,
} from '../KeyCodec.ts';
import EdgePropertyProjection from '../EdgePropertyProjection.ts';
import {
  createSnapshotPropertyValues,
  createSnapshotPropValue,
  createSnapshotWarpState,
} from '../ImmutableSnapshot.ts';
import NodePropertyProjection from '../NodePropertyProjection.ts';
import {
  isLegacyEdgePropertyProjectionTarget,
  isLegacyNodePropertyProjectionTarget,
} from '../LegacyPropertyProjectionTarget.ts';
import EdgeRecord from '../../graph/EdgeRecord.ts';
import QueryError from '../../errors/QueryError.ts';
import type SnapshotWarpState from '../snapshot/SnapshotWarpState.ts';
import type WarpState from '../state/WarpState.ts';
import type NeighborProviderPort from '../../../ports/NeighborProviderPort.ts';
import type { NeighborEdge, NeighborOptions } from '../../../ports/NeighborProviderPort.ts';
import type VisibleEdgePropertyRecord from '../../graph/VisibleEdgePropertyRecord.ts';
import type VisibleNodePropertyRecord from '../../graph/VisibleNodePropertyRecord.ts';
import type { SnapshotPropValue } from '../snapshot/SnapshotPropValue.ts';
import type { QueryReadHost } from './ReadGraphHost.ts';

// ── Types ───────────────────────────────────────────────────────────

type NeighborEntry = {
  nodeId: string;
  label: string;
  direction: 'outgoing' | 'incoming';
};

type DirectionTag = 'outgoing' | 'incoming';

/**
 * A node or edge property bag: keys are user-supplied prop names, and
 * values are public snapshot values.
 */
type MutablePropertyBag = { [key: string]: SnapshotPropValue };
type PropertyBag = Readonly<{ [key: string]: SnapshotPropValue }>;
type VisibleEdgeRead = {
  from: string;
  to: string;
  label: string;
  props: PropertyBag;
};

// ── Neighbor helpers ────────────────────────────────────────────────

function tagDirection(edges: NeighborEdge[], dir: DirectionTag): NeighborEntry[] {
  return edges.map((e) => ({ nodeId: e.neighborId, label: e.label, direction: dir }));
}

async function indexedBothNeighbors(provider: NeighborProviderPort, nodeId: string, opts?: NeighborOptions): Promise<NeighborEntry[]> {
  const [outEdges, inEdges] = await Promise.all([
    provider.getNeighbors(nodeId, 'out', opts),
    provider.getNeighbors(nodeId, 'in', opts),
  ]);
  return [...tagDirection(outEdges, 'outgoing'), ...tagDirection(inEdges, 'incoming')];
}

async function indexedDirectionalNeighbors(params: { provider: NeighborProviderPort; nodeId: string; direction: DirectionTag; opts?: NeighborOptions }): Promise<NeighborEntry[]> {
  const dir = params.direction === 'outgoing' ? 'out' as const : 'in' as const;
  const edges = await params.provider.getNeighbors(params.nodeId, dir, params.opts);
  return tagDirection(edges, params.direction);
}

function matchesLabel(label: string, filter: string | undefined): boolean {
  return filter === undefined || label === filter;
}

function checkOutgoing(decoded: { from: string; to: string; label: string }, nodeId: string, state: WarpState): NeighborEntry | null {
  if (decoded.from !== nodeId || !state.nodeAlive.contains(decoded.to)) { return null; }
  return { nodeId: decoded.to, label: decoded.label, direction: 'outgoing' };
}

function checkIncoming(decoded: { from: string; to: string; label: string }, nodeId: string, state: WarpState): NeighborEntry | null {
  if (decoded.to !== nodeId || !state.nodeAlive.contains(decoded.from)) { return null; }
  return { nodeId: decoded.from, label: decoded.label, direction: 'incoming' };
}

function linearNeighborsForNode(state: WarpState, nodeId: string, edgeLabel: string | undefined): { out: NeighborEntry[]; in: NeighborEntry[] } {
  const out: NeighborEntry[] = [];
  const incoming: NeighborEntry[] = [];

  for (const edgeKey of state.edgeAlive.elements()) {
    const decoded = decodeEdgeKey(edgeKey);
    if (!matchesLabel(decoded.label, edgeLabel)) { continue; }
    const o = checkOutgoing(decoded, nodeId, state);
    if (o) { out.push(o); }
    const i = checkIncoming(decoded, nodeId, state);
    if (i) { incoming.push(i); }
  }
  return { out, in: incoming };
}

function filterByDirection(both: { out: NeighborEntry[]; in: NeighborEntry[] }, direction: 'outgoing' | 'incoming' | 'both'): NeighborEntry[] {
  if (direction === 'outgoing') { return both.out; }
  if (direction === 'incoming') { return both.in; }
  return [...both.out, ...both.in];
}

// ── State access ────────────────────────────────────────────────────

async function ensureAndGetState(host: QueryReadHost): Promise<WarpState> {
  await host._ensureFreshState();
  if (host._cachedState === null) {
    throw new QueryError('host state is null after _ensureFreshState', { code: 'E_NO_STATE' });
  }
  return host._cachedState;
}

// ── Read implementations ────────────────────────────────────────────

export async function hasNodeImpl(host: QueryReadHost, nodeId: string): Promise<boolean> {
  if (host._readLiveNodePresence !== undefined) {
    const retainedPresence = await host._readLiveNodePresence(nodeId);
    if (retainedPresence !== null) {
      return retainedPresence;
    }
  }
  const state = await ensureAndGetState(host);
  return state.nodeAlive.contains(nodeId);
}

export async function getNodePropsImpl(host: QueryReadHost, nodeId: string): Promise<PropertyBag | null> {
  await host._ensureFreshState();
  const indexed = await tryIndexedNodeProps(host, nodeId);
  if (indexed !== undefined) { return indexed; }
  if (host._cachedState === null) { return null; }
  return linearNodeProps(host._cachedState, nodeId);
}

function hasIndexForNode(host: QueryReadHost, nodeId: string): boolean {
  return Boolean(host._propertyReader) && host._logicalIndex?.isAlive(nodeId) === true;
}

async function tryIndexedNodeProps(host: QueryReadHost, nodeId: string): Promise<PropertyBag | null | undefined> {
  if (!hasIndexForNode(host, nodeId)) { return undefined; }
  try {
    const record = await host._propertyReader!.getNodeProps(nodeId);
    if (record === null || record === undefined) { return undefined; }
    return createSnapshotPropertyValues(record);
  } catch {
    return undefined;
  }
}

function linearNodeProps(state: WarpState, nodeId: string): PropertyBag | null {
  if (!isLegacyNodePropertyProjectionTarget(nodeId)) { return null; }
  const owner = state.getNodeRecord(nodeId);
  if (owner === null) { return null; }
  return nodePropertyBagFromRecords(NodePropertyProjection.forNodeRecord(state, owner));
}

function nodePropertyBagFromRecords(records: readonly VisibleNodePropertyRecord[]): PropertyBag {
  const props: MutablePropertyBag = {};
  for (const record of records) {
    props[record.key.toString()] = createSnapshotPropValue(record.value.toPropValue());
  }
  return Object.freeze(props);
}

export async function getEdgePropsImpl(host: QueryReadHost, edge: { from: string; to: string; label: string }): Promise<PropertyBag | null> {
  const state = await ensureAndGetState(host);
  return edgePropsFromState(state, edge);
}

function edgePropsFromState(state: WarpState, edge: { from: string; to: string; label: string }): PropertyBag | null {
  if (!isLegacyEdgePropertyProjectionTarget(edge)) { return null; }
  const owner = state.getEdgeRecord(EdgeRecord.fromLegacyEdge(edge).id);
  if (owner === null) { return null; }
  return edgePropertyBagFromRecords(EdgePropertyProjection.forEdgeRecord(state, owner));
}

function edgePropertyBagFromRecords(records: readonly VisibleEdgePropertyRecord[]): PropertyBag {
  const props: MutablePropertyBag = {};
  for (const record of records) {
    props[record.key.toString()] = createSnapshotPropValue(record.value.toPropValue());
  }
  return Object.freeze(props);
}

export async function neighborsImpl(host: QueryReadHost, params: { nodeId: string; direction: 'outgoing' | 'incoming' | 'both'; edgeLabel?: string }): Promise<NeighborEntry[]> {
  await host._ensureFreshState();
  const indexed = await tryIndexedNeighbors(host, params);
  if (indexed !== undefined) { return indexed; }
  if (host._cachedState === null) { return []; }
  const both = linearNeighborsForNode(host._cachedState, params.nodeId, params.edgeLabel);
  return filterByDirection(both, params.direction);
}

function hasNeighborIndex(host: QueryReadHost, nodeId: string): NeighborProviderPort | null {
  const provider = host._materializedGraph?.provider;
  if (!provider || host._logicalIndex?.isAlive(nodeId) !== true) { return null; }
  return provider;
}

async function tryIndexedNeighbors(host: QueryReadHost, params: { nodeId: string; direction: 'outgoing' | 'incoming' | 'both'; edgeLabel?: string }): Promise<NeighborEntry[] | undefined> {
  const provider = hasNeighborIndex(host, params.nodeId);
  if (!provider) { return undefined; }
  try {
    const opts = buildNeighborOpts(params.edgeLabel);
    if (params.direction === 'both') {
      return await indexedBothNeighbors(provider, params.nodeId, opts);
    }
    return await indexedDirectionalNeighbors({ provider, nodeId: params.nodeId, direction: params.direction, ...(opts !== undefined ? { opts } : {}) });
  } catch {
    return undefined;
  }
}

function buildNeighborOpts(edgeLabel?: string): NeighborOptions | undefined {
  if (typeof edgeLabel === 'string' && edgeLabel.length > 0) {
    return { labels: new Set([edgeLabel]) };
  }
  return undefined;
}

export async function getStateSnapshotImpl(host: QueryReadHost): Promise<SnapshotWarpState | null> {
  if (!host._cachedState && !host._autoMaterialize) { return null; }
  await host._ensureFreshState();
  if (!host._cachedState) { return null; }
  return createSnapshotWarpState(host._cachedState);
}

export async function getNodesImpl(host: QueryReadHost): Promise<string[]> {
  const state = await ensureAndGetState(host);
  return [...state.nodeAlive.elements()];
}

export async function getEdgesImpl(host: QueryReadHost): Promise<VisibleEdgeRead[]> {
  const state = await ensureAndGetState(host);
  const edgeProps = buildEdgePropsByKey(state);
  return buildEdgeList(state, edgeProps);
}

function buildEdgePropsByKey(state: WarpState): Map<string, MutablePropertyBag> {
  const result = new Map<string, MutablePropertyBag>();
  for (const record of EdgePropertyProjection.fromState(state)) {
    const edgeKey = encodeEdgeKey(
      record.owner.from.toString(),
      record.owner.to.toString(),
      record.owner.typeId.toString(),
    );
    addProjectedEdgePropEntry({ record, edgeKey, result });
  }
  return result;
}

function addProjectedEdgePropEntry(params: {
  record: VisibleEdgePropertyRecord;
  edgeKey: string;
  result: Map<string, MutablePropertyBag>;
}): void {
  const { record, edgeKey, result } = params;
  let bag = result.get(edgeKey);
  if (!bag) {
    bag = {};
    result.set(edgeKey, bag);
  }
  bag[record.key.toString()] = createSnapshotPropValue(record.value.toPropValue());
}

function buildEdgeList(state: WarpState, edgeProps: Map<string, MutablePropertyBag>): VisibleEdgeRead[] {
  const edges: VisibleEdgeRead[] = [];
  for (const edgeKey of state.edgeAlive.elements()) {
    const { from, to, label } = decodeEdgeKey(edgeKey);
    if (!state.nodeAlive.contains(from) || !state.nodeAlive.contains(to)) { continue; }
    const props = edgeProps.get(edgeKey) ?? {};
    edges.push({ from, to, label, props: Object.freeze(props) });
  }
  return edges;
}

export async function getPropertyCountImpl(host: QueryReadHost): Promise<number> {
  const state = await ensureAndGetState(host);
  return NodePropertyProjection.fromState(state).length + EdgePropertyProjection.fromState(state).length;
}
