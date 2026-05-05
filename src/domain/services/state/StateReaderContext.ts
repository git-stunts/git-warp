import { compareEventIds, type EventId } from '../../utils/EventId.ts';
import { type LWWRegister } from '../../crdt/LWW.ts';
import {
  CONTENT_MIME_PROPERTY_KEY,
  CONTENT_PROPERTY_KEY,
  CONTENT_SIZE_PROPERTY_KEY,
  decodeEdgePropKey,
  decodePropKey,
  encodeEdgeKey,
  encodeEdgePropKey,
  encodePropKey,
  isEdgePropKey,
} from '../KeyCodec.ts';
import { createSnapshotPropValue } from '../ImmutableSnapshot.ts';
import type { PropValue } from '../../types/PropValue.ts';
import type { SnapshotPropValue } from '../snapshot/SnapshotPropValue.ts';
import type WarpState from './WarpState.ts';

// ── Public types ────────────────────────────────────────────────────────────

export type ContentMeta = { oid: string; mime: string | null; size: number | null };
export type NeighborEntry = { nodeId: string; label: string; direction: 'outgoing' | 'incoming' };
type OutgoingNeighborEntry = { nodeId: string; label: string; direction: 'outgoing' };
type IncomingNeighborEntry = { nodeId: string; label: string; direction: 'incoming' };
export type VisibleEdgeRef = { from: string; to: string; label: string };
export type VisiblePropertyBag = Readonly<{ [key: string]: SnapshotPropValue }>;
type MutableVisiblePropertyBag = { [key: string]: SnapshotPropValue };
export type VisibleEdgeView = { from: string; to: string; label: string; props: VisiblePropertyBag };
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

// ── Attachment lineage helpers ───────────────────────────────────────────────

/**
 * Returns true when two registers were written in the same patch lineage.
 *
 * Content metadata is stored in sibling properties, so read-side helpers only
 * treat `_content.mime` / `_content.size` as current when they were written in
 * the same patch as the live `_content` reference.
 */
function isSameAttachmentLineage(
  contentEventId: EventId | undefined,
  candidateEventId: EventId | undefined,
): boolean {
  return Boolean(
    contentEventId
      && candidateEventId
      && contentEventId.lamport === candidateEventId.lamport
      && contentEventId.writerId === candidateEventId.writerId
      && contentEventId.patchSha === candidateEventId.patchSha,
  );
}

/**
 * Filters an edge-property register against the edge birth event.
 */
function visibleEdgeRegister(
  register: LWWRegister<PropValue> | undefined,
  birthEvent: EventId | undefined,
): LWWRegister<PropValue> | null {
  if (!register) {
    return null;
  }
  if (birthEvent && compareEventIds(register.eventId, birthEvent) < 0) {
    return null;
  }
  return register;
}

// ── Edge key helper ──────────────────────────────────────────────────────────

/** Encodes a visible edge reference into a composite key string. */
export function edgeKeyFromRef(edge: VisibleEdgeRef): string {
  return encodeEdgeKey(edge.from, edge.to, edge.label);
}

// ── Content register helpers ─────────────────────────────────────────────────

type ContentRegisters = {
  contentRegister: LWWRegister<string>;
  mimeRegister: LWWRegister<PropValue> | null;
  sizeRegister: LWWRegister<PropValue> | null;
};

/** Looks up the current node attachment registers directly from materialized state. */
export function getNodeContentRegisters(state: WarpState, nodeId: string): ContentRegisters | null {
  if (!state.nodeAlive.contains(nodeId)) {
    return null;
  }
  const contentRegister = state.prop.get(encodePropKey(nodeId, CONTENT_PROPERTY_KEY));
  if (!contentRegister || typeof contentRegister.value !== 'string') {
    return null;
  }
  return {
    contentRegister: contentRegister as LWWRegister<string>,
    mimeRegister: state.prop.get(encodePropKey(nodeId, CONTENT_MIME_PROPERTY_KEY)) ?? null,
    sizeRegister: state.prop.get(encodePropKey(nodeId, CONTENT_SIZE_PROPERTY_KEY)) ?? null,
  };
}

/** Looks up the current edge attachment registers directly from materialized state. */
export function getEdgeContentRegisters(state: WarpState, edge: VisibleEdgeRef): ContentRegisters | null {
  const edgeKey = edgeKeyFromRef(edge);
  if (!state.edgeAlive.contains(edgeKey)) {
    return null;
  }
  if (!state.nodeAlive.contains(edge.from) || !state.nodeAlive.contains(edge.to)) {
    return null;
  }

  const birthEvent = state.edgeBirthEvent?.get(edgeKey);

  function getRegister(propKey: string): LWWRegister<PropValue> | null {
    return visibleEdgeRegister(
      state.prop.get(encodeEdgePropKey(edge.from, edge.to, edge.label, propKey)),
      birthEvent,
    );
  }

  const contentRegister = getRegister(CONTENT_PROPERTY_KEY);
  if (!contentRegister || typeof contentRegister.value !== 'string') {
    return null;
  }

  return {
    contentRegister: contentRegister as LWWRegister<string>,
    mimeRegister: getRegister(CONTENT_MIME_PROPERTY_KEY),
    sizeRegister: getRegister(CONTENT_SIZE_PROPERTY_KEY),
  };
}

// ── Metadata extraction helpers ──────────────────────────────────────────────

/** Reads the value of an attachment sibling if it shares the same lineage. */
function readAttachmentSiblingValue(
  contentEventId: EventId | undefined,
  register: LWWRegister<PropValue> | null | undefined,
): PropValue | null {
  if (!isSameAttachmentLineage(contentEventId, register?.eventId)) {
    return null;
  }
  return register?.value ?? null;
}

/** Coerces a value to a MIME string or returns null. */
function coerceMime(value: PropValue | null): string | null {
  return typeof value === 'string' ? value : null;
}

/** Coerces a value to a non-negative integer size or returns null. */
function coerceSize(value: PropValue | null): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

/** Extracts structured content metadata from attachment sibling properties. */
export function extractContentMeta(
  contentRegister: LWWRegister<string>,
  mimeRegister: LWWRegister<PropValue> | null,
  sizeRegister: LWWRegister<PropValue> | null,
): ContentMeta {
  return {
    oid: contentRegister.value,
    mime: coerceMime(readAttachmentSiblingValue(contentRegister.eventId, mimeRegister)),
    size: coerceSize(readAttachmentSiblingValue(contentRegister.eventId, sizeRegister)),
  };
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

/** Populates node and edge property indexes from materialized state registers. */
export function populateVisibleProps(
  state: WarpState,
  indexes: {
    visibleNodeIds: Set<string>;
    nodePropsById: Map<string, MutableVisiblePropertyBag>;
    edgePropsByKey: Map<string, MutableVisiblePropertyBag>;
  },
): void {
  const { visibleNodeIds, nodePropsById, edgePropsByKey } = indexes;
  for (const [propKey, register] of state.prop) {
    if (!isEdgePropKey(propKey)) {
      const { nodeId, propKey: key } = decodePropKey(propKey);
      if (visibleNodeIds.has(nodeId)) {
        nodePropsById.get(nodeId)![key] = createSnapshotPropValue(register.value);
      }
      continue;
    }

    const decoded = decodeEdgePropKey(propKey);
    const edge = { from: decoded.from, to: decoded.to, label: decoded.label };
    const edgeKey = edgeKeyFromRef(edge);
    const props = edgePropsByKey.get(edgeKey);
    const birthEvent = state.edgeBirthEvent?.get(edgeKey);
    if (
      props === undefined
      || (birthEvent !== undefined
        && register.eventId !== null
        && register.eventId !== undefined
        && compareEventIds(register.eventId, birthEvent) < 0)
    ) {
      continue;
    }
    props[decoded.propKey] = createSnapshotPropValue(register.value);
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
  return new Map(
    nodeIds.map((nodeId) => {
      const registers = getNodeContentRegisters(state, nodeId);
      return [
        nodeId,
        registers
          ? extractContentMeta(registers.contentRegister, registers.mimeRegister, registers.sizeRegister)
          : null,
      ];
    }),
  );
}

/** Builds a content metadata index for all visible edges. */
export function createEdgeContentMetaIndex(
  state: WarpState,
  edges: VisibleEdgeRef[],
): Map<string, ContentMeta | null> {
  return new Map(
    edges.map((edge) => {
      const registers = getEdgeContentRegisters(state, edge);
      return [
        edgeKeyFromRef(edge),
        registers
          ? extractContentMeta(registers.contentRegister, registers.mimeRegister, registers.sizeRegister)
          : null,
      ];
    }),
  );
}
