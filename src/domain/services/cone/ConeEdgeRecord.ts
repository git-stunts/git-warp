import type { LWWRegister } from '../../crdt/LWW.ts';
import type { PropValue } from '../../types/PropValue.ts';
import ConeRecordError from '../../errors/ConeRecordError.ts';
import type { EventId } from '../../utils/EventId.ts';
import { decodeEdgeKey } from '../KeyCodec.ts';
import ConeConcurrency from './ConeConcurrency.ts';
import ConeRecordKey from './ConeRecordKey.ts';
import { sameEvent, sameMembers, sameRegisters } from './ConeRecordEquality.ts';
import {
  requireDots,
  requireEventOrNull,
  requireIdentity,
  requireRegisters,
} from './ConeRecordValidation.ts';

/** Constructor fields of an edge record. */
export type ConeEdgeRecordFields = {
  /** The encoded edge key (`from\0to\0label`). */
  readonly edgeKey: string;
  readonly addDots: ReadonlySet<string>;
  readonly tombstones: ReadonlySet<string>;
  readonly birth: EventId | null;
  readonly remove: EventId | null;
  /** Property key (not encoded) to its LWW register. */
  readonly props: ReadonlyMap<string, LWWRegister<PropValue>>;
  /** The edge's concurrent register writes and lifecycle effects; none when omitted. */
  readonly concurrency?: ConeConcurrency;
};

/**
 * Everything the join rules know about one edge: its OR-Set membership
 * evidence, its latest add (birth) and remove events, and its property
 * registers. Whether the edge is visible also depends on both endpoints'
 * records, so the record carries no visibility of its own.
 */
export default class ConeEdgeRecord {
  readonly edgeKey: string;
  readonly from: string;
  readonly to: string;
  readonly label: string;
  readonly addDots: ReadonlySet<string>;
  readonly tombstones: ReadonlySet<string>;
  readonly birth: EventId | null;
  readonly remove: EventId | null;
  readonly props: ReadonlyMap<string, LWWRegister<PropValue>>;
  readonly concurrency: ConeConcurrency;

  constructor(fields: ConeEdgeRecordFields) {
    this.edgeKey = requireIdentity(fields.edgeKey, 'edgeKey');
    const { from, to, label } = decodeEdgeKey(this.edgeKey);
    this.from = requireIdentity(from, 'from');
    this.to = requireIdentity(to, 'to');
    this.label = requireIdentity(label, 'label');
    this.addDots = requireDots(fields.addDots, 'addDots');
    this.tombstones = requireDots(fields.tombstones, 'tombstones');
    this.birth = requireEventOrNull(fields.birth, 'birth');
    this.remove = requireEventOrNull(fields.remove, 'remove');
    this.props = requireRegisters(fields.props);
    this.concurrency = fields.concurrency ?? ConeConcurrency.empty();
    if (!(this.concurrency instanceof ConeConcurrency)) {
      throw new ConeRecordError('Cone record concurrency must be a ConeConcurrency');
    }
    Object.freeze(this);
  }

  /** The record of an edge no operation has named yet. */
  static empty(edgeKey: string): ConeEdgeRecord {
    return new ConeEdgeRecord({
      edgeKey, addDots: new Set(), tombstones: new Set(), birth: null, remove: null, props: new Map(),
    });
  }

  key(): ConeRecordKey {
    return ConeRecordKey.forEdge(this.edgeKey);
  }

  /** The add dots no remove of this edge has observed. */
  liveDots(): ReadonlySet<string> {
    return new Set([...this.addDots].filter((dot) => !this.tombstones.has(dot)));
  }

  /** OR-Set membership of the edge itself, before endpoint liveness. */
  isAlive(): boolean {
    return this.liveDots().size > 0;
  }

  /** This record with `concurrency` retained. */
  withConcurrency(concurrency: ConeConcurrency): ConeEdgeRecord {
    const { edgeKey, addDots, tombstones, birth, remove, props } = this;
    return new ConeEdgeRecord({ edgeKey, addDots, tombstones, birth, remove, props, concurrency });
  }

  /** True when no operation has left any evidence in this record. */
  isEmpty(): boolean {
    return this.equals(ConeEdgeRecord.empty(this.edgeKey));
  }

  equals(other: ConeEdgeRecord): boolean {
    return other.edgeKey === this.edgeKey && this.sameMembership(other) && this.sameLifecycle(other)
      && sameRegisters(other.props, this.props) && other.concurrency.equals(this.concurrency);
  }

  private sameMembership(other: ConeEdgeRecord): boolean {
    return sameMembers(other.addDots, this.addDots) && sameMembers(other.tombstones, this.tombstones);
  }

  private sameLifecycle(other: ConeEdgeRecord): boolean {
    return sameEvent(other.birth, this.birth) && sameEvent(other.remove, this.remove);
  }
}
