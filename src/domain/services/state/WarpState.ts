/**
 * WarpState — the core CRDT materialized state object.
 *
 * Holds the alive sets (OR-Set for nodes and edges), property registers
 * (LWW), the observed version vector frontier, and edge birth events.
 *
 * @module domain/services/state/WarpState
 */

import ORSet from '../../crdt/ORSet.ts';
import VersionVector from '../../crdt/VersionVector.ts';
import { lwwMax, type LWWRegister } from '../../crdt/LWW.ts';
import { compareEventIds, type EventId } from '../../utils/EventId.ts';
import AttachmentKey from '../../graph/AttachmentKey.ts';
import AttachmentRecord from '../../graph/AttachmentRecord.ts';
import AttachmentSchemaVersion from '../../graph/AttachmentSchemaVersion.ts';
import EdgeId from '../../graph/EdgeId.ts';
import EdgeRecord from '../../graph/EdgeRecord.ts';
import NodeId from '../../graph/NodeId.ts';
import NodeRecord from '../../graph/NodeRecord.ts';
import { decodeEdgeKey, decodeEdgePropKey, decodePropKey, encodeEdgeKey, isEdgePropKey } from '../KeyCodec.ts';
import type { PropValue } from '../../types/PropValue.ts';

/**
 * The CRDT materialized state for a WARP graph.
 *
 * This is an entity, not a frozen value object: reduce paths mutate a
 * live instance in place for performance, then callers clone or snapshot
 * before handing state to consumers that expect isolation.
 */
export default class WarpState {
  nodeAlive: ORSet;
  edgeAlive: ORSet;
  prop: Map<string, LWWRegister<PropValue>>;
  observedFrontier: VersionVector;
  /** EdgeKey → EventId of most recent EdgeAdd (for clean-slate prop visibility). */
  edgeBirthEvent: Map<string, EventId>;

  constructor(fields: {
    nodeAlive: ORSet;
    edgeAlive: ORSet;
    prop: Map<string, LWWRegister<PropValue>>;
    observedFrontier: VersionVector;
    edgeBirthEvent?: Map<string, EventId>;
  }) {
    this.nodeAlive = fields.nodeAlive;
    this.edgeAlive = fields.edgeAlive;
    this.prop = fields.prop;
    this.observedFrontier = fields.observedFrontier;
    this.edgeBirthEvent = fields.edgeBirthEvent ?? new Map<string, EventId>();
  }

  /** Creates an empty state with fresh OR-Sets and version vector. */
  static empty(): WarpState {
    return new WarpState({
      nodeAlive: ORSet.empty(),
      edgeAlive: ORSet.empty(),
      prop: new Map(),
      observedFrontier: VersionVector.empty(),
      edgeBirthEvent: new Map(),
    });
  }

  /** Returns live graph nodes as deterministic runtime-backed records. */
  nodeRecords(): readonly NodeRecord[] {
    const nodeIds = this.nodeAlive.elements().sort(compareStrings);
    const records = nodeIds.map((nodeId) => NodeRecord.fromLegacyNodeId(nodeId));
    return Object.freeze(records);
  }

  /** Returns the live graph node record for the given id, if present. */
  getNodeRecord(nodeId: string | NodeId): NodeRecord | null {
    const id = normalizeNodeId(nodeId);
    if (!this.nodeAlive.contains(id.toString())) {
      return null;
    }
    return NodeRecord.fromLegacyNodeId(id.toString());
  }

  /** Returns true when the given node id has a live graph node record. */
  hasNodeRecord(nodeId: string | NodeId): boolean {
    return this.getNodeRecord(nodeId) !== null;
  }

  /** Returns visible graph edges as deterministic runtime-backed records. */
  edgeRecords(): readonly EdgeRecord[] {
    const records: EdgeRecord[] = [];
    for (const edgeKey of this.edgeAlive.elements()) {
      const edge = decodeEdgeKey(edgeKey);
      if (!this.hasNodeRecord(edge.from) || !this.hasNodeRecord(edge.to)) {
        continue;
      }
      records.push(EdgeRecord.fromLegacyEdge(edge));
    }
    records.sort(compareEdgeRecords);
    return Object.freeze(records);
  }

  /** Returns the visible graph edge record for the given id, if present. */
  getEdgeRecord(edgeId: string | EdgeId): EdgeRecord | null {
    const id = normalizeEdgeId(edgeId);
    for (const record of this.edgeRecords()) {
      if (record.id.equals(id)) {
        return record;
      }
    }
    return null;
  }

  /** Returns true when the given edge id has a visible graph edge record. */
  hasEdgeRecord(edgeId: string | EdgeId): boolean {
    return this.getEdgeRecord(edgeId) !== null;
  }

  /** Returns visible node and edge payloads as deterministic attachment records. */
  attachmentRecords(): readonly AttachmentRecord[] {
    const records: AttachmentRecord[] = [];
    for (const [propKey, register] of this.prop) {
      const record = attachmentRecordForProperty(this, propKey, register);
      if (record !== null) {
        records.push(record);
      }
    }
    records.sort(compareAttachmentRecords);
    return Object.freeze(records);
  }

  /** Creates a deep clone with independent data structures. */
  clone(): WarpState {
    return new WarpState({
      nodeAlive: this.nodeAlive.clone(),
      edgeAlive: this.edgeAlive.clone(),
      prop: new Map(this.prop),
      observedFrontier: this.observedFrontier.clone(),
      edgeBirthEvent: new Map(this.edgeBirthEvent),
    });
  }

  /**
   * Normalizes a plain-object or deserialized state into a live
   * `WarpState` instance with cloned inner structures. Used by the
   * reducer and checkpoint loader to accept either class instances or
   * hydrated POJOs at the boundary.
   */
  static cloneFromSnapshot(state: WarpState | {
    readonly nodeAlive: ORSet;
    readonly edgeAlive: ORSet;
    readonly prop: Map<string, LWWRegister<PropValue>>;
    readonly observedFrontier: VersionVector;
    readonly edgeBirthEvent?: Map<string, EventId>;
  }): WarpState {
    if (state instanceof WarpState) {
      return state.clone();
    }
    return new WarpState({
      nodeAlive: state.nodeAlive.clone(),
      edgeAlive: state.edgeAlive.clone(),
      prop: new Map(state.prop),
      observedFrontier: state.observedFrontier.clone(),
      edgeBirthEvent: new Map(state.edgeBirthEvent ?? []),
    });
  }

  /**
   * CRDT join with another state. Pure — does not mutate either input.
   * Components merge as:
   * - `nodeAlive` / `edgeAlive`: OR-Set join
   * - `prop`: LWW-Max per key
   * - `observedFrontier`: VersionVector merge (component-wise max)
   * - `edgeBirthEvent`: EventId max per edge key
   */
  join(other: WarpState): WarpState {
    return new WarpState({
      nodeAlive: this.nodeAlive.join(other.nodeAlive),
      edgeAlive: this.edgeAlive.join(other.edgeAlive),
      prop: WarpState._mergeProps(this.prop, other.prop),
      observedFrontier: this.observedFrontier.merge(other.observedFrontier),
      edgeBirthEvent: WarpState._mergeEdgeBirthEvent(this.edgeBirthEvent, other.edgeBirthEvent),
    });
  }

  /**
   * Folds a patch's context version vector AND its own dot
   * (writer, lamport) into this state's `observedFrontier`. Mutates
   * `this.observedFrontier` in place.
   */
  foldPatch(patch: {
    readonly writer: string;
    readonly lamport: number;
    readonly context: VersionVector | Map<string, number> | Record<string, number> | null | undefined;
  }): void {
    const contextVV = patch.context instanceof VersionVector
      ? patch.context
      : VersionVector.from(patch.context ?? {});
    this.observedFrontier = this.observedFrontier.merge(contextVV);
    const current = this.observedFrontier.get(patch.writer) ?? 0;
    if (patch.lamport > current) {
      this.observedFrontier.set(patch.writer, patch.lamport);
    }
  }

  /** LWW-Max merge of two property maps. */
  private static _mergeProps(
    a: Map<string, LWWRegister<PropValue>>,
    b: Map<string, LWWRegister<PropValue>>,
  ): Map<string, LWWRegister<PropValue>> {
    const result = new Map(a);
    for (const [key, regB] of b) {
      const regA = result.get(key);
      const winner = lwwMax(regA, regB);
      if (winner !== null) {
        result.set(key, winner);
      }
    }
    return result;
  }

  /** EventId-max merge of two edge-birth-event maps. */
  private static _mergeEdgeBirthEvent(
    a: Map<string, EventId> | null | undefined,
    b: Map<string, EventId> | null | undefined,
  ): Map<string, EventId> {
    const result = new Map(a ?? []);
    if (b) {
      for (const [key, eventId] of b) {
        const existing = result.get(key);
        if (!existing || compareEventIds(eventId, existing) > 0) {
          result.set(key, eventId);
        }
      }
    }
    return result;
  }
}

/** Normalizes an edge id carrier for state record reads. */
function normalizeEdgeId(value: string | EdgeId): EdgeId {
  if (value instanceof EdgeId) {
    return value;
  }
  return new EdgeId(value);
}

/** Normalizes a node id carrier for state record reads. */
function normalizeNodeId(value: string | NodeId): NodeId {
  if (value instanceof NodeId) {
    return value;
  }
  return new NodeId(value);
}

/** Compares edge records by deterministic id order. */
function compareEdgeRecords(left: EdgeRecord, right: EdgeRecord): number {
  return compareStrings(left.id.toString(), right.id.toString());
}

/** Builds a visible attachment record from a legacy property map entry. */
function attachmentRecordForProperty(
  state: WarpState,
  propKey: string,
  register: LWWRegister<PropValue>,
): AttachmentRecord | null {
  if (isEdgePropKey(propKey)) {
    return edgeAttachmentRecordForProperty(state, propKey, register);
  }
  return nodeAttachmentRecordForProperty(state, propKey, register);
}

/** Builds a node-owned attachment record from a legacy node property. */
function nodeAttachmentRecordForProperty(
  state: WarpState,
  propKey: string,
  register: LWWRegister<PropValue>,
): AttachmentRecord | null {
  const decoded = decodePropKey(propKey);
  const owner = state.getNodeRecord(decoded.nodeId);
  if (owner === null) {
    return null;
  }
  return new AttachmentRecord({
    owner,
    key: new AttachmentKey(decoded.propKey),
    value: register.value,
    schemaVersion: AttachmentSchemaVersion.current(),
  });
}

/** Builds an edge-owned attachment record from a legacy edge property. */
function edgeAttachmentRecordForProperty(
  state: WarpState,
  propKey: string,
  register: LWWRegister<PropValue>,
): AttachmentRecord | null {
  const decoded = decodeEdgePropKey(propKey);
  const edgeKey = encodeEdgeKey(decoded.from, decoded.to, decoded.label);
  if (isStaleEdgeAttachment(register, state.edgeBirthEvent.get(edgeKey))) {
    return null;
  }
  const candidate = EdgeRecord.fromLegacyEdge(decoded);
  const owner = state.getEdgeRecord(candidate.id);
  if (owner === null) {
    return null;
  }
  return new AttachmentRecord({
    owner,
    key: new AttachmentKey(decoded.propKey),
    value: register.value,
    schemaVersion: AttachmentSchemaVersion.current(),
  });
}

/** Returns true when an edge attachment predates the current edge birth. */
function isStaleEdgeAttachment(
  register: LWWRegister<PropValue>,
  birthEvent: EventId | undefined,
): boolean {
  if (birthEvent === undefined || register.eventId === null) {
    return false;
  }
  return compareEventIds(register.eventId, birthEvent) < 0;
}

/** Compares attachment records by deterministic owner/key order. */
function compareAttachmentRecords(left: AttachmentRecord, right: AttachmentRecord): number {
  return compareStrings(attachmentRecordSortKey(left), attachmentRecordSortKey(right));
}

/** Returns the deterministic sort key for an attachment record. */
function attachmentRecordSortKey(record: AttachmentRecord): string {
  if (record.owner instanceof NodeRecord) {
    return `node:${record.owner.id.toString()}:${record.key.toString()}`;
  }
  return `edge:${record.owner.id.toString()}:${record.key.toString()}`;
}

/** Compares protocol strings without locale-sensitive collation. */
function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}
