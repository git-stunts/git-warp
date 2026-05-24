import ORSet from '../../crdt/ORSet.ts';
import { LWWRegister } from '../../crdt/LWW.ts';
import VersionVector from '../../crdt/VersionVector.ts';
import EdgeRecord from '../../graph/EdgeRecord.ts';
import NodeRecord from '../../graph/NodeRecord.ts';
import WarpError from '../../errors/WarpError.ts';
import { encodeEdgeKey } from '../KeyCodec.ts';
import { createSnapshotPropValue } from '../ImmutableSnapshot.ts';
import ContentAttachmentProjection from '../ContentAttachmentProjection.ts';
import EdgePropertyProjection from '../EdgePropertyProjection.ts';
import NodePropertyProjection from '../NodePropertyProjection.ts';
import ImmutableBytes from '../snapshot/ImmutableBytes.ts';
import SnapshotWarpState from '../snapshot/SnapshotWarpState.ts';
import type ContentAttachmentRecord from '../../graph/ContentAttachmentRecord.ts';
import type { PropValue } from '../../types/PropValue.ts';
import type { SnapshotPropValue } from '../snapshot/SnapshotPropValue.ts';
import type VisibleEdgePropertyRecord from '../../graph/VisibleEdgePropertyRecord.ts';
import type VisibleNodePropertyRecord from '../../graph/VisibleNodePropertyRecord.ts';
import WarpState from './WarpState.ts';

// ── Public types ────────────────────────────────────────────────────────────

export type ContentMeta = { oid: string; mime: string | null; size: number | null };
export type NeighborEntry = { nodeId: string; label: string; direction: 'outgoing' | 'incoming' };
type OutgoingNeighborEntry = { nodeId: string; label: string; direction: 'outgoing' };
type IncomingNeighborEntry = { nodeId: string; label: string; direction: 'incoming' };
export type VisibleEdgeRef = { from: string; to: string; label: string };
export type VisiblePropertyBag = Readonly<{ [key: string]: SnapshotPropValue }>;
type MutableVisiblePropertyBag = { [key: string]: SnapshotPropValue };
export type VisibleEdgeView = { from: string; to: string; label: string; props: VisiblePropertyBag };
export type StateReaderSource = WarpState | SnapshotWarpState;
type VisibleProjectionProp = {
  node: string;
  key: string;
  value: PropValue;
};

export type StateReaderContext = {
  projection: {
    nodes: string[];
    edges: VisibleEdgeRef[];
    props: VisibleProjectionProp[];
  };
  visibleNodeIds: Set<string>;
  nodePropsById: Map<string, MutableVisiblePropertyBag>;
  edgePropsByKey: Map<string, MutableVisiblePropertyBag>;
  edges: VisibleEdgeView[];
  outgoingByNode: Map<string, OutgoingNeighborEntry[]>;
  incomingByNode: Map<string, IncomingNeighborEntry[]>;
  nodeContentMetaById: Map<string, ContentMeta | null>;
  edgeContentMetaByKey: Map<string, ContentMeta | null>;
};

// ── Edge key helper ──────────────────────────────────────────────────────────

/** Encodes a visible edge reference into a composite key string. */
export function edgeKeyFromRef(edge: VisibleEdgeRef): string {
  return encodeEdgeKey(edge.from, edge.to, edge.label);
}

/** Returns a projection-capable state from a live or immutable reader source. */
export function createStateReaderProjectionState(state: StateReaderSource): WarpState {
  if (state instanceof WarpState) {
    return state;
  }
  if (state instanceof SnapshotWarpState) {
    return warpStateFromSnapshot(state);
  }
  throw new WarpError('StateReader source must be a WarpState or SnapshotWarpState', 'E_VALIDATION');
}

// ── Cloning helpers ──────────────────────────────────────────────────────────

/** Shallow-clones a property bag. */
export function cloneBag(bag: VisiblePropertyBag): VisiblePropertyBag {
  const clone: MutableVisiblePropertyBag = {};
  for (const [key, value] of Object.entries(bag)) {
    clone[key] = value;
  }
  return Object.freeze(clone);
}

/** Shallow-clones content metadata or returns null. */
export function cloneMeta(meta: ContentMeta | null | undefined): ContentMeta | null {
  return meta ? { ...meta } : null;
}

/** Shallow-clones an array of neighbor entries. */
export function cloneNeighbors(entries: NeighborEntry[]): NeighborEntry[] {
  return entries.map((entry) => ({ ...entry }));
}

/** Hydrates an immutable public snapshot into a projection-local WarpState. */
function warpStateFromSnapshot(snapshot: SnapshotWarpState): WarpState {
  return new WarpState({
    nodeAlive: orsetFromSnapshot(snapshot.nodeAlive),
    edgeAlive: orsetFromSnapshot(snapshot.edgeAlive),
    prop: propMapFromSnapshot(snapshot.prop),
    observedFrontier: VersionVector.from(new Map(snapshot.observedFrontier.entries())),
    edgeBirthEvent: new Map(snapshot.edgeBirthEvent),
  });
}

/** Rebuilds an OR-Set from the immutable snapshot view. */
function orsetFromSnapshot(snapshot: SnapshotWarpState['nodeAlive']): ORSet {
  const entries = new Map<string, Set<string>>();
  for (const entry of snapshot.entries()) {
    entries.set(entry.element, new Set(entry.dots));
  }
  return new ORSet(entries, new Set(snapshot.tombstones()));
}

/** Rebuilds the property map from immutable snapshot registers. */
function propMapFromSnapshot(
  snapshot: SnapshotWarpState['prop'],
): Map<string, LWWRegister<PropValue>> {
  const props = new Map<string, LWWRegister<PropValue>>();
  for (const [key, register] of snapshot) {
    props.set(key, new LWWRegister(register.eventId, propValueFromSnapshot(register.value)));
  }
  return props;
}

/** Converts immutable snapshot values back into projection-local values. */
function propValueFromSnapshot(value: SnapshotPropValue): PropValue {
  if (value instanceof ImmutableBytes) {
    return value.toUint8Array();
  }
  if (Array.isArray(value)) {
    return value.map((entry) => propValueFromSnapshot(entry));
  }
  if (value !== null && typeof value === 'object') {
    const props: { [key: string]: PropValue } = {};
    for (const [key, entry] of Object.entries(value)) {
      props[key] = propValueFromSnapshot(entry);
    }
    return props;
  }
  return value;
}

// ── Index builders ───────────────────────────────────────────────────────────

/** Creates a map of node ID to empty property bags for population. */
export function createNodePropIndex(nodeIds: string[]): Map<string, MutableVisiblePropertyBag> {
  return new Map(
    nodeIds.map((nodeId) => [nodeId, {}]),
  );
}

/** Creates a map of edge key to empty property bags for population. */
export function createEdgePropIndex(edges: VisibleEdgeRef[]): Map<string, MutableVisiblePropertyBag> {
  return new Map(
    edges.map((edge) => [edgeKeyFromRef(edge), {}]),
  );
}

/** Builds outgoing and incoming neighbor indexes from visible nodes and edges. */
export function createNeighborIndex(
  nodeIds: string[],
  edges: VisibleEdgeRef[],
): {
  outgoingByNode: StateReaderContext['outgoingByNode'];
  incomingByNode: StateReaderContext['incomingByNode'];
} {
  const outgoingByNode = new Map<string, OutgoingNeighborEntry[]>(
    nodeIds.map((nodeId) => [nodeId, []]),
  );
  const incomingByNode = new Map<string, IncomingNeighborEntry[]>(
    nodeIds.map((nodeId) => [nodeId, []]),
  );

  for (const edge of edges) {
    outgoingByNode.get(edge.from)?.push({ nodeId: edge.to, label: edge.label, direction: 'outgoing' });
    incomingByNode.get(edge.to)?.push({ nodeId: edge.from, label: edge.label, direction: 'incoming' });
  }

  return { outgoingByNode, incomingByNode };
}

/** Builds projection-backed public node property rows from precomputed records. */
export function createProjectionProps(
  records: readonly VisibleNodePropertyRecord[],
): VisibleProjectionProp[] {
  return records.map((record) => ({
    node: record.owner.id.toString(),
    key: record.key.toString(),
    value: record.value.toPropValue(),
  }));
}

/** Populates node property indexes from projection records. */
export function populateVisibleNodeProps(
  records: readonly VisibleNodePropertyRecord[],
  nodePropsById: Map<string, MutableVisiblePropertyBag>,
): void {
  for (const record of records) {
    const props = nodePropsById.get(record.owner.id.toString());
    if (props !== undefined) {
      props[record.key.toString()] = createSnapshotPropValue(record.value.toPropValue());
    }
  }
}

/** Populates edge property indexes from projection records. */
export function populateVisibleEdgeProps(
  records: readonly VisibleEdgePropertyRecord[],
  edgePropsByKey: Map<string, MutableVisiblePropertyBag>,
): void {
  for (const record of records) {
    const props = edgePropsByKey.get(edgeKeyFromRecord(record.owner));
    if (props !== undefined) {
      props[record.key.toString()] = createSnapshotPropValue(record.value.toPropValue());
    }
  }
}

/** Creates visible edge views with cloned property bags. */
export function createVisibleEdges(
  edges: VisibleEdgeRef[],
  edgePropsByKey: Map<string, MutableVisiblePropertyBag>,
): VisibleEdgeView[] {
  return edges.map((edge) => ({
    ...edge,
    props: cloneBag(edgePropsByKey.get(edgeKeyFromRef(edge)) ?? Object.freeze({})),
  }));
}

/** Builds a content metadata index for all visible nodes. */
export function createNodeContentMetaIndex(
  state: WarpState,
  nodeIds: string[],
): Map<string, ContentMeta | null> {
  const byNodeId: Map<string, ContentMeta | null> = new Map(
    nodeIds.map((nodeId) => [nodeId, null]),
  );
  for (const record of ContentAttachmentProjection.fromState(state)) {
    if (record.owner instanceof NodeRecord) {
      byNodeId.set(record.owner.id.toString(), contentMetaFromRecord(record));
    }
  }
  return byNodeId;
}

/** Builds a content metadata index for all visible edges. */
export function createEdgeContentMetaIndex(
  state: WarpState,
  edges: VisibleEdgeRef[],
): Map<string, ContentMeta | null> {
  const byEdgeKey: Map<string, ContentMeta | null> = new Map(
    edges.map((edge) => [edgeKeyFromRef(edge), null]),
  );
  for (const record of ContentAttachmentProjection.fromState(state)) {
    if (record.owner instanceof EdgeRecord) {
      byEdgeKey.set(edgeKeyFromRecord(record.owner), contentMetaFromRecord(record));
    }
  }
  return byEdgeKey;
}

/** Returns projection records for visible node properties. */
export function createNodePropertyRecords(state: WarpState): readonly VisibleNodePropertyRecord[] {
  return NodePropertyProjection.fromState(state);
}

/** Returns projection records for visible edge properties. */
export function createEdgePropertyRecords(state: WarpState): readonly VisibleEdgePropertyRecord[] {
  return EdgePropertyProjection.fromState(state);
}

/** Encodes an edge record into the state-reader edge key. */
function edgeKeyFromRecord(record: EdgeRecord): string {
  return edgeKeyFromRef({
    from: record.from.toString(),
    to: record.to.toString(),
    label: record.typeId.toString(),
  });
}

/** Converts a typed content attachment record into public reader metadata. */
function contentMetaFromRecord(record: ContentAttachmentRecord): ContentMeta {
  return {
    oid: record.payload.oid.toString(),
    mime: record.payload.mime?.toString() ?? null,
    size: record.payload.size?.toNumber() ?? null,
  };
}
