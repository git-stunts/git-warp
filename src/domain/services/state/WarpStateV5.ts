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
import { lwwMax, type LWWRegister } from '../../crdt/LWW.ts';
import { compareEventIds, type EventId } from '../../utils/EventId.ts';

/**
 * Minimal shape that `WarpStateV5.join` / `cloneFromSnapshot` accept when
 * hydrating a deserialized or plain-object state (e.g. from a checkpoint).
 */
export type WarpStateV5Snapshot = {
  readonly nodeAlive: ORSet;
  readonly edgeAlive: ORSet;
  readonly prop: Map<string, LWWRegister<unknown>>;
  readonly observedFrontier: VersionVector;
  readonly edgeBirthEvent?: Map<string, EventId>;
};

/**
 * Minimal shape for a patch that can be folded into a state's frontier.
 * (The caller supplies `writer`, `lamport`, and a version-vector context.)
 */
export type FrontierPatch = {
  readonly writer: string;
  readonly lamport: number;
  readonly context: VersionVector | Map<string, number> | Record<string, number> | null | undefined;
};

/**
 * The CRDT materialized state for a WARP graph.
 *
 * Instances are mutable during reduce (patch application) but should
 * be cloned before handing to consumers that expect isolation.
 */
export default class WarpStateV5 {
  nodeAlive: ORSet;
  edgeAlive: ORSet;
  prop: Map<string, LWWRegister<unknown>>;
  observedFrontier: VersionVector;
  /** EdgeKey → EventId of most recent EdgeAdd (for clean-slate prop visibility). */
  edgeBirthEvent: Map<string, EventId>;

  constructor(fields: {
    nodeAlive: ORSet;
    edgeAlive: ORSet;
    prop: Map<string, LWWRegister<unknown>>;
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
  static empty(): WarpStateV5 {
    return new WarpStateV5({
      nodeAlive: ORSet.empty(),
      edgeAlive: ORSet.empty(),
      prop: new Map(),
      observedFrontier: VersionVector.empty(),
      edgeBirthEvent: new Map(),
    });
  }

  /** Creates a deep clone with independent data structures. */
  clone(): WarpStateV5 {
    return new WarpStateV5({
      nodeAlive: this.nodeAlive.clone(),
      edgeAlive: this.edgeAlive.clone(),
      prop: new Map(this.prop),
      observedFrontier: this.observedFrontier.clone(),
      edgeBirthEvent: new Map(this.edgeBirthEvent),
    });
  }

  /**
   * Normalizes a plain-object or deserialized state into a live
   * `WarpStateV5` instance with cloned inner structures. Used by the
   * reducer and checkpoint loader to accept either class instances or
   * hydrated POJOs at the boundary.
   */
  static cloneFromSnapshot(state: WarpStateV5 | WarpStateV5Snapshot): WarpStateV5 {
    if (state instanceof WarpStateV5) {
      return state.clone();
    }
    return new WarpStateV5({
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
  join(other: WarpStateV5): WarpStateV5 {
    return new WarpStateV5({
      nodeAlive: this.nodeAlive.join(other.nodeAlive),
      edgeAlive: this.edgeAlive.join(other.edgeAlive),
      prop: WarpStateV5._mergeProps(this.prop, other.prop),
      observedFrontier: this.observedFrontier.merge(other.observedFrontier),
      edgeBirthEvent: WarpStateV5._mergeEdgeBirthEvent(this.edgeBirthEvent, other.edgeBirthEvent),
    });
  }

  /**
   * Folds a patch's context version vector AND its own dot
   * (writer, lamport) into this state's `observedFrontier`. Mutates
   * `this.observedFrontier` in place.
   */
  foldPatch(patch: FrontierPatch): void {
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
    a: Map<string, LWWRegister<unknown>>,
    b: Map<string, LWWRegister<unknown>>,
  ): Map<string, LWWRegister<unknown>> {
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
