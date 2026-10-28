import type { LWWRegister } from '../../crdt/LWW.ts';
import type { PropValue } from '../../types/PropValue.ts';
import type { EventId } from '../../utils/EventId.ts';
import ConeRecordKey, { type ConeDirection } from './ConeRecordKey.ts';
import { sameEvent, sameMembers, sameRegisters } from './ConeRecordEquality.ts';
import {
  requireCount,
  requireDots,
  requireEventOrNull,
  requireIdentity,
  requireRegisters,
} from './ConeRecordValidation.ts';

/** Constructor fields of a node record. */
export type ConeNodeRecordFields = {
  readonly nodeId: string;
  /** Every dot that ever added this node, live or tombstoned. */
  readonly addDots: ReadonlySet<string>;
  /** Every dot a remove of this node named, including dots not yet added here. */
  readonly tombstones: ReadonlySet<string>;
  readonly birth: EventId | null;
  readonly clear: EventId | null;
  /** Property key (not encoded) to its LWW register. */
  readonly props: ReadonlyMap<string, LWWRegister<PropValue>>;
  /** Number of edge keys registered with this node as `from`. */
  readonly outDegree: number;
  /** Number of edge keys registered with this node as `to`. */
  readonly inDegree: number;
};

/**
 * Everything the join rules know about one node: its OR-Set membership
 * evidence, its birth and clear events (current reducers leave the legacy
 * pending-remove list empty, so records do not carry it), its property
 * registers, and how many edge
 * keys reference it in each direction. The edge keys themselves live in
 * bounded adjacency pages, so a hub's record stays small.
 *
 * Records hold no derived visibility; readers compute it from records.
 */
export default class ConeNodeRecord {
  readonly nodeId: string;
  readonly addDots: ReadonlySet<string>;
  readonly tombstones: ReadonlySet<string>;
  readonly birth: EventId | null;
  readonly clear: EventId | null;
  readonly props: ReadonlyMap<string, LWWRegister<PropValue>>;
  readonly outDegree: number;
  readonly inDegree: number;

  constructor(fields: ConeNodeRecordFields) {
    this.nodeId = requireIdentity(fields.nodeId, 'nodeId');
    this.addDots = requireDots(fields.addDots, 'addDots');
    this.tombstones = requireDots(fields.tombstones, 'tombstones');
    this.birth = requireEventOrNull(fields.birth, 'birth');
    this.clear = requireEventOrNull(fields.clear, 'clear');
    this.props = requireRegisters(fields.props);
    this.outDegree = requireCount(fields.outDegree, 'outDegree');
    this.inDegree = requireCount(fields.inDegree, 'inDegree');
    Object.freeze(this);
  }

  /** The record of a node no operation has named yet. */
  static empty(nodeId: string): ConeNodeRecord {
    return new ConeNodeRecord({
      nodeId, addDots: new Set(), tombstones: new Set(), birth: null, clear: null,
      props: new Map(), outDegree: 0, inDegree: 0,
    });
  }

  key(): ConeRecordKey {
    return ConeRecordKey.forNode(this.nodeId);
  }

  /** The add dots no remove of this node has observed. */
  liveDots(): ReadonlySet<string> {
    return new Set([...this.addDots].filter((dot) => !this.tombstones.has(dot)));
  }

  /** OR-Set membership: at least one add dot is not tombstoned. */
  isAlive(): boolean {
    return this.liveDots().size > 0;
  }

  /** Number of edge keys registered in one direction. */
  degree(direction: ConeDirection): number {
    return direction === 'out' ? this.outDegree : this.inDegree;
  }

  /** This record with one more edge key registered in `direction`. */
  withRegisteredEdge(direction: ConeDirection): ConeNodeRecord {
    return new ConeNodeRecord({
      ...this.fields(),
      outDegree: this.outDegree + (direction === 'out' ? 1 : 0),
      inDegree: this.inDegree + (direction === 'in' ? 1 : 0),
    });
  }

  /** True when no operation has left any evidence in this record. */
  isEmpty(): boolean {
    return this.equals(ConeNodeRecord.empty(this.nodeId));
  }

  equals(other: ConeNodeRecord): boolean {
    return this.sameElementState(other) && this.sameAdjacency(other);
  }

  /**
   * True when both records hold the same join state for the node itself:
   * membership, lifecycle and property registers. Edge registrations are
   * not compared, because an edge another writer added to this node does not
   * change what an operation on the node observes.
   */
  sameElementState(other: ConeNodeRecord): boolean {
    return other.nodeId === this.nodeId && this.sameMembership(other) && this.sameLifecycle(other)
      && sameRegisters(other.props, this.props);
  }

  /** The constructor fields of this record, for derived copies. */
  fields(): ConeNodeRecordFields {
    return {
      nodeId: this.nodeId, addDots: this.addDots, tombstones: this.tombstones, birth: this.birth,
      clear: this.clear, props: this.props,
      outDegree: this.outDegree, inDegree: this.inDegree,
    };
  }

  private sameMembership(other: ConeNodeRecord): boolean {
    return sameMembers(other.addDots, this.addDots) && sameMembers(other.tombstones, this.tombstones);
  }

  private sameAdjacency(other: ConeNodeRecord): boolean {
    return other.outDegree === this.outDegree && other.inDegree === this.inDegree;
  }

  private sameLifecycle(other: ConeNodeRecord): boolean {
    return sameEvent(other.birth, this.birth) && sameEvent(other.clear, this.clear);
  }
}
