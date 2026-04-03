/**
 * WarpStateV5 — the core CRDT materialized state object.
 *
 * Holds the alive sets (OR-Set for nodes and edges), property registers
 * (LWW), the observed version vector frontier, and edge birth events.
 *
 * @module domain/services/WarpStateV5
 */

import { createORSet, orsetClone } from '../crdt/ORSet.js';
import VersionVector from '../crdt/VersionVector.js';

/**
 * The CRDT materialized state for a WARP graph.
 *
 * Instances are mutable during reduce (patch application) but should
 * be cloned before handing to consumers that expect isolation.
 */
export default class WarpStateV5 {
  /** @type {import('../crdt/ORSet.js').default} */
  nodeAlive;

  /** @type {import('../crdt/ORSet.js').default} */
  edgeAlive;

  /** @type {Map<string, import('../crdt/LWW.js').LWWRegister<unknown>>} */
  prop;

  /** @type {import('../crdt/VersionVector.js').default} */
  observedFrontier;

  /**
   * EdgeKey → EventId of most recent EdgeAdd (for clean-slate prop visibility).
   * @type {Map<string, import('../utils/EventId.js').EventId>}
   */
  edgeBirthEvent;

  /**
   * Creates a WarpStateV5 from field values.
   *
   * @param {{
   *   nodeAlive: import('../crdt/ORSet.js').default,
   *   edgeAlive: import('../crdt/ORSet.js').default,
   *   prop: Map<string, import('../crdt/LWW.js').LWWRegister<unknown>>,
   *   observedFrontier: import('../crdt/VersionVector.js').default,
   *   edgeBirthEvent?: Map<string, import('../utils/EventId.js').EventId>
   * }} fields
   */
  constructor({ nodeAlive, edgeAlive, prop, observedFrontier, edgeBirthEvent }) {
    this.nodeAlive = nodeAlive;
    this.edgeAlive = edgeAlive;
    this.prop = prop;
    this.observedFrontier = observedFrontier;
    this.edgeBirthEvent = edgeBirthEvent ?? /** @type {Map<string, import('../utils/EventId.js').EventId>} */ (new Map());
  }

  /**
   * Creates an empty state with fresh OR-Sets and version vector.
   *
   * @returns {WarpStateV5}
   */
  static empty() {
    return new WarpStateV5({
      nodeAlive: createORSet(),
      edgeAlive: createORSet(),
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
      nodeAlive: orsetClone(this.nodeAlive),
      edgeAlive: orsetClone(this.edgeAlive),
      prop: new Map(this.prop),
      observedFrontier: this.observedFrontier.clone(),
      edgeBirthEvent: new Map(this.edgeBirthEvent),
    });
  }
}
