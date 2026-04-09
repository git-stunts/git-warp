/**
 * WarpStateV5 — the core CRDT materialized state object.
 *
 * Holds the alive sets (OR-Set for nodes and edges), property registers
 * (LWW), the observed version vector frontier, and edge birth events.
 *
 * @module domain/services/state/WarpStateV5
 */

import ORSet from '../../crdt/ORSet.ts';
import VersionVector from '../../crdt/VersionVector.ts';

/**
 * The CRDT materialized state for a WARP graph.
 *
 * Instances are mutable during reduce (patch application) but should
 * be cloned before handing to consumers that expect isolation.
 */
export default class WarpStateV5 {
  /** @type {import('../../crdt/ORSet.ts').default} */
  nodeAlive;

  /** @type {import('../../crdt/ORSet.ts').default} */
  edgeAlive;

  /** @type {Map<string, import('../../crdt/LWW.ts').LWWRegister<unknown>>} */
  prop;

  /** @type {import('../../crdt/VersionVector.ts').default} */
  observedFrontier;

  /**
   * EdgeKey → EventId of most recent EdgeAdd (for clean-slate prop visibility).
   * @type {Map<string, import('../../utils/EventId.ts').EventId>}
   */
  edgeBirthEvent;

  /**
   * Creates a WarpStateV5 from field values.
   *
   * @param {{
   *   nodeAlive: import('../../crdt/ORSet.ts').default,
   *   edgeAlive: import('../../crdt/ORSet.ts').default,
   *   prop: Map<string, import('../../crdt/LWW.ts').LWWRegister<unknown>>,
   *   observedFrontier: import('../../crdt/VersionVector.ts').default,
   *   edgeBirthEvent?: Map<string, import('../../utils/EventId.ts').EventId>
   * }} fields
   */
  constructor({ nodeAlive, edgeAlive, prop, observedFrontier, edgeBirthEvent }) {
    this.nodeAlive = nodeAlive;
    this.edgeAlive = edgeAlive;
    this.prop = prop;
    this.observedFrontier = observedFrontier;
    this.edgeBirthEvent = edgeBirthEvent ?? /** @type {Map<string, import('../../utils/EventId.ts').EventId>} */ (new Map());
  }

  /**
   * Creates an empty state with fresh OR-Sets and version vector.
   *
   * @returns {WarpStateV5}
   */
  static empty() {
    return new WarpStateV5({
      nodeAlive: ORSet.empty(),
      edgeAlive: ORSet.empty(),
      prop: new Map(),
      observedFrontier: VersionVector.empty(),
      edgeBirthEvent: new Map(),
    });
  }

  /**
   * Creates a deep clone with independent data structures.
   *
   * @returns {WarpStateV5}
   */
  clone() {
    return new WarpStateV5({
      nodeAlive: this.nodeAlive.clone(),
      edgeAlive: this.edgeAlive.clone(),
      prop: new Map(this.prop),
      observedFrontier: this.observedFrontier.clone(),
      edgeBirthEvent: new Map(this.edgeBirthEvent),
    });
  }
}
