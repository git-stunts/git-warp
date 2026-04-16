/**
 * QueryReads — graph read operations on materialized state.
 *
 * Functions that read nodes, edges, properties, and neighbors
 * from cached CRDT state. Extracted from QueryController.
 */

import {
  decodePropKey,
  isEdgePropKey,
  decodeEdgePropKey,
  encodeEdgeKey,
  decodeEdgeKey,
} from '../KeyCodec.ts';
import { compareEventIds, type EventId } from '../../utils/EventId.ts';
import { createImmutableWarpState } from '../ImmutableSnapshot.ts';
import QueryError from '../../errors/QueryError.ts';
import type WarpState from '../state/WarpState.ts';
import type { WarpGraphWithMixins } from '../../warp/_internal.ts';
import type NeighborProviderPort from '../../../ports/NeighborProviderPort.ts';
import type { NeighborOptions } from '../../../ports/NeighborProviderPort.ts';
import type { LWWRegister } from '../../crdt/LWW.ts';
import type { PropValue } from '../../types/PropValue.ts';

// ── Types ───────────────────────────────────────────────────────────

type NeighborEntry = {
  nodeId: string;
  label: string;
  direction: 'outgoing' | 'incoming';
};

type DirectionTag = 'outgoing' | 'incoming';

/**
 * A node or edge property bag: keys are user-supplied prop names and
 * values are decoded domain `PropValue`s (the type CBOR decode produces).
 */
type PropertyBag = Record<string, PropValue>;

/** A property register stored on the CRDT state map. */
type PropRegister = LWWRegister<PropValue>;

// ── Neighbor helpers ────────────────────────────────────────────────

function tagDirection(edges: Array<{ neighborId: string; label: string }>, dir: DirectionTag): NeighborEntry[] {
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

async function ensureAndGetState(host: WarpGraphWithMixins): Promise<WarpState> {
  await host._ensureFreshState();
  if (host._cachedState === null) {
    throw new QueryError('host state is null after _ensureFreshState', { code: 'E_NO_STATE' });
  }
  return host._cachedState;
}

// ── Read implementations ────────────────────────────────────────────

export async function hasNodeImpl(host: WarpGraphWithMixins, nodeId: string): Promise<boolean> {
  const state = await ensureAndGetState(host);
  return state.nodeAlive.contains(nodeId);
}

export async function getNodePropsImpl(host: WarpGraphWithMixins, nodeId: string): Promise<PropertyBag | null> {
  await host._ensureFreshState();
  const indexed = await tryIndexedNodeProps(host, nodeId);
  if (indexed !== undefined) { return indexed; }
  if (host._cachedState === null) { return null; }
  return linearNodeProps(host._cachedState, nodeId);
}

function hasIndexForNode(host: WarpGraphWithMixins, nodeId: string): boolean {
  return Boolean(host._propertyReader) && host._logicalIndex?.isAlive(nodeId) === true;
}

async function tryIndexedNodeProps(host: WarpGraphWithMixins, nodeId: string): Promise<PropertyBag | null | undefined> {
  if (!hasIndexForNode(host, nodeId)) { return undefined; }
  try {
    const record = await host._propertyReader!.getNodeProps(nodeId);
    if (record === null || record === undefined) { return undefined; }
    // TODO(0025B5): PropertyIndexReader (index/ cluster) returns a loose
    // Record shape; the decoded values are always PropValue. The
    // narrow-cast below goes away when the index cluster graduates.
    return record as PropertyBag;
  } catch {
    return undefined;
  }
}

function linearNodeProps(state: WarpState, nodeId: string): PropertyBag | null {
  if (!state.nodeAlive.contains(nodeId)) { return null; }
  const props: PropertyBag = {};
  for (const [propKey, register] of state.prop) {
    const decoded = decodePropKey(propKey);
    if (decoded.nodeId === nodeId) {
      props[decoded.propKey] = register.value;
    }
  }
  return props;
}

export async function getEdgePropsImpl(host: WarpGraphWithMixins, edge: { from: string; to: string; label: string }): Promise<PropertyBag | null> {
  const state = await ensureAndGetState(host);
  return edgePropsFromState(state, edge);
}

function edgePropsFromState(state: WarpState, edge: { from: string; to: string; label: string }): PropertyBag | null {
  const edgeKey = encodeEdgeKey(edge.from, edge.to, edge.label);
  if (!state.edgeAlive.contains(edgeKey)) { return null; }
  if (!state.nodeAlive.contains(edge.from) || !state.nodeAlive.contains(edge.to)) { return null; }
  return collectEdgeProps(state, edge, edgeKey);
}

function isMatchingEdgeProp(d: { from: string; to: string; label: string }, edge: { from: string; to: string; label: string }): boolean {
  return d.from === edge.from && d.to === edge.to && d.label === edge.label;
}

function visibleEdgePropValue(params: {
  propKey: string;
  register: PropRegister;
  edge: { from: string; to: string; label: string };
  birthEvent: EventId | undefined;
}): { key: string; value: PropValue } | null {
  const { propKey, register, edge, birthEvent } = params;
  if (!isEdgePropKey(propKey)) { return null; }
  const d = decodeEdgePropKey(propKey);
  if (!isMatchingEdgeProp(d, edge)) { return null; }
  if (isStaleEdgeProp(register, birthEvent)) { return null; }
  return { key: d.propKey, value: register.value };
}

function collectEdgeProps(state: WarpState, edge: { from: string; to: string; label: string }, edgeKey: string): PropertyBag {
  const birthEvent = state.edgeBirthEvent?.get(edgeKey);
  const props: PropertyBag = {};
  for (const [propKey, register] of state.prop) {
    const entry = visibleEdgePropValue({ propKey, register, edge, birthEvent });
    if (entry) { props[entry.key] = entry.value; }
  }
  return props;
}

function isStaleEdgeProp(register: PropRegister, birthEvent: EventId | undefined): boolean {
  if (!birthEvent || !register.eventId) { return false; }
  return compareEventIds(register.eventId, birthEvent) < 0;
}

export async function neighborsImpl(host: WarpGraphWithMixins, params: { nodeId: string; direction: 'outgoing' | 'incoming' | 'both'; edgeLabel?: string }): Promise<NeighborEntry[]> {
  await host._ensureFreshState();
  const indexed = await tryIndexedNeighbors(host, params);
  if (indexed !== undefined) { return indexed; }
  if (host._cachedState === null) { return []; }
  const both = linearNeighborsForNode(host._cachedState, params.nodeId, params.edgeLabel);
  return filterByDirection(both, params.direction);
}

function hasNeighborIndex(host: WarpGraphWithMixins, nodeId: string): NeighborProviderPort | null {
  const provider = host._materializedGraph?.provider;
  if (!provider || host._logicalIndex?.isAlive(nodeId) !== true) { return null; }
  return provider;
}

async function tryIndexedNeighbors(host: WarpGraphWithMixins, params: { nodeId: string; direction: 'outgoing' | 'incoming' | 'both'; edgeLabel?: string }): Promise<NeighborEntry[] | undefined> {
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

export async function getStateSnapshotImpl(host: WarpGraphWithMixins): Promise<WarpState | null> {
  if (!host._cachedState && !host._autoMaterialize) { return null; }
  await host._ensureFreshState();
  if (!host._cachedState) { return null; }
  return createImmutableWarpState(host._cachedState);
}

export async function getNodesImpl(host: WarpGraphWithMixins): Promise<string[]> {
  const state = await ensureAndGetState(host);
  return [...state.nodeAlive.elements()];
}

export async function getEdgesImpl(host: WarpGraphWithMixins): Promise<Array<{ from: string; to: string; label: string; props: PropertyBag }>> {
  const state = await ensureAndGetState(host);
  const edgeProps = buildEdgePropsByKey(state);
  return buildEdgeList(state, edgeProps);
}

function buildEdgePropsByKey(state: WarpState): Map<string, PropertyBag> {
  const result = new Map<string, PropertyBag>();
  for (const [propKey, register] of state.prop) {
    if (!isEdgePropKey(propKey)) { continue; }
    addEdgePropEntry({ state, propKey, register, result });
  }
  return result;
}

function addEdgePropEntry(params: {
  state: WarpState;
  propKey: string;
  register: PropRegister;
  result: Map<string, PropertyBag>;
}): void {
  const { state, propKey, register, result } = params;
  const d = decodeEdgePropKey(propKey);
  const ek = encodeEdgeKey(d.from, d.to, d.label);
  if (isStaleEdgeProp(register, state.edgeBirthEvent?.get(ek))) { return; }
  let bag = result.get(ek);
  if (!bag) {
    bag = {};
    result.set(ek, bag);
  }
  bag[d.propKey] = register.value;
}

function buildEdgeList(state: WarpState, edgeProps: Map<string, PropertyBag>): Array<{ from: string; to: string; label: string; props: PropertyBag }> {
  const edges: Array<{ from: string; to: string; label: string; props: PropertyBag }> = [];
  for (const edgeKey of state.edgeAlive.elements()) {
    const { from, to, label } = decodeEdgeKey(edgeKey);
    if (!state.nodeAlive.contains(from) || !state.nodeAlive.contains(to)) { continue; }
    edges.push({ from, to, label, props: edgeProps.get(edgeKey) ?? {} });
  }
  return edges;
}

export async function getPropertyCountImpl(host: WarpGraphWithMixins): Promise<number> {
  const state = await ensureAndGetState(host);
  return state.prop.size;
}
