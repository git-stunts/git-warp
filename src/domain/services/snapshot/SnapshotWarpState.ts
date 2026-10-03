import { type LWWRegister } from '../../crdt/LWW.ts';
import type { EventId } from '../../utils/EventId.ts';
import type LegacyEventId from '../../utils/LegacyEventId.ts';
import type SnapshotORSet from './SnapshotORSet.ts';
import type { SnapshotPropValue } from './SnapshotPropValue.ts';
import type SnapshotVersionVector from './SnapshotVersionVector.ts';

/**
 * Public immutable read-side view of materialized graph state.
 */
export default class SnapshotWarpState {
  readonly nodeAlive: SnapshotORSet;
  readonly edgeAlive: SnapshotORSet;
  readonly prop: ReadonlyMap<string, LWWRegister<SnapshotPropValue>>;
  readonly observedFrontier: SnapshotVersionVector;
  readonly edgeBirthEvent: ReadonlyMap<string, EventId | LegacyEventId>;
  readonly nodeBirthEvent: ReadonlyMap<string, EventId>;
  readonly nodeClearEvent: ReadonlyMap<string, EventId>;
  readonly nodePendingRemoveEvents: ReadonlyMap<string, readonly EventId[]>;
  readonly edgeRemoveEvent: ReadonlyMap<string, EventId>;

  constructor(fields: {
    nodeAlive: SnapshotORSet;
    edgeAlive: SnapshotORSet;
    prop: ReadonlyMap<string, LWWRegister<SnapshotPropValue>>;
    observedFrontier: SnapshotVersionVector;
    edgeBirthEvent: ReadonlyMap<string, EventId | LegacyEventId>;
    nodeBirthEvent?: ReadonlyMap<string, EventId>;
    nodeClearEvent?: ReadonlyMap<string, EventId>;
    nodePendingRemoveEvents?: ReadonlyMap<string, readonly EventId[]>;
    edgeRemoveEvent?: ReadonlyMap<string, EventId>;
  }) {
    this.nodeAlive = fields.nodeAlive;
    this.edgeAlive = fields.edgeAlive;
    this.prop = fields.prop;
    this.observedFrontier = fields.observedFrontier;
    this.edgeBirthEvent = fields.edgeBirthEvent;
    this.nodeBirthEvent = fields.nodeBirthEvent ?? new Map<string, EventId>();
    this.nodeClearEvent = fields.nodeClearEvent ?? new Map<string, EventId>();
    this.nodePendingRemoveEvents = fields.nodePendingRemoveEvents ?? new Map<string, readonly EventId[]>();
    this.edgeRemoveEvent = fields.edgeRemoveEvent ?? new Map<string, EventId>();
    Object.freeze(this);
  }
}
