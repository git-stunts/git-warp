import { LWWRegister } from '../../crdt/LWW.ts';
import type { EventId } from '../../utils/EventId.ts';
import SnapshotORSet from './SnapshotORSet.ts';
import type { SnapshotPropValue } from './SnapshotPropValue.ts';
import SnapshotVersionVector from './SnapshotVersionVector.ts';

/**
 * Public immutable read-side view of materialized graph state.
 */
export default class SnapshotWarpState {
  readonly nodeAlive: SnapshotORSet;
  readonly edgeAlive: SnapshotORSet;
  readonly prop: ReadonlyMap<string, LWWRegister<SnapshotPropValue>>;
  readonly observedFrontier: SnapshotVersionVector;
  readonly edgeBirthEvent: ReadonlyMap<string, EventId>;

  constructor(fields: {
    nodeAlive: SnapshotORSet;
    edgeAlive: SnapshotORSet;
    prop: ReadonlyMap<string, LWWRegister<SnapshotPropValue>>;
    observedFrontier: SnapshotVersionVector;
    edgeBirthEvent: ReadonlyMap<string, EventId>;
  }) {
    this.nodeAlive = fields.nodeAlive;
    this.edgeAlive = fields.edgeAlive;
    this.prop = fields.prop;
    this.observedFrontier = fields.observedFrontier;
    this.edgeBirthEvent = fields.edgeBirthEvent;
    Object.freeze(this);
  }
}
